import { countWords } from "./format";

export interface PreservationSettings {
  preservation?: boolean;
  preservationOpen?: string;
  preservationClose?: string;
  preservationMaxLookahead?: number;
  preservationMode?: "inline" | "split";
}

export interface PreservationResult {
  frozenCount: number;
  preservedCount: number;
  mode: "inline" | "split";
  fallbackUsed: boolean;
}

export const PRESERVATION_DEFAULTS = {
  preservation: false,
  preservationOpen: "[[",
  preservationClose: "]]",
  preservationMaxLookahead: 10,
  preservationMode: "inline",
} as const;

const delimiterValid = (value: unknown) => typeof value === "string" && value.length >= 1 && value.length <= 10 && !/\s/u.test(value);

/** Shared by the controls and API boundary; never coerce invalid request values. */
export function preservationError(options: Record<string, unknown> | PreservationSettings): string | null {
  const p = { ...PRESERVATION_DEFAULTS, ...options };
  if (typeof p.preservation !== "boolean") return "preservation must be a boolean";
  if (!delimiterValid(p.preservationOpen)) return "Opening delimiter must contain 1–10 characters without spaces.";
  if (!delimiterValid(p.preservationClose)) return "Closing delimiter must contain 1–10 characters without spaces.";
  if (p.preservationOpen === p.preservationClose) return "Opening and closing delimiters must be different.";
  if (!Number.isInteger(p.preservationMaxLookahead) || p.preservationMaxLookahead < 1 || p.preservationMaxLookahead > 64) {
    return "Maximum marker length must be a whole number from 1 to 64.";
  }
  if (p.preservationMode !== "inline" && p.preservationMode !== "split") return "Preservation mode must be inline or split.";
  return null;
}

/** Find literal, bounded markers without interpreting custom delimiters as regex. */
export function preservationMarkers(text: string, settings: PreservationSettings): { start: number; end: number }[] {
  if (!settings.preservation || preservationError(settings)) return [];
  const p = { ...PRESERVATION_DEFAULTS, ...settings };
  const markers: { start: number; end: number }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(p.preservationOpen, cursor);
    if (start < 0) break;
    const contentStart = start + p.preservationOpen.length;
    const close = text.slice(contentStart, contentStart + p.preservationMaxLookahead + p.preservationClose.length).indexOf(p.preservationClose);
    if (close < 0) {
      cursor = contentStart;
      continue;
    }
    const end = contentStart + close + p.preservationClose.length;
    markers.push({ start, end });
    cursor = end;
  }
  return markers;
}

/** Preserved markers are excluded from StealthGPT's estimated billable words. */
export function humanizeWordCount(text: string, settings: PreservationSettings): number {
  let cursor = 0;
  const parts: string[] = [];
  for (const marker of preservationMarkers(text, settings)) {
    parts.push(text.slice(cursor, marker.start));
    cursor = marker.end;
  }
  parts.push(text.slice(cursor));
  return countWords(parts.join(" "));
}
