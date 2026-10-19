import { cn } from "@cloudflare/kumo/utils";
import { num, pct } from "../../lib/format";
import { scoreClass, type Segment } from "../../lib/pangram";
import { SWATCH, SectionTitle, Swatch } from "../common";
import { SegRow } from "./Segments";

const FILL = { ai: "fill-zw-ai", assisted: "fill-zw-assisted", human: "fill-zw-human" };

export function Graph({ segments, selected, onSelect }: { segments: Segment[]; selected: number; onSelect: (i: number) => void }) {
  if (!segments.length) {
    return <div className="px-5 py-10 text-center text-sm text-kumo-subtle">No segment data available for this check.</div>;
  }

  const W = 380;
  const H = 200;
  const padL = 30;
  const padR = 6;
  const padT = 8;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const totalWords = segments.reduce((a, s) => a + Math.max(1, s.words || 1), 0);
  const gap = segments.length > 60 ? 0 : 2;

  let x = padL;
  const bars = [];
  const humanizerPoints: string[] = [];
  for (const s of segments) {
    const w = Math.max(1.5, (Math.max(1, s.words || 1) / totalWords) * innerW);
    const score = s.score ?? (s.cls === "ai" ? 1 : s.cls === "assisted" ? 0.5 : 0);
    const h = Math.max(2, score * innerH);
    bars.push(
      <rect
        key={s.index}
        className={cn("cursor-pointer transition-opacity hover:opacity-100", FILL[s.cls], s.index === selected ? "opacity-100 stroke-kumo-strong" : "opacity-80")}
        strokeWidth={s.index === selected ? 1.5 : 0}
        x={x + gap / 2}
        y={padT + innerH - h}
        width={Math.max(1, w - gap)}
        height={h}
        rx={2}
        onClick={() => onSelect(s.index)}
      >
        <title>
          Segment {s.index + 1}: {s.label} · {pct(s.score)}
        </title>
      </rect>,
    );
    if (s.humanizerScore !== null) humanizerPoints.push(`${x + w / 2},${padT + innerH - s.humanizerScore * innerH}`);
    x += w;
  }

  // Distribution of AI assistance scores, weighted by words.
  const bins = new Array(10).fill(0);
  for (const s of segments) if (s.score !== null) bins[Math.min(9, Math.floor(s.score * 10))] += s.words || 1;
  const binMax = Math.max(1, ...bins);
  const top = segments
    .filter((s) => s.score !== null)
    .sort((a, b) => b.score! - a.score!)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6 px-5 py-4">
      <section>
        <SectionTitle>AI assistance across the document</SectionTitle>
        <div className="rounded-lg bg-kumo-elevated p-3 ring-1 ring-kumo-hairline">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AI assistance score per segment" className="w-full">
            <g className="fill-kumo-subtle stroke-kumo-hairline text-[9px]">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => {
                const y = padT + innerH - v * innerH;
                return (
                  <g key={v}>
                    <line x1={padL} x2={W - padR} y1={y} y2={y} strokeDasharray="2 3" />
                    <text x={padL - 6} y={y + 3} textAnchor="end" stroke="none">
                      {v * 100}
                    </text>
                  </g>
                );
              })}
            </g>
            <g>{bars}</g>
            {humanizerPoints.length > 1 && (
              <polyline points={humanizerPoints.join(" ")} className="fill-none stroke-zw-plag" strokeWidth={1.5} strokeDasharray="4 3" />
            )}
            <g className="fill-kumo-subtle text-[9px]">
              <text x={padL} y={H - 6}>
                Start
              </text>
              <text x={padL + innerW / 2} y={H - 6} textAnchor="middle">
                Position in document (bar width = words)
              </text>
              <text x={W - padR} y={H - 6} textAnchor="end">
                End
              </text>
            </g>
          </svg>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-kumo-subtle">
            <span className="flex items-center gap-1.5">
              <Swatch cls="ai" />
              AI-generated
            </span>
            <span className="flex items-center gap-1.5">
              <Swatch cls="assisted" />
              AI-assisted
            </span>
            <span className="flex items-center gap-1.5">
              <Swatch cls="human" />
              Human
            </span>
            {humanizerPoints.length > 1 && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-zw-plag" />
                Humanizer score
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-kumo-subtle">
          Bar height is the segment's AI assistance score (0 = no AI involvement, 100 = fully AI-generated). Click a bar to jump to that passage.
        </p>
      </section>

      <section>
        <SectionTitle>Document map</SectionTitle>
        <div className="flex h-7 gap-px overflow-hidden rounded-md">
          {segments.map((s) => (
            <button
              key={s.index}
              aria-label={`Segment ${s.index + 1}: ${s.label}`}
              title={`Segment ${s.index + 1}: ${s.label}`}
              onClick={() => onSelect(s.index)}
              className={cn(SWATCH[s.cls], "min-w-[3px] transition-opacity hover:opacity-100", s.index === selected && "ring-2 ring-kumo-strong ring-inset")}
              style={{ flex: `${Math.max(1, s.words || 1)} 0 0`, opacity: s.score === null ? 0.6 : 0.3 + 0.7 * s.score }}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle aside="by word count">Score distribution</SectionTitle>
        <div className="flex h-24 items-end gap-1">
          {bins.map((b, i) => (
            <div key={i} className="flex h-full flex-1 items-end" title={`${i * 10}–${i * 10 + 10}: ${num(b)} words`}>
              <div className={cn("w-full rounded-t-sm", SWATCH[scoreClass((i + 0.5) / 10)])} style={{ height: `${(b / binMax) * 100}%`, minHeight: b ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-kumo-subtle">
          {bins.map((_, i) => (
            <span key={i} className="flex-1 text-center">
              {i * 10}
            </span>
          ))}
        </div>
      </section>

      {top.length > 0 && (
        <section>
          <SectionTitle>Highest-scoring passages</SectionTitle>
          <div className="flex flex-col gap-0.5">
            {top.map((s) => (
              <SegRow key={s.index} seg={s} selected={s.index === selected} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
