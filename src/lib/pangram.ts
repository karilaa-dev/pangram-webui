import { countWords, formatDate, num, pct } from "./format";
import type { PangramCheck, PangramResult } from "./types";

export type SegClass = "ai" | "assisted" | "human";

export const LABELS: Record<SegClass, string> = {
  ai: "AI-generated",
  assisted: "AI-assisted",
  human: "Human-written",
};

export function classOf(label: string | undefined | null): SegClass {
  if (!label) return "assisted";
  const l = String(label).toLowerCase();
  if (l.includes("assist") || l.includes("mixed")) return "assisted";
  if (l.includes("human")) return "human";
  if (/\bai\b/.test(l) || l.includes("ai-") || l.includes("machine")) return "ai";
  return "assisted";
}

export function scoreClass(score: number): SegClass {
  if (score >= 0.66) return "ai";
  if (score >= 0.33) return "assisted";
  return "human";
}

export const verdictClass = (d: PangramResult) => classOf(d.prediction_short || d.headline || d.prediction);

export interface Segment {
  index: number;
  cls: SegClass;
  label: string;
  text: string;
  score: number | null;
  confidence: string | null;
  words: number;
  tokens: number | null;
  start: number;
  end: number;
  humanized: boolean | null;
  humanizerScore: number | null;
}

export interface Piece {
  start: number;
  end: number;
  seg?: Segment;
}

export interface SegmentModel {
  segments: Segment[];
  pieces: Piece[];
  text: string;
}

// Normalise API windows into ordered segments with character offsets into the
// analysed text, filling any uncovered gaps.
export function buildSegments(data: PangramResult, fallbackText: string): SegmentModel {
  const windows = Array.isArray(data.windows) ? data.windows : [];
  const text = typeof data.text === "string" && data.text ? data.text : fallbackText;
  const hasOffsets =
    windows.length > 0 &&
    windows.every((w) => Number.isInteger(w.start_index) && Number.isInteger(w.end_index)) &&
    windows.every((w) => w.end_index! <= text.length);

  const segments: Segment[] = windows.map((w, i) => ({
    index: i,
    cls: classOf(w.label),
    label: w.label || "Unknown",
    text: w.text || "",
    score: typeof w.ai_assistance_score === "number" ? w.ai_assistance_score : null,
    confidence: w.confidence || null,
    words: Number.isFinite(w.word_count) ? w.word_count! : countWords(w.text || ""),
    tokens: Number.isFinite(w.token_length) ? w.token_length! : null,
    start: w.start_index ?? 0,
    end: w.end_index ?? 0,
    humanized: typeof w.is_humanized === "boolean" ? w.is_humanized : null,
    humanizerScore: typeof w.humanizer_score === "number" ? w.humanizer_score : null,
  }));

  const pieces: Piece[] = [];
  if (hasOffsets) {
    const ordered = [...segments].sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const seg of ordered) {
      if (seg.start > cursor) pieces.push({ start: cursor, end: seg.start });
      const start = Math.max(seg.start, cursor);
      if (seg.end > start) pieces.push({ start, end: seg.end, seg });
      cursor = Math.max(cursor, seg.end);
    }
    if (cursor < text.length) pieces.push({ start: cursor, end: text.length });
    return { segments, pieces, text };
  }
  if (segments.length) {
    let cursor = 0;
    let joined = "";
    for (const seg of segments) {
      seg.start = cursor;
      seg.end = cursor + seg.text.length;
      pieces.push({ start: seg.start, end: seg.end, seg });
      joined += seg.text;
      cursor = seg.end;
    }
    return { segments, pieces, text: joined };
  }
  pieces.push({ start: 0, end: text.length });
  return { segments, pieces, text };
}

export interface Stats {
  words: number;
  chars: number;
  tokens: number | null;
  weightedScore: number | null;
  maxScore: number | null;
  conf: Record<"High" | "Medium" | "Low", number>;
  hasHumanizer: boolean;
  humanizedCount: number;
  maxHumanizer: number | null;
  fractions: Record<SegClass, number>;
  segCounts: Record<SegClass, number>;
  wordsBy: Record<SegClass, number>;
}

