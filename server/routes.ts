import type { Server } from "bun";
import {
  LoginThrottle,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAuthorized,
  keyMatches,
  sessionCookie,
} from "./auth";
import type { Config } from "./config";
import { errorResponse, readJson, readText } from "./http";
import { pangramClient } from "./pangram";
import { parseHumanizeRequest, stealthClient } from "./stealth";

type Handler = (req: Request & { params: Record<string, string> }, server: Server<unknown>) => Response | Promise<Response>;

const LOGIN_FAILURE_DELAY_MS = 400;

export function createRoutes(config: Config) {
  const pangram = pangramClient(config.pangram);
  const stealth = stealthClient(config.stealth);
  const throttle = new LoginThrottle();

  const guard =
    (handler: Handler): Handler =>
    async (req, server) => {
      if (!isAuthorized(req, config.adminKey)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        return await handler(req, server);
      } catch (error) {
        return errorResponse(error);
      }
    };

  const session = () => ({
    authenticated: true,
    services: { pangram: !!config.pangram.apiKey, humanizer: !!config.stealth.apiKey },
  });

  return {
    "/api/auth/session": {
      GET: (req: Request) =>
        Response.json(
          isAuthorized(req, config.adminKey) ? session() : { authenticated: false },
        ),
    },

    "/api/auth/login": {
      POST: async (req: Request, server: Server<unknown>) => {
        const address = server.requestIP(req)?.address ?? "unknown";
        if (throttle.isBlocked(address)) {
          return Response.json(
            { error: "Too many failed attempts. Try again in a few minutes." },
            { status: 429 },
          );
        }
        const body = await req.json().catch(() => null);
        const key = typeof body?.key === "string" ? body.key.trim() : "";
        if (!key || !keyMatches(key, config.adminKey)) {
          throttle.recordFailure(address);
          await Bun.sleep(LOGIN_FAILURE_DELAY_MS);
          return Response.json({ error: "Invalid admin API key" }, { status: 401 });
        }
        throttle.reset(address);
        const token = createSessionToken(config.adminKey);
        return Response.json(session(), {
          headers: { "Set-Cookie": sessionCookie(req, token, SESSION_TTL_SECONDS) },
        });
      },
    },

    "/api/auth/logout": {
      POST: (req: Request) =>
        Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(req, "", 0) } }),
    },

    "/api/pangram/models": {
      GET: guard(async () => Response.json({ models: await pangram.models() })),
    },

    "/api/pangram/tasks": {
      POST: guard(async (req) => {
        const body = await readJson(req);
        const text = readText(body);
        const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "pangram-4";
        return Response.json({ ...(await pangram.submit(text, model)), model });
      }),
    },

    "/api/pangram/tasks/:id": {
      GET: guard(async (req) => Response.json(await pangram.task(req.params.id!))),
    },

    "/api/pangram/plagiarism": {
      POST: guard(async (req) => {
        const text = readText(await readJson(req));
        return Response.json(await pangram.plagiarism(text));
      }),
    },

    "/api/humanizer/runs": {
      POST: guard(async (req) => {
        const body = await readJson(req);
        const run = await stealth.start(parseHumanizeRequest(body, readText(body)));
        console.log(`Humanize run started: ${run.runId}`);
        return Response.json(run);
      }),
    },

    "/api/humanizer/runs/:id": {
      GET: guard(async (req) => Response.json(await stealth.run(req.params.id!))),
    },

    "/api/humanizer/balance": {
      GET: guard(async () => Response.json(await stealth.balance())),
    },

    "/api/*": () => Response.json({ error: "Not found" }, { status: 404 }),
  };
}
