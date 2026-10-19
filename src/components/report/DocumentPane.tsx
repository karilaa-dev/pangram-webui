import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { cn } from "@cloudflare/kumo/utils";
import { useRef, useState, type ReactNode } from "react";
import { formatDate, num, pct } from "../../lib/format";
import type { SegClass, Segment, SegmentModel } from "../../lib/pangram";
import { Swatch } from "../common";

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

export function DocumentPane({
  title,
  checkedAt,
  model,
  ranges,
  counts,
  highlights,
  onToggle,
  selected,
  onSelect,
}: {
  title: string;
  checkedAt: number;
  model: SegmentModel;
  ranges: [number, number][];
  counts: Record<SegClass, number>;
  highlights: Highlights;
  onToggle: (key: keyof Highlights) => void;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [hover, setHover] = useState<{ seg: Segment; x: number; y: number } | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const words = model.segments.reduce((a, s) => a + s.words, 0);

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
    <LayerCard className="min-w-0">
      <LayerCard.Secondary className="no-print flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-kumo-subtle">Highlight</span>
        {CHIPS.filter((c) => c.key !== "plag" || ranges.length > 0).map((c) => (
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
            <span className="text-kumo-subtle">{c.key === "plag" ? ranges.length : counts[c.key]}</span>
          </button>
        ))}
      </LayerCard.Secondary>
      <LayerCard.Primary className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 border-b border-kumo-hairline pb-4">
          <h2 className="text-lg font-semibold text-kumo-strong">{title}</h2>
          <div className="mt-1 text-xs text-kumo-subtle">
            {num(words)} words · {num(model.segments.length)} segments · checked {formatDate(checkedAt)}
          </div>
        </div>
        <div
          className={cn(
            "zw-doc text-[15px] leading-8 text-kumo-default",
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
      </LayerCard.Primary>

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
    </LayerCard>
  );
}
