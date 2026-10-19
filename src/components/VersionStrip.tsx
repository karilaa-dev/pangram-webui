import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { cn } from "@cloudflare/kumo/utils";
import { SparkleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { countWords, formatRelativeTime, num, pct } from "../lib/format";
import { STAGE_LABELS, dismissJob, humanizeJobs, pangramJobFor, retryJob } from "../lib/jobs";
import { aiShare } from "../lib/pangram";
import { KIND_LABELS, versionLabel } from "../lib/store";
import type { Doc, HumanizeJob, Version } from "../lib/types";
import { VerdictBadge } from "./common";

export function VersionStrip({
  doc,
  selectedId,
  onSelect,
}: {
  doc: Doc;
  selectedId: string;
  onSelect: (versionId: string) => void;
}) {
  return (
    <div className="no-print -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pt-1 pb-2" role="group" aria-label="Versions">
      {doc.versions.map((v) => (
        <VersionCard key={v.id} doc={doc} version={v} selected={v.id === selectedId} onSelect={() => onSelect(v.id)} />
      ))}
      {humanizeJobs(doc).map((job, i) => (
        <JobCard key={job.id} doc={doc} job={job} label={`v${doc.versions.length + i}`} />
      ))}
    </div>
  );
}

function VersionCard({ doc, version, selected, onSelect }: { doc: Doc; version: Version; selected: boolean; onSelect: () => void }) {
  const job = pangramJobFor(doc, version.id);
  const source = version.sourceId ? doc.versions.find((v) => v.id === version.sourceId) : undefined;
  const score = version.humanize?.score;

  return (
    <button
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-48 shrink-0 flex-col gap-1.5 rounded-lg bg-kumo-base p-3 text-left ring-1 ring-kumo-hairline transition-shadow hover:ring-kumo-line",
        selected && "ring-2 ring-kumo-brand hover:ring-kumo-brand",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-kumo-strong">{versionLabel(doc, version)}</span>
        {version.kind !== "original" && <Badge variant={version.kind === "edited" ? "purple" : "blue"}>{KIND_LABELS[version.kind]}</Badge>}
      </div>
      <div className="truncate text-xs text-kumo-subtle">
        {num(countWords(version.text))} words · {source ? `from ${versionLabel(doc, source)}` : formatRelativeTime(version.createdAt)}
      </div>
      <div className="flex min-h-5 items-center gap-1.5 text-xs">
        {typeof score === "number" && (
          <span className="flex items-center gap-0.5 text-kumo-default" title="StealthGPT human score (higher reads more human)">
            <SparkleIcon size={12} weight="fill" className="text-kumo-brand" />
            {Math.round(score)}
          </span>
        )}
        {version.pangram ? (
          <>
            <VerdictBadge result={version.pangram.result} />
            <span className="text-kumo-subtle">{pct(aiShare(version.pangram.result))} AI</span>
          </>
        ) : job && !job.error ? (
          <span className="flex items-center gap-1 text-kumo-subtle">
            <Loader size="sm" /> Checking
          </span>
        ) : job?.error ? (
          <span className="text-kumo-danger">Check failed</span>
        ) : (
          <span className="text-kumo-subtle">Not checked</span>
        )}
      </div>
    </button>
  );
}

function JobCard({ doc, job, label }: { doc: Doc; job: HumanizeJob; label: string }) {
  const source = doc.versions.find((v) => v.id === job.sourceId);
  return (
    <div
      className={cn(
        "flex w-48 shrink-0 flex-col gap-1.5 rounded-lg border border-dashed p-3",
        job.error ? "border-kumo-danger/50" : "border-kumo-line",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-kumo-strong">
        {job.error ? <WarningCircleIcon size={16} className="text-kumo-danger" /> : <Loader size="sm" />}
        {label}
        <span className="truncate text-xs font-normal text-kumo-subtle">from {source ? versionLabel(doc, source) : "?"}</span>
      </div>
      {job.error ? (
        <>
          <div className="line-clamp-2 text-xs text-kumo-danger" title={job.error}>
            {job.error}
          </div>
          <div className="flex gap-1">
            <Button size="xs" onClick={() => retryJob(doc.id, job.id)}>
              Retry
            </Button>
            <Button size="xs" variant="ghost" onClick={() => dismissJob(doc.id, job.id)}>
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        <div className="text-xs text-kumo-subtle">{STAGE_LABELS[job.status] ?? job.status}</div>
      )}
    </div>
  );
}
