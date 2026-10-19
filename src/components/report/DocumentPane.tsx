import { cn } from "@cloudflare/kumo/utils";
import { useRef, useState, type ReactNode } from "react";
import { pct } from "../../lib/format";
import type { SegClass, Segment, SegmentModel } from "../../lib/pangram";
import { Swatch } from "../common";
import { TEXT_CLASS } from "../Layout";

export type Highlights = Record<SegClass | "plag", boolean>;

function renderSlice(text: string, start: number, end: number, ranges: [number, number][]): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = start;
  for (const [ps, pe] of ranges) {
    if (pe <= cursor || ps >= end) continue;
    const s = Math.max(ps, cursor);
    const e = Math.min(pe, end);
    if (s > cursor) out.push(text.slice(cursor, s));
    out.push(
      <mark key={s} className="plag">
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  }
  if (cursor < end) out.push(text.slice(cursor, end));
  return out;
}

const CHIPS: { key: keyof Highlights; label: string }[] = [
  { key: "ai", label: "AI-generated" },
  { key: "assisted", label: "AI-assisted" },
  { key: "human", label: "Human" },
  { key: "plag", label: "Plagiarism" },
];

export function HighlightToggles({
  highlights,
  onToggle,
  counts,
  plagCount,
}: {
  highlights: Highlights;
  onToggle: (key: keyof Highlights) => void;
  counts: Record<SegClass, number>;
  plagCount: number;
}) {
  return (
    <>
      {CHIPS.filter((c) => c.key !== "plag" || plagCount > 0).map((c) => (
        <button
          key={c.key}
          aria-pressed={highlights[c.key]}
          onClick={() => onToggle(c.key)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs ring-1 transition",
            highlights[c.key]
              ? "bg-kumo-base text-kumo-default ring-kumo-line"
              : "text-kumo-subtle ring-kumo-hairline opacity-60 hover:opacity-100",
          )}
        >
          <Swatch cls={c.key} />
          {c.label}
          <span className="text-kumo-subtle">{c.key === "plag" ? plagCount : counts[c.key]}</span>
        </button>
      ))}
    </>
  );
}

/** The version's text with one span per Pangram segment, plus a hover tooltip. */
export function HighlightedText({
  model,
  ranges,
  highlights,
  selected,
  onSelect,
}: {
  model: SegmentModel;
  ranges: [number, number][];
  highlights: Highlights;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [hover, setHover] = useState<{ seg: Segment; x: number; y: number } | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);

  const segAt = (target: EventTarget) => {
    const el = (target as HTMLElement).closest<HTMLElement>(".seg");
    return el ? model.segments[Number(el.dataset.i)] : undefined;
  };

  // Keep the tooltip inside the viewport.
  let left = 0;
  let top = 0;
  if (hover) {
    const w = tooltip.current?.offsetWidth ?? 220;
    const h = tooltip.current?.offsetHeight ?? 110;
    left = hover.x + 14 + w > innerWidth - 8 ? hover.x - w - 14 : hover.x + 14;
    top = hover.y + 14 + h > innerHeight - 8 ? hover.y - h - 14 : hover.y + 14;
  }

  return (
    <>
      <div
        className={cn(
          "zw-doc",
          TEXT_CLASS,
          !highlights.ai && "hide-ai",
          !highlights.assisted && "hide-assisted",
          !highlights.human && "hide-human",
          highlights.plag && "show-plag",
        )}
        onPointerOver={(e) => {
          if (e.pointerType !== "mouse") return;
          const seg = segAt(e.target);
          setHover(seg ? { seg, x: e.clientX, y: e.clientY } : null);
        }}
        onPointerMove={(e) => hover && setHover({ ...hover, x: e.clientX, y: e.clientY })}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const seg = segAt(e.target);
          if (seg) onSelect(seg.index);
        }}
      >
        {model.pieces.map((p) =>
          p.seg ? (
            <span key={p.start} data-i={p.seg.index} className={cn("seg", p.seg.cls, p.seg.index === selected && "selected")}>
              {renderSlice(model.text, p.start, p.end, ranges)}
            </span>
          ) : (
            <span key={p.start}>{renderSlice(model.text, p.start, p.end, ranges)}</span>
          ),
        )}
      </div>

      {hover && (
        <div
          ref={tooltip}
          role="tooltip"
          className="pointer-events-none fixed z-50 w-56 rounded-lg bg-kumo-base p-3 text-xs shadow-lg ring-1 ring-kumo-line"
          style={{ left, top }}
        >
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-kumo-strong">
            <Swatch cls={hover.seg.cls} />
            {hover.seg.label}
          </div>
          {[
            ["AI assistance", hover.seg.score !== null ? pct(hover.seg.score, 1) : null],
            ["Confidence", hover.seg.confidence],
            ["Humanizer", hover.seg.humanizerScore !== null ? pct(hover.seg.humanizerScore, 1) : null],
            ["Segment", `${hover.seg.index + 1} / ${model.segments.length}`],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-0.5 text-kumo-subtle">
                <span>{k}</span>
                <span className="text-kumo-default">{v}</span>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