export function computeStats(d: PangramResult, model: SegmentModel): Stats {
  const segs = model.segments;
  const scored = segs.filter((s) => s.score !== null);
  const words = segs.reduce((a, s) => a + (s.words || 0), 0) || countWords(model.text);
  const tokens = segs.length && segs.every((s) => s.tokens !== null) ? segs.reduce((a, s) => a + s.tokens!, 0) : null;
  const conf = { High: 0, Medium: 0, Low: 0 };
  for (const s of segs) {
    const k = s.confidence ? s.confidence[0]!.toUpperCase() + s.confidence.slice(1).toLowerCase() : "";
    if (k in conf) conf[k as keyof typeof conf]++;
  }
  const hasHumanizer = segs.some((s) => s.humanized !== null || s.humanizerScore !== null);
  const counts = { ai: 0, assisted: 0, human: 0 };
  const wordsBy = { ai: 0, assisted: 0, human: 0 };
  for (const s of segs) {
    counts[s.cls]++;
    wordsBy[s.cls] += s.words || 0;
  }

  // Prefer API fractions; fall back to word-weighted segment shares.
  const totalWords = wordsBy.ai + wordsBy.assisted + wordsBy.human;
  const frac = (value: unknown, cls: SegClass) =>
    typeof value === "number" ? value : totalWords ? wordsBy[cls] / totalWords : 0;
  const fractions = {
    ai: frac(d.fraction_ai, "ai"),
    assisted: frac(d.fraction_ai_assisted, "assisted"),
    human: frac(d.fraction_human, "human"),
  };
  if (typeof d.fraction_human !== "number" && typeof d.fraction_ai === "number") {
    fractions.human = Math.max(0, 1 - fractions.ai - fractions.assisted);
  }
  const intOr = (v: unknown, fallback: number) => (Number.isFinite(v) ? (v as number) : fallback);
  const scoredWords = scored.reduce((a, s) => a + (s.words || 0), 0);

  return {
    words,
    chars: model.text.length,
    tokens,
    weightedScore: scored.length && scoredWords ? scored.reduce((a, s) => a + s.score! * (s.words || 0), 0) / scoredWords : null,
    maxScore: scored.length ? Math.max(...scored.map((s) => s.score!)) : null,
    conf,
    hasHumanizer,
    humanizedCount: segs.filter((s) => s.humanized).length,
    maxHumanizer: hasHumanizer ? Math.max(...segs.map((s) => s.humanizerScore ?? 0)) : null,
    fractions,
    segCounts: {
      ai: intOr(d.num_ai_segments, counts.ai),
      assisted: intOr(d.num_ai_assisted_segments, counts.assisted),
      human: intOr(d.num_human_segments, counts.human),
    },
    wordsBy,
  };
}

/** Share of the text Pangram attributes to AI (generated + assisted). */
export const aiShare = (d: PangramResult) => (d.fraction_ai || 0) + (d.fraction_ai_assisted || 0);

// ---------- Plagiarism ----------

export interface PlagSource {
  url?: string | null;
  title?: string | null;
  text?: string | null;
  score?: number | null;
}

export function plagSources(p: Record<string, any>): PlagSource[] {
  const list = p.plagiarized_content || p.sources || p.matches || [];
  return (Array.isArray(list) ? list : []).map((item: any) => {
    if (typeof item === "string") return { text: item };
    const src = typeof item.source === "string" ? item.source : null;
    return {
      url: item.url || item.source_url || item.link || (src && /^https?:/.test(src) ? src : null),
      title: item.title || item.source_title || item.domain || (src && !/^https?:/.test(src) ? src : null),
      text: item.text || item.matched_text || item.sentence || item.content || item.snippet || null,
      score: typeof item.score === "number" ? item.score : typeof item.similarity === "number" ? item.similarity : null,
    };
  });
}

export function plagSentences(p: Record<string, any>): string[] {
  const list = p.plagiarized_sentences || [];
  return (Array.isArray(list) ? list : [])
    .map((s: any) => (typeof s === "string" ? s : s && (s.text || s.sentence || s.content)))
    .filter((s: unknown): s is string => typeof s === "string" && !!s.trim());
}

export function plagRanges(p: Record<string, any> | undefined, text: string): [number, number][] {
  if (!p) return [];
  const ranges: [number, number][] = [];
  const needles = [...plagSentences(p), ...plagSources(p).map((s) => s.text).filter((t): t is string => !!t)];
  for (const raw of needles) {
    const needle = raw.trim();
    if (needle.length < 8) continue;
    let from = 0;
    let i: number;
    while ((i = text.indexOf(needle, from)) !== -1) {
      ranges.push([i, i + needle.length]);
      from = i + needle.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// ---------- Exports ----------

export function summaryText(check: PangramCheck, model: SegmentModel, title: string, versionLabel: string) {
  const d = check.result;
  const s = computeStats(d, model);
  const lines = [
    `Pangram AI detection report — ${title} (${versionLabel})`,
    `Analyzed: ${formatDate(check.checkedAt)}`,
    `Verdict: ${d.headline || d.prediction || "—"}${d.prediction_short ? ` (${d.prediction_short})` : ""}`,
    d.prediction && d.prediction !== d.headline ? d.prediction : null,
    "",
    `AI-generated: ${pct(s.fractions.ai, 1)} (${s.segCounts.ai} segments)`,
    `AI-assisted:  ${pct(s.fractions.assisted, 1)} (${s.segCounts.assisted} segments)`,
    `Human:        ${pct(s.fractions.human, 1)} (${s.segCounts.human} segments)`,
    "",
    `Words: ${num(s.words)} · Segments: ${model.segments.length} · Avg AI assistance: ${pct(s.weightedScore)}`,
    s.hasHumanizer ? `Humanized segments: ${s.humanizedCount}` : null,
    d.version ? `Model version: ${d.version}${check.model ? ` (${check.model})` : ""}` : null,
    d.dashboard_link ? `Dashboard: ${d.dashboard_link}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function segmentsCsv(segments: Segment[]) {
  const header = ["segment", "label", "ai_assistance_score", "confidence", "is_humanized", "humanizer_score", "word_count", "token_length", "start_index", "end_index", "text"];
  const rows = segments.map((s) => [s.index + 1, s.label, s.score, s.confidence, s.humanized, s.humanizerScore, s.words, s.tokens, s.start, s.end, s.text]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
