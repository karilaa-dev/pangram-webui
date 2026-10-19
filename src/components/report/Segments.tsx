import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Meter } from "@cloudflare/kumo/components/meter";
import { cn } from "@cloudflare/kumo/utils";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { num, pct } from "../../lib/format";
import { LABELS, type SegClass, type Segment } from "../../lib/pangram";
import { SEG_BADGE, SectionTitle, Swatch } from "../common";

const BAR: Record<SegClass, string> = { ai: "bg-zw-ai", assisted: "bg-zw-assisted", human: "bg-zw-human" };
const BORDER: Record<SegClass, string> = { ai: "border-zw-ai", assisted: "border-zw-assisted", human: "border-zw-human" };

export function SegRow({ seg, selected, onSelect }: { seg: Segment; selected: boolean; onSelect: (i: number) => void }) {
  const preview = seg.text.trim();
  return (
    <button
      data-i={seg.index}
      onClick={() => onSelect(seg.index)}
      className={cn(
        "flex w-full items-stretch gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-kumo-tint",
        selected && "bg-kumo-tint ring-1 ring-kumo-line",
      )}
    >
      <span className={cn("w-1 shrink-0 rounded-full", BAR[seg.cls])} />
      <span className="line-clamp-2 min-w-0 flex-1 text-kumo-default">
        <b className="mr-1.5 text-kumo-subtle">#{seg.index + 1}</b>
        {preview.slice(0, 160)}
        {preview.length > 160 && "…"}
      </span>
      <span className="shrink-0 text-right text-xs text-kumo-subtle">
        {pct(seg.score)}
        <br />
        {num(seg.words)}w
      </span>
    </button>
  );
}

export function Segments({
  segments,
  selected,
  onSelect,
  filter,
  onFilter,
}: {
  segments: Segment[];
  selected: number;
  onSelect: (i: number) => void;
  filter: SegClass | "all";
  onFilter: (f: SegClass | "all") => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const current = Math.max(0, selected);
  const s = segments[current];

  useEffect(() => {
    list.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  if (!s) return <div className="px-5 py-10 text-center text-sm text-kumo-subtle">No segment data available for this check.</div>;

  const counts = { ai: 0, assisted: 0, human: 0 };
  for (const x of segments) counts[x.cls]++;
  const visible = segments.filter((x) => filter === "all" || x.cls === filter);

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" shape="square" icon={CaretLeftIcon} aria-label="Previous segment" disabled={current === 0} onClick={() => onSelect(current - 1)} />
        <div className="text-sm font-medium">
          Segment {s.index + 1} <span className="font-normal text-kumo-subtle">of {segments.length}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          shape="square"
          icon={CaretRightIcon}
          aria-label="Next segment"
          disabled={current === segments.length - 1}
          onClick={() => onSelect(current + 1)}
        />
      </div>

      <div className="rounded-lg bg-kumo-elevated p-4 ring-1 ring-kumo-hairline">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge variant={SEG_BADGE[s.cls]}>{s.label}</Badge>
          {s.confidence && <Badge variant="neutral">{s.confidence} confidence</Badge>}
          {s.humanized && <Badge variant="purple">Humanized</Badge>}
        </div>
        <blockquote className={cn("mb-4 border-l-2 pl-3 text-sm leading-6 whitespace-pre-wrap", BORDER[s.cls])}>{s.text.trim()}</blockquote>
        <div className="flex flex-col gap-3">
          {s.score !== null && (
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-kumo-subtle">AI assistance score</span>
                <b>{pct(s.score, 1)}</b>
              </div>
              <div className="relative h-2 rounded-full bg-linear-to-r from-zw-human via-zw-assisted to-zw-ai">
                <span
                  className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-kumo-base ring-2 ring-kumo-strong"
                  style={{ left: `${s.score * 100}%` }}
                />
              </div>
            </div>
          )}
          {s.humanizerScore !== null && (
            <Meter label="Humanizer score" value={s.humanizerScore * 100} customValue={pct(s.humanizerScore, 1)} />
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Words", num(s.words)],
            ["Tokens", num(s.tokens)],
            ["Characters", `${num(s.start)}–${num(s.end)}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-kumo-base px-2 py-1.5 ring-1 ring-kumo-hairline">
              <div className="text-[11px] text-kumo-subtle">{k}</div>
              <div className="text-sm font-medium">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SectionTitle aside="← → to navigate">All segments</SectionTitle>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(["all", "ai", "assisted", "human"] as const)
            .filter((k) => k === "all" || counts[k])
            .map((k) => (
              <button
                key={k}
                aria-pressed={filter === k}
                onClick={() => onFilter(k)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs ring-1 ring-kumo-hairline transition-colors hover:bg-kumo-tint",
                  filter === k && "bg-kumo-contrast text-kumo-inverse ring-kumo-contrast hover:bg-kumo-contrast",
                )}
              >
                {k !== "all" && <Swatch cls={k} />}
                {k === "all" ? "All" : LABELS[k]} {k === "all" ? segments.length : counts[k]}
              </button>
            ))}
        </div>
        <div ref={list} className="flex flex-col gap-0.5">
          {visible.length ? (
            visible.map((x) => <SegRow key={x.index} seg={x} selected={x.index === selected} onSelect={onSelect} />)
          ) : (
            <div className="py-6 text-center text-sm text-kumo-subtle">No segments in this category.</div>
          )}
        </div>
      </div>
    </div>
  );
}
