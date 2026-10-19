import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  BracketsCurlyIcon,
  CopyIcon,
  DotsThreeIcon,
  FileCsvIcon,
  PrinterIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { countWords, download, safeUrl } from "../../lib/format";
import { STAGE_LABELS, pangramJobFor, retryJob, startPangram } from "../../lib/jobs";
import { buildSegments, computeStats, plagRanges, segmentsCsv, summaryText, type SegClass } from "../../lib/pangram";
import { pangramCost, usd } from "../../lib/pricing";
import { usePreferences } from "../../lib/settings";
import { toasts, versionLabel } from "../../lib/store";
import type { Doc, PangramCheck, Version } from "../../lib/types";
import { CopyButton } from "../common";
import { Columns, TextPanel } from "../Layout";
import { HighlightToggles, HighlightedText, type Highlights } from "./DocumentPane";
import { Graph } from "./Graph";
import { Overview } from "./Overview";
import { Segments } from "./Segments";

type ReportTab = "overview" | "graph" | "segments";

/** Pangram tab for a checked version: the highlighted text plus the detailed report. */
export function PangramReport({ doc, version, check }: { doc: Doc; version: Version; check: PangramCheck }) {
  const [prefs] = usePreferences();
  const [tab, setTab] = useState<ReportTab>("overview");
  const [selected, setSelected] = useState(-1);
  const [filter, setFilter] = useState<SegClass | "all">("all");
  const [highlights, setHighlights] = useState<Highlights>({ ai: true, assisted: true, human: true, plag: true });

  const segModel = useMemo(() => buildSegments(check.result, version.text), [check, version.text]);
  const stats = useMemo(() => computeStats(check.result, segModel), [check, segModel]);
  const ranges = useMemo(() => plagRanges(version.plagiarism, segModel.text), [version.plagiarism, segModel]);
  const segments = segModel.segments;
  const label = versionLabel(doc, version);
  const job = pangramJobFor(doc, version.id);
  const dashboard = safeUrl(check.result.dashboard_link);

  function select(i: number, scroll = true) {
    if (i < 0 || i >= segments.length) return;
    setSelected(i);
    if (scroll) document.querySelector(`.zw-doc .seg[data-i="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [role='dialog'], [role='tablist'], [role='menu'], [role='listbox']")) return;
      const delta = e.key === "ArrowRight" || e.key === "j" ? 1 : e.key === "ArrowLeft" || e.key === "k" ? -1 : 0;
      if (!delta || !segments.length) return;
      e.preventDefault();
      setTab("segments");
      setSelected((cur) => {
        const next = Math.min(segments.length - 1, Math.max(0, (cur < 0 ? (delta > 0 ? -1 : 1) : cur) + delta));
        document.querySelector(`.zw-doc .seg[data-i="${next}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return next;
      });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [segments.length]);

  async function exportAs(kind: "print" | "copy" | "csv" | "json") {
    const stamp = new Date(check.checkedAt).toISOString().slice(0, 10);
    const slug = `${doc.title.slice(0, 40).replace(/[^\w-]+/g, "-").toLowerCase()}-${label.toLowerCase()}`;
    if (kind === "print") window.print();
    if (kind === "copy") {
      try {
        await navigator.clipboard.writeText(summaryText(check, segModel, doc.title, label));
        toasts.add({ title: "Summary copied to clipboard" });
      } catch {
        toasts.add({ title: "Could not access the clipboard", variant: "error" });
      }
    }
    if (kind === "csv") download(`pangram-${slug}-${stamp}.csv`, segmentsCsv(segments), "text/csv");
    if (kind === "json") {
      const payload = { ...check.result, version: label, plagiarism: version.plagiarism, notes: doc.notes || undefined, tags: doc.tags };
      download(`pangram-${slug}-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
    }
  }

  const text = (
    <TextPanel
      toolbar={
        <HighlightToggles
          highlights={highlights}
          onToggle={(k) => setHighlights({ ...highlights, [k]: !highlights[k] })}
          counts={stats.segCounts}
          plagCount={ranges.length}
        />
      }
      actions={<CopyButton text={version.text} />}
    >
      <HighlightedText
        model={segModel}
        ranges={ranges}
        highlights={highlights}
        selected={selected}
        onSelect={(i) => {
          select(i, false);
          setTab("segments");
        }}
      />
    </TextPanel>
  );

  const report = (
    <LayerCard className="min-w-0">
      <LayerCard.Secondary className="no-print flex items-center gap-2 py-2 pr-2 pl-3">
        <Tabs
          variant="underline"
          value={tab}
          onValueChange={(t) => {
            setTab(t as ReportTab);
            if (t === "segments" && selected < 0 && segments.length) setSelected(0);
          }}
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "graph", label: "Graph" },
            { value: "segments", label: "Segments" },
          ]}
        />
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={<Button size="sm" variant="ghost" shape="square" icon={DotsThreeIcon} aria-label="Report actions" className="ml-auto" />}
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item icon={ArrowClockwiseIcon} onClick={() => startPangram(doc.id, version.id, prefs.pangramModel)}>
              Re-check with {prefs.pangramModel} (≈ {usd(pangramCost(prefs.pangramModel, countWords(version.text)))})
            </DropdownMenu.Item>
            {dashboard && (
              <DropdownMenu.LinkItem icon={ArrowSquareOutIcon} href={dashboard} target="_blank">
                Open in Pangram dashboard
              </DropdownMenu.LinkItem>
            )}
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={PrinterIcon} onClick={() => exportAs("print")}>
              Print / save as PDF
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={CopyIcon} onClick={() => exportAs("copy")}>
              Copy summary
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={FileCsvIcon} onClick={() => exportAs("csv")}>
              Segments as CSV
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={BracketsCurlyIcon} onClick={() => exportAs("json")}>
              Full API response (JSON)
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </LayerCard.Secondary>
      <LayerCard.Primary className="p-0">
        {job && (
          <div className="no-print px-5 pt-4">
            {job.error ? (
              <Banner
                size="sm"
                variant="error"
                icon={<WarningCircleIcon weight="fill" />}
                description={`Re-check failed: ${job.error}`}
                action={<Banner.Action onClick={() => retryJob(doc.id, job.id)}>Retry</Banner.Action>}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-kumo-subtle">
                <Loader size="sm" /> Re-checking · {STAGE_LABELS[job.status] ?? "Working…"}
              </div>
            )}
          </div>
        )}
        {tab === "overview" && <Overview docId={doc.id} version={version} check={check} stats={stats} segments={segments.length} />}
        {tab === "graph" && <Graph segments={segments} selected={selected} onSelect={select} />}
        {tab === "segments" && <Segments segments={segments} selected={selected} onSelect={select} filter={filter} onFilter={setFilter} />}
      </LayerCard.Primary>
    </LayerCard>
  );

  return <Columns text={text} side={report} />;
}
