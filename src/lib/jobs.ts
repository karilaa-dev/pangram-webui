import { HttpError, api } from "./api";
import { countWords } from "./format";
import { humanizeCost, pangramCost } from "./pricing";
import { observable, store, toasts, versionLabel } from "./store";
import type { Doc, HumanizeJob, HumanizeSettings, Job, PangramJob, Version } from "./types";

// Humanize runs and Pangram checks are asynchronous on both APIs. Jobs are
// stored on the document (with their run/task id) so they resume after a
// reload instead of losing a paid result.

const HUMANIZE_POLL_MS = 3000;
const HUMANIZE_TIMEOUT_MS = 20 * 60 * 1000;
const PANGRAM_POLL_MS = 1500;
const PANGRAM_TIMEOUT_MS = 6 * 60 * 1000;
const MAX_TRANSIENT_FAILURES = 5;

export const credits = observable<number | null>(null);

export function refreshCredits() {
  api
    .balance()
    .then((b) => credits.set(b.credits))
    .catch(() => {});
}

type VersionListener = (docId: string, versionId: string) => void;
const versionListeners = new Set<VersionListener>();
export function onVersionCreated(fn: VersionListener) {
  versionListeners.add(fn);
  return () => {
    versionListeners.delete(fn);
  };
}

// The upstream run itself failed: retrying needs a fresh run (and a new id,
// since the job id is the idempotency key). Other errors resume the same run.
class RunFailed extends Error {}

const running = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const findJob = (docId: string, jobId: string) => store.get(docId)?.jobs.find((j) => j.id === jobId);

function patchJob(docId: string, jobId: string, patch: Partial<Job>) {
  store.update(docId, (d) => ({
    ...d,
    jobs: d.jobs.map((j) => (j.id === jobId ? ({ ...j, ...patch } as Job) : j)),
  }));
}

function removeJob(doc: Doc, jobId: string): Doc {
  return { ...doc, jobs: doc.jobs.filter((j) => j.id !== jobId) };
}

// Network blips and 5xx responses while polling are retried; anything else fails the job.
const isTransient = (err: unknown) =>
  err instanceof HttpError && (err.status === 0 || (err.status >= 500 && err.status !== 503));

async function pollUntil<T extends { done: boolean }>(
  docId: string,
  jobId: string,
  intervalMs: number,
  deadline: number,
  fetchStatus: () => Promise<T>,
  onStatus: (r: T) => void,
): Promise<T | null> {
  let failures = 0;
  while (true) {
    await sleep(intervalMs);
    if (!findJob(docId, jobId)) return null; // dismissed or document deleted
    let result: T;
    try {
      result = await fetchStatus();
      failures = 0;
    } catch (err) {
      if (isTransient(err) && ++failures < MAX_TRANSIENT_FAILURES) continue;
      throw err;
    }
    onStatus(result);
    if (result.done) return result;
    if (Date.now() > deadline) throw new Error("Timed out waiting for a result");
  }
}

async function runHumanize(docId: string, job: HumanizeJob) {
  const source = store.get(docId)?.versions.find((v) => v.id === job.sourceId);
  if (!source) throw new Error("The source version no longer exists");

  let runId = job.runId;
  if (!runId) {
    // The job id doubles as the idempotency key, so a retried start never double-charges.
    const run = await api.humanizeStart(source.text, job.settings, job.id);
    runId = run.runId;
    patchJob(docId, job.id, { runId, status: run.status });
  }

  let status = job.status;
  const run = await pollUntil(
    docId,
    job.id,
    HUMANIZE_POLL_MS,
    job.startedAt + HUMANIZE_TIMEOUT_MS,
    () => api.humanizeRun(runId!),
    (r) => {
      if (r.status !== status) patchJob(docId, job.id, { status: (status = r.status) });
    },
  );
  if (!run) return;
  if (run.status !== "completed" || run.text === null) throw new RunFailed(run.error || `Run ${run.status}`);

  const text = run.text.trim();
  const costUsd = humanizeCost(job.settings.model, countWords(source.text), countWords(text));
  const version: Version = {
    id: crypto.randomUUID(),
    kind: "humanized",
    text,
    createdAt: Date.now(),
    sourceId: job.sourceId,
    humanize: { runId, settings: job.settings, score: run.score, creditsSpent: run.creditsSpent, costUsd },
  };
  store.update(docId, (d) => ({
    ...removeJob(d, job.id),
    versions: [...d.versions, version],
    spentUsd: (d.spentUsd ?? 0) + costUsd,
  }));
  if (run.remainingCredits !== null) credits.set(run.remainingCredits);
  else refreshCredits();

  const doc = store.get(docId)!;
  toasts.add({ title: `${versionLabel(doc, version)} is ready`, description: doc.title, variant: "success" });
  for (const l of versionListeners) l(docId, version.id);
  if (job.thenCheck) startPangram(docId, version.id, job.thenCheck);
}

