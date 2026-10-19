import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  BracketsCurlyIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FileCsvIcon,
  PrinterIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { download, formatRelativeTime, safeUrl } from "../../lib/format";
import { startPangram } from "../../lib/jobs";
import { buildSegments, computeStats, plagRanges, segmentsCsv, summaryText, type SegClass } from "../../lib/pangram";
import { navigate } from "../../lib/router";
import { toasts, versionLabel } from "../../lib/store";
import type { Doc, PangramCheck, Version } from "../../lib/types";
import { VerdictBadge } from "../common";
import { DocumentPane, type Highlights } from "./DocumentPane";
import { Graph } from "./Graph";
import { Overview } from "./Overview";
import { Segments } from "./Segments";
import { Versions } from "./Versions";

type ReportTab = "overview" | "graph" | "segments" | "versions";

export function Report({ doc, version, check, model }: { doc: Doc; version: Version; check: PangramCheck; model: string }) {
  const [tab, setTab] = useState<ReportTab>("overview");
  const [selected, setSelected] = useState(-1);
  const [filter, setFilter] = useState<SegClass | "all">("all");
  const [highlights, setHighlights] = useState<Highlights>({ ai: true, assisted: true, human: true, plag: true });

  const segModel = useMemo(() => buildSegments(check.result, version.text), [check, version.text]);
  const stats = useMemo(() => computeStats(check.result, segModel), [check, segModel]);
  const ranges = useMemo(() => plagRanges(version.plagiarism, segModel.text), [version.plagiarism, segModel]);
  const segments = segModel.segments;
  const label = versionLabel(doc, version);

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

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-kumo-subtle">
          <VerdictBadge result={check.result} />
          <span className="truncate">
            {label} checked {formatRelativeTime(check.checkedAt).toLowerCase()} with <b className="font-medium text-kumo-default">{check.model}</b>
          </span>
        </div>
        <Button size="sm" icon={ArrowClockwiseIcon} onClick={() => startPangram(doc.id, version.id, model)}>
          Re-check
        </Button>
        {safeUrl(check.result.dashboard_link) && (
          <a
            href={safeUrl(check.result.dashboard_link)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-kumo-default ring-1 ring-kumo-line hover:bg-kumo-tint"
          >
            <ArrowSquareOutIcon size={16} />
            Pangram dashboard
          </a>
        )}
        <DropdownMenu>
          <DropdownMenu.Trigger render={<Button size="sm" icon={DownloadSimpleIcon}>Export</Button>} />
          <DropdownMenu.Content align="end">
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
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <DocumentPane
          title={`${doc.title} · ${label}`}
          checkedAt={check.checkedAt}
          model={segModel}
          ranges={ranges}
          counts={stats.segCounts}
          highlights={highlights}
          onToggle={(k) => setHighlights({ ...highlights, [k]: !highlights[k] })}
          selected={selected}
          onSelect={(i) => {
            select(i, false);
            setTab("segments");
          }}
        />

        <LayerCard className="min-w-0 xl:sticky xl:top-4">
          <LayerCard.Secondary className="no-print overflow-x-auto px-3 py-2">
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
                { value: "versions", label: `Versions · ${doc.versions.length}` },
              ]}
            />
          </LayerCard.Secondary>
          <LayerCard.Primary className="p-0">
            {tab === "overview" && <Overview docId={doc.id} version={version} check={check} stats={stats} segments={segments.length} />}
            {tab === "graph" && <Graph segments={segments} selected={selected} onSelect={select} />}
            {tab === "segments" && <Segments segments={segments} selected={selected} onSelect={select} filter={filter} onFilter={setFilter} />}
            {tab === "versions" && (
              <Versions
                doc={doc}
                selectedId={version.id}
                model={model}
                onSelect={(versionId) => navigate({ tab: "pangram", docId: doc.id, versionId })}
              />
            )}
          </LayerCard.Primary>
        </LayerCard>
      </div>
    </div>
  );
}
