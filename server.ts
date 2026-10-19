const PANGRAM_API_URL =
  process.env.PANGRAM_API_URL || "https://text.external-api.pangram.com";
const PANGRAM_PLAGIARISM_URL =
  process.env.PANGRAM_PLAGIARISM_URL || "https://plagiarism.api.pangram.com";
const PORT = Number(process.env.PORT) || 3000;

const TASK_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const PLAGIARISM_TIMEOUT_MS = 90_000;

class ApiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.PANGRAM_API_KEY;
  if (!key) throw new ApiError("API key not configured", 500);
  return key;
}

async function pangramFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Could not reach Pangram API: ${(error as Error).message}`);
  }

  const body = await response.text();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error("Pangram API error:", response.status, body.slice(0, 500));
    const detail = data?.error || data?.detail || data?.message;
    throw new ApiError(
      `Pangram API error ${response.status}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`,
      response.status
    );
  }
  if (data === null) throw new ApiError("Pangram API returned a non-JSON response");
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new ApiError(`Pangram API error: ${data.error}`);
  }
  return data;
}

// Submit an async detection task and poll it until it reaches a terminal stage.
async function runDetection(text: string, model: string) {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  const submitted = await pangramFetch(`${PANGRAM_API_URL}/task`, {
    method: "POST",
    body: JSON.stringify({ text, model, public_dashboard_link: true }),
  });

  const taskId = submitted?.task_id;
  if (typeof taskId !== "string" || !taskId) {
    throw new ApiError("Pangram API did not return a task id");
  }

  while (Date.now() < deadline) {
    const result = await pangramFetch(
      `${PANGRAM_API_URL}/task/${encodeURIComponent(taskId)}`,
      { method: "GET" }
    );
    if (result.stage === "STAGE_SUCCESS") return { ...result, model, task_id: taskId };
    if (result.stage === "STAGE_FAILED") {
      throw new ApiError(
        `Analysis failed: ${result.headline || result.detail || "task failed"}`
      );
    }
    if (!result.stage) throw new ApiError("Pangram API returned a task without a stage");
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  throw new ApiError("Analysis timed out", 504);
}

function readText(body: any): string {
  const text = body?.text;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new ApiError("Text is required", 400);
  }
  return text.trim();
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Error processing request:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    // Models available to this API key
    if (url.pathname === "/api/models" && req.method === "GET") {
      try {
        const data = await pangramFetch(`${PANGRAM_API_URL}/models`, { method: "GET" });
        const models = Array.isArray(data?.models) ? data.models : ["default"];
        return Response.json({ models });
      } catch (error) {
        // Model listing is optional; fall back to the default selector.
        console.error("Could not list models:", (error as Error).message);
        return Response.json({ models: ["default"] });
      }
    }

    // AI detection
    if (url.pathname === "/api/verify" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => null);
        const text = readText(body);
        const model =
          typeof body.model === "string" && body.model.trim()
            ? body.model.trim()
            : "default";
        const data = await runDetection(text, model);
        console.log(
          `Detection complete: model=${model} version=${data.version} prediction=${data.prediction_short} windows=${data.windows?.length ?? 0}`
        );
        return Response.json(data);
      } catch (error) {
        return errorResponse(error);
      }
    }

    // Plagiarism check
    if (url.pathname === "/api/plagiarism" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => null);
        const text = readText(body);
        const data = await pangramFetch(
          PANGRAM_PLAGIARISM_URL,
          {
            method: "POST",
            body: JSON.stringify({ text, source: "pangram-webui" }),
          },
          PLAGIARISM_TIMEOUT_MS
        );
        return Response.json(data);
      } catch (error) {
        return errorResponse(error);
      }
    }

    // Serve static files from public/
    let filePath = url.pathname;
    if (filePath === "/") {
      filePath = "/index.html";
    }
    if (filePath.includes("..")) {
      return new Response("Not Found", { status: 404 });
    }

    const file = Bun.file(`./public${filePath}`);
    const exists = await file.exists();

    if (exists) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
