import { expect, spyOn, test } from "bun:test";
import { api } from "../src/lib/api";
import { db } from "../src/lib/db";
import { onVersionCreated, pumpJobs, startHumanize } from "../src/lib/jobs";
import { humanizeCost } from "../src/lib/pricing";
import { humanizeSettings, type Preferences } from "../src/lib/settings";
import { store } from "../src/lib/store";
import type { Doc } from "../src/lib/types";

test("preservation settings and results survive starting and resuming stored jobs", async () => {
  const saved = new Map<string, Doc>();
  const all = spyOn(db, "all").mockResolvedValue([]);
  const put = spyOn(db, "put").mockImplementation(async (doc) => {
    saved.set(doc.id, structuredClone(doc));
    return doc.id;
  });
  const clear = spyOn(db, "clear").mockResolvedValue(undefined);
  const preservation = { frozenCount: 1, preservedCount: 1, mode: "inline", fallbackUsed: true } as const;
  const start = spyOn(api, "humanizeStart").mockResolvedValue({
    runId: "saved-run", status: "queued", done: false, text: null, score: null, error: null,
  });
  const poll = spyOn(api, "humanizeRun").mockResolvedValue({
    runId: "saved-run", status: "completed", done: true,
    text: "We use ${important} tools.", score: 90, error: null, preservation,
  });
  let unsubscribe = () => {};
  try {
    await store.init();
    const prefs: Preferences = {
      model: "lite", qualityMode: "fast", outputFormat: "text", thenCheck: false, pangramModel: "pangram-4",
      preservation: true, preservationOpen: "${", preservationClose: "}", preservationMaxLookahead: 20, preservationMode: "inline",
    };
    const settings = humanizeSettings(prefs);
    expect(humanizeSettings({ ...prefs, preservation: false })).not.toHaveProperty("preservationOpen");
    const doc = store.create("We utilize ${important} tools.", "Preserved document");
    const ready = () => new Promise<void>((resolve) => {
      unsubscribe = onVersionCreated(() => { unsubscribe(); resolve(); });
    });
    const first = ready();
    startHumanize(doc.id, doc.versions[0]!.id, settings);
    const job = saved.get(doc.id)!.jobs[0]!;
    expect(job).toMatchObject({ settings, sourceId: doc.versions[0]!.id });
    expect(start).toHaveBeenCalledWith(doc.versions[0]!.text, settings, job.id);
    await first;
    const result = saved.get(doc.id)!.versions.at(-1)!;
    expect(result.humanize).toMatchObject({ settings, preservation, costUsd: humanizeCost("lite", 3, 3) });

    // Rehydrate a serialized job with an upstream run ID, as after a reload.
    const resumed = ready();
    store.update(doc.id, (d) => ({ ...d, jobs: [{ ...JSON.parse(JSON.stringify(job)), id: "resumed-job", runId: "saved-run" }] }));
    pumpJobs();
    await resumed;
    expect(start).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledWith("saved-run");
    expect(saved.get(doc.id)!.versions.at(-1)!.humanize).toMatchObject({ settings, preservation });
    expect(saved.get(doc.id)!.jobs).toEqual([]);
  } finally {
    unsubscribe();
    store.clear();
    for (const spy of [all, put, clear, start, poll]) spy.mockRestore();
  }
}, 10_000);
