import { Badge } from "@cloudflare/kumo/components/badge";
import { Loader } from "@cloudflare/kumo/components/loader";
import type { ReactNode } from "react";
import { countWords, formatDate, formatRelativeTime, num, pct } from "../lib/format";
import { pangramJobFor } from "../lib/jobs";
import { aiShare } from "../lib/pangram";
import { usd } from "../lib/pricing";
import { navigate, type Route } from "../lib/router";
import { HUMANIZER_MODELS, OUTPUT_FORMATS, QUALITY_MODES } from "../lib/settings";
import { KIND_LABELS, versionLabel } from "../lib/store";
import type { Doc, Services, Version } from "../lib/types";
import { VerdictBadge } from "./common";
import { versionCosts } from "./Cost";
import { DocHeader } from "./DocHeader";
import { HumanizeColumns } from "./HumanizeView";
import { PangramColumns } from "./PangramView";
import { VersionStrip } from "./VersionStrip";

/**
 * One layout for a document in both tabs: document header, versions, the
 * selected version's details, then its text on the left and the tab's tools
 * on the right. Switching tabs only changes the right column (and adds
 * Pangram highlights to the text).
 */
export function DocWorkspace({ doc, route, services }: { doc: Doc; route: Route; services: Services }) {
  const selected = doc.versions.find((v) => v.id === route.versionId) ?? doc.versions[doc.versions.length - 1]!;
  const Columns = route.tab === "humanize" ? HumanizeColumns : PangramColumns;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <DocHeader doc={doc} tab={route.tab} />
      <VersionStrip
        doc={doc}
        selectedId={selected.id}
        onSelect={(versionId) => navigate({ tab: route.tab, docId: doc.id, versionId })}
      />
      <VersionHeader doc={doc} version={selected} />
      <Columns key={selected.id} doc={doc} version={selected} services={services} />
    </div>
  );
}

/** The selected version at a glance: how it was made, what it cost, and how Pangram rated it. */
function VersionHeader({ doc, version }: { doc: Doc; version: Version }) {
  const source = version.sourceId ? doc.versions.find((v) => v.id === version.sourceId) : undefined;
  const job = pangramJobFor(doc, version.id);
  const costs = versionCosts(doc, version);
  const h = version.humanize;

  const items: { label: string; value: ReactNode; title?: string }[] = [];
  if (h) {
    items.push(
      { label: "Model", value: HUMANIZER_MODELS[h.settings.model as keyof typeof HUMANIZER_MODELS] ?? h.settings.model },
      { label: "Quality", value: QUALITY_MODES[h.settings.qualityMode] ?? h.settings.qualityMode },
      { label: "Output", value: OUTPUT_FORMATS[h.settings.outputFormat] ?? h.settings.outputFormat },
    );
    if (typeof h.score === "number") {
      items.push({ label: "Human score", value: `${Math.round(h.score)} / 100`, title: "StealthGPT's estimate; higher reads more human" });
    }
  }
  items.push({ label: "Words", value: num(countWords(version.text)) });
  if (costs.humanize || costs.pangram) {
    items.push({
      label: "Cost",
      value: [costs.humanize && `${usd(costs.humanize)} humanize`, costs.pangram && `${usd(costs.pangram)} Pangram`].filter(Boolean).join(" · "),
    });
  }
  items.push({
    label: "Pangram",
    value: version.pangram ? (
      <span className="flex items-center gap-1.5">
        <VerdictBadge result={version.pangram.result} />
        {pct(aiShare(version.pangram.result))} AI
      </span>
    ) : job && !job.error ? (
      <span className="flex items-center gap-1.5 text-kumo-subtle">
        <Loader size="sm" /> Checking
      </span>
    ) : (
      <span className={job?.error ? "text-kumo-danger" : "text-kumo-subtle"}>{job?.error ? "Check failed" : "Not checked"}</span>
    ),
  });
  items.push({ label: "Created", value: formatRelativeTime(version.createdAt), title: formatDate(version.createdAt) });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-7 gap-y-3 rounded-lg bg-kumo-base px-4 py-3 ring-1 ring-kumo-hairline">
      <div className="flex min-w-36 items-center gap-2">
        <span className="text-lg font-semibold text-kumo-strong">{versionLabel(doc, version)}</span>
        {version.kind !== "original" && (
          <Badge variant={version.kind === "edited" ? "purple" : "blue"}>{KIND_LABELS[version.kind]}</Badge>
        )}
        {source && <span className="text-xs text-kumo-subtle">from {versionLabel(doc, source)}</span>}
      </div>
      {items.map((item) => (
        <div key={item.label} title={item.title}>
          <div className="text-[11px] font-medium tracking-wide text-kumo-subtle uppercase">{item.label}</div>
          <div className="text-sm font-medium text-kumo-default">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
