export class ApiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Error processing request:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("Expected a JSON object body", 400);
  }
  return body as Record<string, unknown>;
}

export function readText(body: Record<string, unknown>): string {
  const text = body.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new ApiError("Text is required", 400);
  }
  return text.trim();
}

// Upstream statuses that are meaningful to the browser. Everything else —
// including the upstream rejecting *our* API key with 401/403 — becomes a 502
// so the client never mistakes it for its own session expiring.
const PASSTHROUGH_STATUSES = new Set([400, 402, 404, 413, 422, 429]);

function upstreamMessage(data: any): string | undefined {
  const detail = data?.error?.message ?? data?.error ?? data?.detail ?? data?.message;
  if (detail === undefined || detail === null || detail === "") return undefined;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

export async function upstreamFetch(
  service: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<any> {
  const { timeoutMs = 15_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { "Content-Type": "application/json", ...rest.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ApiError(`Could not reach ${service} API: ${(error as Error).message}`);
  }

  const body = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(body);
  } catch {}

  if (!response.ok) {
    console.error(`${service} API error:`, response.status, body.slice(0, 500));
    const detail = upstreamMessage(data);
    const status = PASSTHROUGH_STATUSES.has(response.status) ? response.status : 502;
    const reason =
      response.status === 401 || response.status === 403
        ? `${service} rejected the configured API key`
        : `${service} API error ${response.status}`;
    throw new ApiError(detail ? `${reason}: ${detail}` : reason, status);
  }
  if (data === null) throw new ApiError(`${service} API returned a non-JSON response`);
  return data;
}
