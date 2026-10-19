// A fake Pangram + StealthGPT API for tests and for trying the UI without
// spending credits (`bun run demo`).

export const MOCK_PANGRAM_KEY = "mock-pangram-key";
export const MOCK_STEALTH_KEY = "mock-stealth-key";

const LABELS = [
  { label: "AI-Generated", score: 0.97, confidence: "High" },
  { label: "AI-Assisted", score: 0.52, confidence: "Medium" },
  { label: "Human", score: 0.04, confidence: "High" },
];

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Split into windows of roughly two sentences, keeping character offsets.
function detect(text: string) {
  const windows: Record<string, any>[] = [];
  const re = /[^.!?\n]+(?:[.!?]+|\n+|$)\s*/g;
  const sentences = [...text.matchAll(re)].filter((m) => m[0].trim());
  for (let i = 0; i < sentences.length; i += 2) {
    const start = sentences[i]!.index!;
    const last = sentences[Math.min(i + 1, sentences.length - 1)]!;
    const end = last.index! + last[0].length;
    const chunk = text.slice(start, end);
    const kind = LABELS[hash(chunk) % 3]!;
    const humanizerScore = (hash(chunk + "h") % 100) / 100;
    windows.push({
      text: chunk,
      label: kind.label,
      ai_assistance_score: kind.score,
      confidence: kind.confidence,
      start_index: start,
      end_index: end,
      word_count: chunk.trim().split(/\s+/).length,
      token_length: Math.ceil(chunk.length / 4),
      is_humanized: humanizerScore > 0.7,
      humanizer_score: humanizerScore,
    });
  }
  const words = (cls: string) =>
    windows.filter((w) => w.label === cls).reduce((a, w) => a + w.word_count, 0);
  const total = windows.reduce((a, w) => a + w.word_count, 0) || 1;
  const fractionAi = words("AI-Generated") / total;
  const fractionAssisted = words("AI-Assisted") / total;
  const short = fractionAi > 0.5 ? "AI" : fractionAi + fractionAssisted > 0.3 ? "Mixed" : "Human";
  return {
    text,
    version: "mock-4.0",
    headline: short === "AI" ? "AI Detected" : short === "Mixed" ? "Mixed" : "Fully Human Written",
    prediction: `We are confident this document is ${short === "AI" ? "AI-generated" : short === "Mixed" ? "partly AI-assisted" : "human-written"}.`,
    prediction_short: short,
    fraction_ai: fractionAi,
    fraction_ai_assisted: fractionAssisted,
    fraction_human: 1 - fractionAi - fractionAssisted,
    num_ai_segments: windows.filter((w) => w.label === "AI-Generated").length,
    num_ai_assisted_segments: windows.filter((w) => w.label === "AI-Assisted").length,
    num_human_segments: windows.filter((w) => w.label === "Human").length,
    windows,
    dashboard_link: "https://www.pangram.com/history/mock",
  };
}

const SYNONYMS: Record<string, string> = {
  utilize: "use",
  however: "still",
  additionally: "also",
  furthermore: "plus",
  significant: "big",
  demonstrate: "show",
  numerous: "many",
  approximately: "about",
  important: "key",
  very: "really",
};

function humanize(text: string) {
  return text.replace(/\b[a-z]+\b/gi, (word) => {
    const swap = SYNONYMS[word.toLowerCase()];
    if (!swap) return word;
    return word[0] === word[0]!.toUpperCase() ? swap[0]!.toUpperCase() + swap.slice(1) : swap;
  });
}