async function runPangram(docId: string, job: PangramJob) {
  const version = store.get(docId)?.versions.find((v) => v.id === job.versionId);
  if (!version) throw new Error("The version no longer exists");

  let taskId = job.taskId;
  if (!taskId) {
    taskId = (await api.pangramSubmit(version.text, job.model)).taskId;
    patchJob(docId, job.id, { taskId, status: "STAGE_SUBMITTED" });
  }

  let stage = job.status;
  const task = await pollUntil(
    docId,
    job.id,
    PANGRAM_POLL_MS,
    job.startedAt + PANGRAM_TIMEOUT_MS,
    () => api.pangramTask(taskId!),
    (r) => {
      if (r.stage !== stage) patchJob(docId, job.id, { status: (stage = r.stage) });
    },
  );
  if (!task) return;
  if (task.error || !task.result) throw new RunFailed(task.error || "Pangram returned no result");

  const costUsd = pangramCost(job.model, countWords(version.text));
  const check = { model: job.model, checkedAt: Date.now(), result: { ...task.result, model: job.model }, costUsd };
  store.update(docId, (d) => ({
    ...removeJob(d, job.id),
    versions: d.versions.map((v) => (v.id === job.versionId ? { ...v, pangram: check } : v)),
    spentUsd: (d.spentUsd ?? 0) + costUsd,
  }));
  const doc = store.get(docId)!;
  toasts.add({
    title: `Pangram: ${task.result.headline || task.result.prediction_short || "check complete"}`,
    description: `${doc.title} · ${versionLabel(doc, version)}`,
  });
}

/** Start any stored jobs that are not already running (call after load and after adding jobs). */
export function pumpJobs() {
  for (const doc of store.all()) {
    for (const job of doc.jobs) {
      if (job.error || running.has(job.id)) continue;
      running.add(job.id);
      (job.type === "humanize" ? runHumanize(doc.id, job) : runPangram(doc.id, job))
        .catch((err: Error) => {
          if (!findJob(doc.id, job.id)) return;
          const fresh = err instanceof RunFailed ? { id: crypto.randomUUID(), runId: undefined, taskId: undefined } : {};
          patchJob(doc.id, job.id, { ...fresh, error: err.message || "Something went wrong" });
          toasts.add({
            title: job.type === "humanize" ? "Humanizing failed" : "Pangram check failed",
            description: err.message,
            variant: "error",
          });
        })
        .finally(() => running.delete(job.id));
    }
  }
}

export function startHumanize(docId: string, sourceId: string, settings: HumanizeSettings, thenCheck?: string) {
  const job: HumanizeJob = {
    id: crypto.randomUUID(),
    type: "humanize",
    sourceId,
    settings,
    thenCheck,
    status: "starting",
    startedAt: Date.now(),
  };
  store.update(docId, (d) => ({ ...d, jobs: [...d.jobs.filter((j) => !(j.type === "humanize" && j.error)), job] }));
  pumpJobs();
}

export function startPangram(docId: string, versionId: string, model: string) {
  const job: PangramJob = {
    id: crypto.randomUUID(),
    type: "pangram",
    versionId,
    model,
    status: "starting",
    startedAt: Date.now(),
  };
  store.update(docId, (d) => ({
    ...d,
    jobs: [...d.jobs.filter((j) => !(j.type === "pangram" && j.versionId === versionId)), job],
  }));
  pumpJobs();
}

export function dismissJob(docId: string, jobId: string) {
  store.update(docId, (d) => removeJob(d, jobId));
}

/** Retry a failed job: resumes polling an existing run, or starts a new one if it failed upstream. */
export function retryJob(docId: string, jobId: string) {
  patchJob(docId, jobId, { error: undefined, status: "starting", startedAt: Date.now() });
  pumpJobs();
}

export const pangramJobFor = (doc: Doc, versionId: string) =>
  doc.jobs.find((j): j is PangramJob => j.type === "pangram" && j.versionId === versionId);

export const humanizeJobs = (doc: Doc) => doc.jobs.filter((j): j is HumanizeJob => j.type === "humanize");

export const STAGE_LABELS: Record<string, string> = {
  starting: "Starting…",
  queued: "Queued at StealthGPT…",
  running: "Rewriting…",
  STAGE_SUBMITTED: "Submitted to Pangram…",
  STAGE_PROCESSING: "Scoring each segment…",
};
