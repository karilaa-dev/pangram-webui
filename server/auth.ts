import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "zw_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const digest = (value: string) => createHash("sha256").update(value).digest();

// Constant-time comparison; hashing first equalises the buffer lengths.
export function keyMatches(candidate: string, adminKey: string): boolean {
  return timingSafeEqual(digest(candidate), digest(adminKey));
}

function sign(adminKey: string, expires: number): string {
  return createHmac("sha256", adminKey).update(`zamwriter-session:${expires}`).digest("base64url");
}

// Sessions are stateless: `<expiry>.<hmac>`, signed with the admin key itself,
// so rotating ADMIN_API_KEY signs every existing session out.
export function createSessionToken(adminKey: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `${expires}.${sign(adminKey, expires)}`;
}

export function verifySessionToken(token: string, adminKey: string, now = Date.now()): boolean {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= now) return false;
  return timingSafeEqual(Buffer.from(match[2]!), Buffer.from(sign(adminKey, expires)));
}

export function isAuthorized(req: Request, adminKey: string): boolean {
  // Scripts can send the admin key directly instead of logging in.
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return keyMatches(header.slice(7).trim(), adminKey);

  const cookie = req.headers.get("cookie");
  if (!cookie) return false;
  const token = new Bun.CookieMap(cookie).get(SESSION_COOKIE);
  return !!token && verifySessionToken(token, adminKey);
}

export function sessionCookie(req: Request, value: string, maxAge: number): string {
  const secure =
    new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return new Bun.Cookie(SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge,
  }).serialize();
}

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

// Slows down guessing the admin key: 10 failed logins per address per 15 minutes.
export class LoginThrottle {
  private failures = new Map<string, { count: number; resetAt: number }>();

  isBlocked(address: string, now = Date.now()): boolean {
    const entry = this.failures.get(address);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.failures.delete(address);
      return false;
    }
    return entry.count >= MAX_FAILURES;
  }

  recordFailure(address: string, now = Date.now()) {
    if (this.failures.size > 10_000) {
      for (const [key, entry] of this.failures) if (entry.resetAt <= now) this.failures.delete(key);
    }
    const entry = this.failures.get(address);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(address, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
    } else {
      entry.count++;
    }
  }

  reset(address: string) {
    this.failures.delete(address);
  }
}