export function startMockUpstream(port = 0) {
  const tasks = new Map<string, { text: string; polls: number }>();
  const runs = new Map<string, { text: string; polls: number }>();
  let credits = 5000;
  let counter = 0;
  const state = { pangramSubmits: 0, stealthStarts: 0, idempotencyKeys: [] as string[] };

  const pangramAuth = (req: Request) =>
    req.headers.get("x-api-key") === MOCK_PANGRAM_KEY
      ? null
      : Response.json({ detail: "Invalid API key" }, { status: 401 });
  const stealthAuth = (req: Request) =>
    req.headers.get("api-token") === MOCK_STEALTH_KEY
      ? null
      : Response.json({ message: "Invalid API token" }, { status: 401 });

  const server = Bun.serve({
    port,
    routes: {
      "/pangram/models": { GET: (req) => pangramAuth(req) ?? Response.json({ models: ["default", "pangram-4", "pangram-3"] }) },
      "/pangram/task": {
        POST: async (req) => {
          const denied = pangramAuth(req);
          if (denied) return denied;
          const { text } = (await req.json()) as { text: string };
          const id = `task_${++counter}`;
          tasks.set(id, { text, polls: 0 });
          state.pangramSubmits++;
          return Response.json({ task_id: id });
        },
      },
      "/pangram/task/:id": {
        GET: (req) => {
          const denied = pangramAuth(req);
          if (denied) return denied;
          const task = tasks.get(req.params.id);
          if (!task) return Response.json({ detail: "Task not found" }, { status: 404 });
          if (task.polls++ < 1) return Response.json({ stage: "STAGE_PROCESSING" });
          return Response.json({ stage: "STAGE_SUCCESS", ...detect(task.text) });
        },
      },
      "/pangram/plagiarism": {
        POST: async (req) => {
          const denied = pangramAuth(req);
          if (denied) return denied;
          const { text } = (await req.json()) as { text: string };
          const first = text.split(/(?<=[.!?])\s+/)[0] ?? "";
          return Response.json({
            plagiarism_detected: first.length > 20,
            percent_plagiarized: first.length > 20 ? 12.5 : 0,
            total_sentences: text.split(/(?<=[.!?])\s+/).length,
            plagiarized_sentences: first.length > 20 ? [first] : [],
            plagiarized_content: first.length > 20 ? [{ url: "https://example.com/source", title: "Example source", text: first, score: 0.92 }] : [],
          });
        },
      },
      "/api/stealthify/runs": {
        POST: async (req) => {
          const denied = stealthAuth(req);
          if (denied) return denied;
          const body = (await req.json()) as { text: string; model?: string };
          if (!body.text) return Response.json({ message: "text is required" }, { status: 400 });
          if (!["super", "standard", "lite"].includes(body.model ?? "")) {
            return Response.json({ message: 'model is required: pass "super", "standard", or "lite"' }, { status: 400 });
          }
          const key = req.headers.get("idempotency-key");
          if (key) state.idempotencyKeys.push(key);
          const runId = `hum_${++counter}`;
          runs.set(runId, { text: body.text, polls: 0 });
          state.stealthStarts++;
          return Response.json(
            { runId, status: "queued", statusUrl: `/api/stealthify/runs/${runId}` },
            { status: 202 },
          );
        },
      },
      "/api/stealthify/runs/:id": {
        GET: (req) => {
          const denied = stealthAuth(req);
          if (denied) return denied;
          const run = runs.get(req.params.id);
          if (!run) return Response.json({ message: "Run not found" }, { status: 404 });
          const polls = run.polls++;
          if (polls < 1) return Response.json({ runId: req.params.id, status: "queued" });
          if (polls < 2) return Response.json({ runId: req.params.id, status: "running" });
          if (polls === 2) credits -= Math.ceil(run.text.length / 10);
          return Response.json({
            runId: req.params.id,
            status: "completed",
            result: humanize(run.text),
            howLikelyToBeDetected: 70 + (hash(run.text) % 30),
            creditsSpent: Math.ceil(run.text.length / 10),
            remainingCredits: credits,
            billingMode: "credits",
          });
        },
      },
      "/api/stealthify/balance": {
        GET: (req) => stealthAuth(req) ?? Response.json({ remainingCredits: credits }),
      },
    },
  });

  return { url: server.url.toString().replace(/\/$/, ""), state, stop: () => server.stop(true) };
}

