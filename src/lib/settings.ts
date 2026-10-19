import { useEffect } from "react";
import { api } from "./api";
import { observable, useObservable } from "./store";
import type { HumanizeSettings } from "./types";

// Options are listed lowest first; the first one is the initial choice.
export const QUALITY_MODES = { fast: "Fast", quality: "Quality" };
export const HUMANIZER_MODELS = { lite: "Lite", standard: "Standard", super: "Super" };
export const OUTPUT_FORMATS = { text: "Plain text", markdown: "Markdown" };

function oneOf<T extends object>(options: T, value: unknown): keyof T {
  return typeof value === "string" && value in options ? (value as keyof T) : (Object.keys(options)[0] as keyof T);
}

export interface Preferences extends HumanizeSettings {
  /** Run a Pangram check automatically after each humanize run. */
  thenCheck: boolean;
  pangramModel: string;
}

const PREFS_KEY = "zamwriter_preferences";

function loadPreferences(): Preferences {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {}
  // Values that are no longer options (such as the old "default" model) fall back to the lowest option.
  return {
    qualityMode: oneOf(QUALITY_MODES, saved.qualityMode),
    model: oneOf(HUMANIZER_MODELS, saved.model),
    outputFormat: oneOf(OUTPUT_FORMATS, saved.outputFormat),
    thenCheck: typeof saved.thenCheck === "boolean" ? saved.thenCheck : true,
    pangramModel: typeof saved.pangramModel === "string" ? saved.pangramModel : "",
  };
}

// Shared across components so every settings control reflects the same choice;
// the latest choice is remembered in this browser.
const preferences = observable<Preferences>(loadPreferences());

const pangramModels = observable<string[]>([]);
let modelsRequested = false;

/** Pangram models available to the API key, oldest (lowest) first. */
export function usePangramModels() {
  useEffect(() => {
    if (modelsRequested) return;
    modelsRequested = true;
    api
      .pangramModels()
      .then((r) => pangramModels.set(r.models))
      .catch(() => {
        modelsRequested = false;
      });
  }, []);
  return useObservable(pangramModels);
}

export function usePreferences(): [Preferences, (p: Preferences) => void] {
  const prefs = useObservable(preferences);
  const models = usePangramModels();
  // A saved Pangram model that is no longer offered falls back to the lowest one.
  const pangramModel = models.length
    ? models.includes(prefs.pangramModel)
      ? prefs.pangramModel
      : models[0]!
    : prefs.pangramModel || "pangram-4";
  return [
    { ...prefs, pangramModel },
    (next) => {
      preferences.set(next);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
    },
  ];
}

export const humanizeSettings = (p: Preferences): HumanizeSettings => ({
  qualityMode: p.qualityMode,
  model: p.model,
  outputFormat: p.outputFormat,
});
