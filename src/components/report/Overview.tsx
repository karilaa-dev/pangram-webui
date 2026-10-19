import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Meter } from "@cloudflare/kumo/components/meter";
import { cn } from "@cloudflare/kumo/utils";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { formatDate, num, pct, safeUrl } from "../../lib/format";
import { LABELS, plagSentences, plagSources, verdictClass, type SegClass, type Stats } from "../../lib/pangram";
import { store } from "../../lib/store";
import type { PangramCheck, Version } from "../../lib/types";
import { SEG_BADGE, SectionTitle, Swatch } from "../common";

const VERDICT_RING: Record<SegClass, string> = {
  ai: "border-l-zw-ai",
  assisted: "border-l-zw-assisted",
  human: "border-l-zw-human",
};

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="border-b border-kumo-hairline px-5 py-4 last:border-b-0">
      <SectionTitle aside={aside}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function Overview({
  docId,
  version,
  check,
  stats,
  segments,
}: {
  docId: string;
  version: Version;
  check: PangramCheck;
  stats: Stats;
  segments: number;
}) {
  const d = check.result;
  const vcls = verdictClass(d);
  const dashboard = safeUrl(d.dashboard_link);
  const { fractions: f, segCounts: sc } = stats;
  const confMax = Math.max(1, ...Object.values(stats.conf));

  return (
    <div>
      <section className="px-5 pt-5 pb-4">
        <div className={cn("rounded-lg border-l-4 bg-kumo-elevated px-4 py-3.5 ring-1 ring-kumo-hairline", VERDICT_RING[vcls])}>
          <div className="flex items-center justify-between gap-2 text-xs text-kumo-subtle">
            <span>Pangram verdict</span>
            {d.prediction_short && <Badge variant={SEG_BADGE[vcls]}>{d.prediction_short}</Badge>}
          </div>
          <div className="mt-1 text-xl font-semibold text-kumo-strong">{d.headline || d.prediction || "Result"}</div>
          {d.prediction && d.prediction !== d.headline && <p className="mt-1 text-sm text-kumo-subtle">{d.prediction}</p>}
        </div>
      </section>

      <Section title="Composition" aside={`${segments} segment${segments === 1 ? "" : "s"}`}>
        <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-kumo-recessed" role="img" aria-label={`AI ${pct(f.ai)}, AI-assisted ${pct(f.assisted)}, human ${pct(f.human)}`}>
          {f.ai > 0 && <div className="bg-zw-ai" style={{ width: `${f.ai * 100}%` }} />}
          {f.assisted > 0 && <div className="bg-zw-assisted" style={{ width: `${f.assisted * 100}%` }} />}
          {f.human > 0 && <div className="bg-zw-human" style={{ width: `${f.human * 100}%` }} />}
        </div>
        <div className="flex flex-col gap-1.5">
          {(["ai", "assisted", "human"] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <Swatch cls={k} />
              <span>{LABELS[k]}</span>
              <span className="ml-auto text-xs text-kumo-subtle">
                {sc[k]} seg · {num(stats.wordsBy[k])} words
              </span>
              <span className="w-14 text-right font-medium">{pct(f[k], 1)}</span>
            </div>
          ))}
        </div>
      </Section>

      {stats.hasHumanizer && (
        <Section title="Humanizer detection" aside="Pangram 4">
          <div className="flex flex-col gap-3">
            <div>
              {stats.humanizedCount ? (
                <Badge variant="orange">
                  {stats.humanizedCount} of {segments} segment{segments === 1 ? "" : "s"} flagged
                </Badge>
              ) : (
                <Badge variant="green">No humanizer detected</Badge>
              )}
            </div>
            <p className="text-sm text-kumo-subtle">
              {stats.humanizedCount
                ? "Parts of this text look like AI output that was run through a humanizer or paraphrasing tool."
                : "No segment shows signs of AI humanizer or paraphrasing tools."}
            </p>
            <Meter label="Peak humanizer score" value={(stats.maxHumanizer || 0) * 100} customValue={pct(stats.maxHumanizer)} />
          </div>
        </Section>
      )}

      <Section title="Text statistics">
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Segments", num(segments)],
            ["Tokens", num(stats.tokens)],
            ["Avg AI assistance", pct(stats.weightedScore)],
            ["Peak AI assistance", pct(stats.maxScore)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-kumo-elevated px-3 py-2 ring-1 ring-kumo-hairline">
              <div className="text-xs text-kumo-subtle">{k}</div>
              <div className="text-base font-semibold text-kumo-strong">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Segment confidence">
        <div className="flex flex-col gap-1.5">
          {(["High", "Medium", "Low"] as const).map((k) => (
            <div key={k} className="grid grid-cols-[64px_1fr_28px] items-center gap-2 text-sm">
              <span className="text-kumo-subtle">{k}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-kumo-recessed">
                <div className="h-full rounded-full bg-kumo-brand" style={{ width: `${(stats.conf[k] / confMax) * 100}%` }} />
              </div>
              <span className="text-right">{stats.conf[k]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Plagiarism docId={docId} version={version} />

      <Section title="Analysis details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {[
            ["Analyzed", formatDate(check.checkedAt)],
            ["Model", check.model],
            ["Model version", d.version],
            ["Task ID", d.task_id],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-kumo-subtle">{k}</dt>
                <dd className="truncate text-right" title={String(v)}>
                  {v}
                </dd>
              </div>
            ))}
        </dl>
        {dashboard && (
          <a
            href={dashboard}
            target="_blank"
            rel="noopener noreferrer"
            className="no-print mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ring-1 ring-kumo-hairline hover:bg-kumo-tint"
          >
            <span className="min-w-0">
              <span className="block font-medium">Open in Pangram dashboard</span>
              <span className="block truncate text-xs text-kumo-subtle">{dashboard}</span>
            </span>
            <ArrowSquareOutIcon size={16} />
          </a>
        )}
      </Section>
    </div>
  );
}

function Plagiarism({ docId, version }: { docId: string; version: Version }) {
  const [state, setState] = useState<"idle" | "loading" | { error: string }>("idle");
  const p = version.plagiarism;

  async function run() {
    setState("loading");
    try {
      const data = await api.plagiarism(version.text);
      store.updateVersion(docId, version.id, { plagiarism: data });
      setState("idle");
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  if (state === "loading") {
    return (
      <Section title="Plagiarism">
        <div className="flex items-center gap-2 text-sm text-kumo-subtle">
          <Loader size="sm" /> Searching online sources… this can take up to a minute.
        </div>
      </Section>
    );
  }

  if (!p) {
    return (
      <Section title="Plagiarism">
        <p className="mb-3 text-sm text-kumo-subtle">
          {typeof state === "object" ? <span className="text-kumo-danger">{state.error}</span> : "Compare this version against online sources. Uses additional Pangram credits."}
        </p>
        <Button size="sm" onClick={run}>
          {typeof state === "object" ? "Try again" : "Run plagiarism check"}
        </Button>
      </Section>
    );
  }

  const detected = !!p.plagiarism_detected;
  const percent = typeof p.percent_plagiarized === "number" ? p.percent_plagiarized : null;
  // The API reports a percentage; normalise values given as fractions.
  const value = percent === null ? null : percent > 1 ? percent / 100 : percent;
  const sources = plagSources(p);
  const sentences = plagSentences(p);

  return (
    <Section title="Plagiarism" aside={`${num(p.total_sentences)} sentences checked`}>
      <div className="flex flex-col gap-3">
        <div>
          <Badge variant={detected ? "purple" : "green"}>{detected ? "Plagiarism detected" : "No plagiarism found"}</Badge>
        </div>
        <Meter label="Matched text" value={(value || 0) * 100} customValue={value === null ? "—" : pct(value, 1)} />
        {sentences.length > 0 && (
          <p className="text-sm text-kumo-subtle">
            {sentences.length} matching sentence{sentences.length === 1 ? "" : "s"} underlined in the document.
          </p>
        )}
        {sources.length > 0 && (
          <div className="flex flex-col gap-2">
            {sources.slice(0, 25).map((s, i) => (
              <div key={i} className="rounded-lg bg-kumo-elevated px-3 py-2 text-sm ring-1 ring-kumo-hairline">
                {safeUrl(s.url) ? (
                  <a href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer" className="font-medium text-kumo-link hover:underline">
                    {s.title || s.url}
                  </a>
                ) : (
                  s.title && <span className="font-medium">{s.title}</span>
                )}
                {typeof s.score === "number" && <span className="text-kumo-subtle"> · {pct(s.score > 1 ? s.score / 100 : s.score)}</span>}
                {s.text && <q className="mt-1 block text-xs text-kumo-subtle">{s.text.length > 240 ? `${s.text.slice(0, 240)}…` : s.text}</q>}
              </div>
            ))}
          </div>
        )}
        <div className="no-print">
          <Button size="xs" variant="ghost" onClick={run}>
            Run again
          </Button>
        </div>
      </div>
    </Section>
  );
}
