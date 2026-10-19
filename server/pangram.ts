import type { Config } from "./config";
import { ApiError, upstreamFetch } from "./http";

const PLAGIARISM_TIMEOUT_MS = 90_000;

export function pangramClient(config: Config["pangram"]) {
  function call(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
    if (!config.apiKey) throw new ApiError("PANGRAM_API_KEY is not configured", 503);
    return upstreamFetch("Pangram", url, {
      ...init,
      headers: { "x-api-key": config.apiKey, ...init.headers },
    });
  }

  return {
    async models(): Promise<string[]> {
      try {
        const data = await call(`${config.apiUrl}/models`);
        return Array.isArray(data?.models) && data.models.length ? data.models : ["default"];
      } catch (error) {
        // Model listing is optional; fall back to the default selector.
        console.error("Could not list Pangram models:", (error as Error).message);
        return ["default"];
      }
    },

    // Submit an async detection task; the browser polls `task()` until it settles.
    async submit(text: string, model: string): Promise<{ taskId: string }> {
      const data = await call(`${config.apiUrl}/task`, {
        method: "POST",
        body: JSON.stringify({ text, model, public_dashboard_link: true }),
      });
      if (typeof data?.task_id !== "string" || !data.task_id) {
        throw new ApiError("Pangram API did not return a task id");
      }
      return { taskId: data.task_id };
    },

    async task(taskId: string) {
      const data = await call(`${config.apiUrl}/task/${encodeURIComponent(taskId)}`);
      if (data?.error) throw new ApiError(`Pangram API error: ${data.error}`);
      if (!data.stage) throw new ApiError("Pangram API returned a task without a stage");
      const stage = data.stage as string;
      if (stage === "STAGE_FAILED") {
        return { done: true, stage, result: null, error: `Analysis failed: ${data.headline || data.detail || "task failed"}` };
      }
      const done = stage === "STAGE_SUCCESS";
      if (done) {
        console.log(
          `Detection complete: version=${data.version} prediction=${data.prediction_short} windows=${data.windows?.length ?? 0}`,
        );
      }
      return { done, stage, result: done ? { ...data, task_id: taskId } : null, error: null };
    },

    async plagiarism(text: string) {
      const data = await call(config.plagiarismUrl, {
        method: "POST",
        body: JSON.stringify({ text, source: "zamwriter" }),
        timeoutMs: PLAGIARISM_TIMEOUT_MS,
      });
      if (data?.error) throw new ApiError(`Pangram API error: ${data.error}`);
      return data;
    },
  };
}
