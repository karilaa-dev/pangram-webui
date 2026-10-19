import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  LoginThrottle,
  SESSION_TTL_SECONDS,
  createSessionToken,
  keyMatches,
  verifySessionToken,
} from "../server/auth";
import { loadConfig } from "../server/config";
import { createRoutes } from "../server/routes";
import { normalizeRun } from "../server/stealth";
import { MOCK_PANGRAM_KEY, MOCK_STEALTH_KEY, startMockUpstream } from "./mock-upstream";

const ADMIN_KEY = "test-admin-key-0123456789";

describe("session tokens", () => {
  test("round-trips and rejects tampering, other keys and expiry", () => {
    const now = Date.now();
    const token = createSessionToken(ADMIN_KEY, now);
    expect(verifySessionToken(token, ADMIN_KEY, now)).toBe(true);
    expect(verifySessionToken(token, "another-admin-key-012345", now)).toBe(false);
    expect(verifySessionToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), ADMIN_KEY, now)).toBe(false);
    expect(verifySessionToken(`9${token}`, ADMIN_KEY, now)).toBe(false);
    expect(verifySessionToken(token, ADMIN_KEY, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false);
    expect(verifySessionToken("garbage", ADMIN_KEY, now)).toBe(false);
  });

  test("keyMatches compares exactly", () => {
    expect(keyMatches(ADMIN_KEY, ADMIN_KEY)).toBe(true);
    expect(keyMatches(`${ADMIN_KEY} `, ADMIN_KEY)).toBe(false);
    expect(keyMatches("", ADMIN_KEY)).toBe(false);
  });

  test("throttle blocks after repeated failures and resets", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 10; i++) throttle.recordFailure("1.2.3.4", 0);
    expect(throttle.isBlocked("1.2.3.4", 1)).toBe(true);
    expect(throttle.isBlocked("5.6.7.8", 1)).toBe(false);
    expect(throttle.isBlocked("1.2.3.4", 16 * 60 * 1000)).toBe(false);
  });
});

describe("config", () => {
  test("refuses to start without ADMIN_API_KEY", () => {
    expect(() => loadConfig({})).toThrow("ADMIN_API_KEY");
    expect(() => loadConfig({ ADMIN_API_KEY: "   " })).toThrow("ADMIN_API_KEY");
  });

});

describe("normalizeRun", () => {
  test("reads text and score from flat or nested payloads", () => {
    expect(normalizeRun({ runId: "r", status: "completed", result: "Hi", howLikelyToBeDetected: 88 })).toMatchObject({
      done: true,
      text: "Hi",
      score: 88,
    });
    expect(
      normalizeRun({ runId: "r", status: "completed", result: { result: "Nested", howLikelyToBeDetected: 70 } }),
    ).toMatchObject({ text: "Nested", score: 70 });
    expect(normalizeRun({ runId: "r", status: "running" })).toMatchObject({ done: false, text: null });
    expect(normalizeRun({ runId: "r", status: "failed", error: { code: "x", message: "Boom" } }).error).toBe("Boom");
  });
});

