// Runs ZamWriter against the mock Pangram + StealthGPT API, so the whole
// flow can be tried without API keys or credits.
import { MOCK_PANGRAM_KEY, MOCK_STEALTH_KEY, startMockUpstream } from "../test/mock-upstream";

const mock = startMockUpstream();
Object.assign(process.env, {
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || "demo-admin-key-change-me",
  PANGRAM_API_KEY: MOCK_PANGRAM_KEY,
  PANGRAM_API_URL: `${mock.url}/pangram`,
  PANGRAM_PLAGIARISM_URL: `${mock.url}/pangram/plagiarism`,
  STEALTHGPT_API_KEY: MOCK_STEALTH_KEY,
  STEALTHGPT_API_URL: mock.url,
});

await import("../server");
console.log(`Demo mode: using mock APIs. Sign in with ADMIN_API_KEY=${process.env.ADMIN_API_KEY}`);
