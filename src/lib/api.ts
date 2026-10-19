import type { HumanizeSettings, PangramResult, Services } from "./types";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      credentials: "same-origin",
    });
  } catch {
    throw new HttpError("Network error — is the ZamWriter server running?", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized();
  if (!res.ok) throw new HttpError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export type Session = { authenticated: false } | { authenticated: true; services: Services };

export interface HumanizeRun {
  runId: string;
  status: string;
  done: boolean;
  text: string | null;
  score: number | null;
  creditsSpent: number | null;
  remainingCredits: number | null;
  error: string | null;
}

export const api = {
  session: () => request<Session>("/api/auth/session"),
  login: (key: string) => post<Session>("/api/auth/login", { key }),
  logout: () => post<{ ok: true }>("/api/auth/logout", {}),

  pangramModels: () => request<{ models: string[] }>("/api/pangram/models"),
  pangramSubmit: (text: string, model: string) =>
    post<{ taskId: string; model: string }>("/api/pangram/tasks", { text, model }),
  pangramTask: (taskId: string) =>
    request<{ done: boolean; stage: string; result: PangramResult | null; error: string | null }>(
      `/api/pangram/tasks/${encodeURIComponent(taskId)}`,
    ),
  plagiarism: (text: string) => post<Record<string, any>>("/api/pangram/plagiarism", { text }),

  humanizeStart: (text: string, settings: HumanizeSettings, idempotencyKey: string) =>
    post<HumanizeRun>("/api/humanizer/runs", {
      text,
      ...settings,
      model: settings.model === "default" ? undefined : settings.model,
      idempotencyKey,
    }),
  humanizeRun: (runId: string) => request<HumanizeRun>(`/api/humanizer/runs/${encodeURIComponent(runId)}`),
  balance: () => request<{ credits: number | null }>("/api/humanizer/balance"),
};