describe("HTTP API", () => {
  let mock: ReturnType<typeof startMockUpstream>;
  let server: ReturnType<typeof Bun.serve>;
  let base: string;

  beforeAll(() => {
    mock = startMockUpstream();
    const config = loadConfig({
      ADMIN_API_KEY: ADMIN_KEY,
      PANGRAM_API_KEY: MOCK_PANGRAM_KEY,
      PANGRAM_API_URL: `${mock.url}/pangram`,
      PANGRAM_PLAGIARISM_URL: `${mock.url}/pangram/plagiarism`,
      STEALTHGPT_API_KEY: MOCK_STEALTH_KEY,
      STEALTHGPT_API_URL: mock.url,
    });
    server = Bun.serve({ port: 0, routes: createRoutes(config) });
    base = server.url.toString().replace(/\/$/, "");
  });

  afterAll(() => {
    server.stop(true);
    mock.stop();
  });

  const bearer = { Authorization: `Bearer ${ADMIN_KEY}`, "Content-Type": "application/json" };

  async function poll(path: string, headers: Record<string, string>) {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${base}${path}`, { headers });
      const data: any = await res.json();
      if (!res.ok || data.done) return { res, data };
    }
    throw new Error("never finished");
  }

  test("protected routes reject anonymous and wrong-key requests", async () => {
    for (const path of ["/api/pangram/models", "/api/humanizer/balance", "/api/humanizer/runs/x"]) {
      expect((await fetch(`${base}${path}`)).status).toBe(401);
      const wrong = await fetch(`${base}${path}`, { headers: { Authorization: "Bearer nope" } });
      expect(wrong.status).toBe(401);
    }
    const post = await fetch(`${base}/api/humanizer/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(post.status).toBe(401);
    expect(mock.state.stealthStarts).toBe(0);
  });

  test("login sets an HttpOnly session cookie that authorizes requests", async () => {
    const bad = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ key: "wrong" }),
    });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();

    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ key: ADMIN_KEY }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("zw_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    const session = cookie.split(";")[0]!;

    const me = await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: session } })).json();
    expect(me).toEqual({ authenticated: true, services: { pangram: true, humanizer: true } });
    expect((await fetch(`${base}/api/pangram/models`, { headers: { Cookie: session } })).status).toBe(200);

    const anon = await (await fetch(`${base}/api/auth/session`)).json();
    expect(anon).toEqual({ authenticated: false });

    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST" });
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("unknown API paths return JSON 404", async () => {
    const res = await fetch(`${base}/api/nope`, { headers: bearer });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("humanize run: start, poll, complete", async () => {
    const start = await fetch(`${base}/api/humanizer/runs`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({
        text: "We utilize numerous tools. However, it is very important.",
        qualityMode: "quality",
        outputFormat: "text",
        model: "lite",
        idempotencyKey: "key-123",
      }),
    });
    expect(start.status).toBe(200);
    const run: any = await start.json();
    expect(run.status).toBe("queued");
    expect(mock.state.idempotencyKeys).toContain("key-123");

    const { res, data } = await poll(`/api/humanizer/runs/${run.runId}`, bearer);
    expect(res.status).toBe(200);
    expect(data.status).toBe("completed");
    expect(data.text).toBe("We use many tools. Still, it is really key.");
    expect(typeof data.score).toBe("number");
    expect(typeof data.remainingCredits).toBe("number");
  });

  test("humanize validates input", async () => {
    const res = await fetch(`${base}/api/humanizer/runs`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ text: "Hello", qualityMode: "ultra", model: "lite" }),
    });
    expect(res.status).toBe(400);
    for (const model of [undefined, "default", "heavy"]) {
      const bad = await fetch(`${base}/api/humanizer/runs`, {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ text: "Hello", model }),
      });
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as any).error).toContain("model must be one of");
    }
    const empty = await fetch(`${base}/api/humanizer/runs`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ text: "  " }),
    });
    expect(empty.status).toBe(400);
  });

  test("pangram task: submit, poll, result", async () => {
    const text = "This is a test. It has sentences! Does it work? Yes it does.";
    const submit = await fetch(`${base}/api/pangram/tasks`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ text, model: "default" }),
    });
    const { taskId, model } = (await submit.json()) as any;
    expect(model).toBe("default");
    const { data } = await poll(`/api/pangram/tasks/${taskId}`, bearer);
    expect(data.stage).toBe("STAGE_SUCCESS");
    expect(data.result.task_id).toBe(taskId);
    expect(data.result.windows.length).toBeGreaterThan(0);
  });

  test("model list drops the default alias and sorts oldest first", async () => {
    const res: any = await (await fetch(`${base}/api/pangram/models`, { headers: bearer })).json();
    expect(res.models).toEqual(["pangram-3", "pangram-4"]);
  });

  test("balance and plagiarism proxy through", async () => {
    const balance: any = await (await fetch(`${base}/api/humanizer/balance`, { headers: bearer })).json();
    expect(typeof balance.credits).toBe("number");
    const plag = await fetch(`${base}/api/pangram/plagiarism`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ text: "A sentence long enough to match. Another one." }),
    });
    expect(((await plag.json()) as any).plagiarism_detected).toBe(true);
  });

  test("upstream key rejection is reported as 502, not 401", async () => {
    const config = loadConfig({
      ADMIN_API_KEY: ADMIN_KEY,
      STEALTHGPT_API_KEY: "wrong",
      STEALTHGPT_API_URL: mock.url,
    });
    const other = Bun.serve({ port: 0, routes: createRoutes(config) });
    try {
      const res = await fetch(`${other.url}api/humanizer/balance`, { headers: bearer });
      expect(res.status).toBe(502);
      expect(((await res.json()) as any).error).toContain("rejected the configured API key");
      const pangram = await fetch(`${other.url}api/pangram/tasks`, {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ text: "hi" }),
      });
      expect(pangram.status).toBe(503);
    } finally {
      other.stop(true);
    }
  });
});
