import { useEffect } from "react";
import { api } from "./api";
import { observable, useObservable } from "./store";
import type { HumanizeSettings } from "./types";

export const QUALITY_MODES = { quality: "Quality", fast: "Fast" };
// "default" is not sent to StealthGPT, so the API picks its own model.
export const HUMANIZER_MODELS = { default: "Default model", heavy: "Heavy", lite: "Lite" };
export const OUTPUT_FORMATS = { text: "Plain text", markdown: "Markdown" };

const DEFAULT_SETTINGS: HumanizeSettings = { qualityMode: "quality", model: "default", outputFormat: "text" };

export interface Preferences extends HumanizeSettings {
  /** Run a Pangram check automatically after each humanize run. */
  thenCheck: boolean;
  pangramModel: string;
}

const PREFS_KEY = "zamwriter_preferences";

function loadPreferences(): Preferences {
  const defaults = { ...DEFAULT_SETTINGS, thenCheck: true, pangramModel: "default" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

// Shared across components so every settings control reflects the same choice.
const preferences = observable<Preferences>(loadPreferences());

export function usePreferences(): [Preferences, (p: Preferences) => void] {
  return [
    useObservable(preferences),
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

const models = observable<string[]>(["default"]);
let modelsRequested = false;

export function usePangramModels() {
  useEffect(() => {
    if (modelsRequested) return;
    modelsRequested = true;
    api
      .pangramModels()
      .then((r) => r.models.length && models.set(r.models))
      .catch(() => {});
  }, []);
  return useObservable(models);
}
