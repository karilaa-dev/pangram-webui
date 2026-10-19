import type { Config } from "./config";
import { ApiError, upstreamFetch } from "./http";

// StealthGPT "Writer & Humanizer" async runs: POST /api/stealthify/runs starts a
// run, GET /api/stealthify/runs/:id reports queued → running → completed.
export const QUALITY_MODES = ["quality", "fast"] as const;
export const OUTPUT_FORMATS = ["text", "markdown"] as const;
// The API has no default model; omitting it is a 400.
export const MODELS = ["lite", "standard", "super"] as const;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export interface HumanizeRequest {
  text: string;
  qualityMode: (typeof QUALITY_MODES)[number];
  outputFormat: (typeof OUTPUT_FORMATS)[number];
  model: (typeof MODELS)[number];
  idempotencyKey?: string;
}

export interface HumanizeRun {
  runId: string;
  status: string;
  done: boolean;
  text: string | null;
  /** Human-likeness score 0–100 (StealthGPT's `howLikelyToBeDetected`; higher = more human). */
  score: number | null;
  error: string | null;
}

const numberOrNull = (...values: unknown[]) => {
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
};

// The run payload has shifted between API versions, so read the result from
// wherever it appears rather than relying on one exact shape.
export function normalizeRun(data: any): HumanizeRun {
  const result = data?.result;
  const nested = result && typeof result === "object" ? result : {};
  const text =
    [result, nested.result, nested.text, nested.output, nested.content, data?.output].find(
      (v): v is string => typeof v === "string",
    ) ?? null;
  const status = typeof data?.status === "string" ? data.status : "unknown";
  const error = data?.error?.message ?? (typeof data?.error === "string" ? data.error : null);
  return {
    runId: String(data?.runId ?? data?.id ?? ""),
    status,
    done: TERMINAL.has(status),
    text,
    score: numberOrNull(data?.howLikelyToBeDetected, nested.howLikelyToBeDetected),
    error: status === "failed" || status === "cancelled" ? error || `Run ${status}` : null,
  };
}

export function parseHumanizeRequest(body: Record<string, unknown>, text: string): HumanizeRequest {
  const qualityMode = body.qualityMode ?? "quality";
  const outputFormat = body.outputFormat ?? "text";
  if (!QUALITY_MODES.includes(qualityMode as any)) throw new ApiError("Invalid qualityMode", 400);
  if (!OUTPUT_FORMATS.includes(outputFormat as any)) throw new ApiError("Invalid outputFormat", 400);

  const model = body.model;
  if (!MODELS.includes(model as any)) throw new ApiError(`model must be one of: ${MODELS.join(", ")}`, 400);
  const key = body.idempotencyKey;
  if (key !== undefined && (typeof key !== "string" || key.length < 1 || key.length > 255)) {
    throw new ApiError("Invalid idempotencyKey", 400);
  }
  return {
    text,
    qualityMode: qualityMode as HumanizeRequest["qualityMode"],
    outputFormat: outputFormat as HumanizeRequest["outputFormat"],
    model: model as HumanizeRequest["model"],
    idempotencyKey: key as string | undefined,
  };
}

export function stealthClient(config: Config["stealth"]) {
  function call(path: string, init: RequestInit = {}) {
    if (!config.apiKey) throw new ApiError("STEALTHGPT_API_KEY is not configured", 503);
    return upstreamFetch("StealthGPT", `${config.apiUrl}${path}`, {
      ...init,
      headers: { "api-token": config.apiKey, ...init.headers },
    });
  }

  return {
    async start({ idempotencyKey, ...request }: HumanizeRequest): Promise<HumanizeRun> {
      const data = await call("/api/stealthify/runs", {
        method: "POST",
        body: JSON.stringify(request),
        // Lets the browser retry a start without creating a second paid run.
        headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
      });
      const run = normalizeRun(data);
      if (!run.runId) throw new ApiError("StealthGPT did not return a run id");
      return run;
    },

    async run(runId: string): Promise<HumanizeRun> {
      const run = normalizeRun(await call(`/api/stealthify/runs/${encodeURIComponent(runId)}`));
      if (run.status === "completed" && run.text === null) {
        throw new ApiError("StealthGPT run completed without any text");
      }
      return { ...run, runId: run.runId || runId };
    },

  };
}
