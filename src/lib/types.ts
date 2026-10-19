export type Tab = "humanize" | "pangram";

export type VersionKind = "original" | "humanized" | "edited";

export interface HumanizeSettings {
  qualityMode: "quality" | "fast";
  /** StealthGPT model: "lite", "standard" or "super". */
  model: string;
  outputFormat: "text" | "markdown";
}

export interface PangramWindow {
  text?: string;
  label?: string;
  ai_assistance_score?: number;
  confidence?: string;
  start_index?: number;
  end_index?: number;
  word_count?: number;
  token_length?: number;
  is_humanized?: boolean;
  humanizer_score?: number;
}

export interface PangramResult {
  text?: string;
  headline?: string;
  prediction?: string;
  prediction_short?: string;
  fraction_ai?: number;
  fraction_ai_assisted?: number;
  fraction_human?: number;
  num_ai_segments?: number;
  num_ai_assisted_segments?: number;
  num_human_segments?: number;
  windows?: PangramWindow[];
  version?: string;
  model?: string;
  task_id?: string;
  stage?: string;
  dashboard_link?: string;
  [key: string]: unknown;
}

export interface PangramCheck {
  model: string;
  checkedAt: number;
  result: PangramResult;
  /** Estimated USD cost of this check, at the rate configured when it ran. */
  costUsd?: number;
}

export interface Version {
  id: string;
  kind: VersionKind;
  text: string;
  createdAt: number;
  /** The version this one was humanized or edited from. */
  sourceId?: string;
  humanize?: {
    runId: string;
    settings: HumanizeSettings;
    /** StealthGPT human-likeness score, 0–100 (higher reads more human). */
    score: number | null;
    creditsSpent: number | null;
    /** Estimated USD cost of the run (input + output words), at the rate configured when it ran. */
    costUsd?: number;
  };
  pangram?: PangramCheck;
  plagiarism?: Record<string, any>;
}

interface JobBase {
  id: string;
  startedAt: number;
  status: string;
  error?: string;
}

export interface HumanizeJob extends JobBase {
  type: "humanize";
  sourceId: string;
  settings: HumanizeSettings;
  runId?: string;
  /** Pangram model to check the result with once humanizing finishes. */
  thenCheck?: string;
}

export interface PangramJob extends JobBase {
  type: "pangram";
  versionId: string;
  model: string;
  taskId?: string;
}

export type Job = HumanizeJob | PangramJob;

export interface Doc {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** versions[0] is always the original text; later entries are never modified except for checks. */
  versions: Version[];
  jobs: Job[];
  tags: string[];
  notes: string;
  /** Estimated USD spent on this document, including re-checks. */
  spentUsd?: number;
}

export interface Services {
  pangram: boolean;
  humanizer: boolean;
}
