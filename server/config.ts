export interface Config {
  port: number;
  adminKey: string;
  pangram: {
    apiKey?: string;
    apiUrl: string;
    plagiarismUrl: string;
  };
  stealth: {
    apiKey?: string;
    apiUrl: string;
  };
}

type Env = Record<string, string | undefined>;

const trimmed = (value: string | undefined) => value?.trim() || undefined;
const stripSlash = (url: string) => url.replace(/\/+$/, "");

export function loadConfig(env: Env = process.env): Config {
  const adminKey = trimmed(env.ADMIN_API_KEY);
  if (!adminKey) {
    throw new Error("ADMIN_API_KEY is not set. Add it to .env to protect the panel.");
  }
  if (adminKey.length < 16) {
    console.warn("Warning: ADMIN_API_KEY is shorter than 16 characters. Use a long random key.");
  }

  return {
    port: Number(env.PORT) || 3000,
    adminKey,
    pangram: {
      apiKey: trimmed(env.PANGRAM_API_KEY),
      apiUrl: stripSlash(env.PANGRAM_API_URL || "https://text.external-api.pangram.com"),
      plagiarismUrl: env.PANGRAM_PLAGIARISM_URL || "https://plagiarism.api.pangram.com",
    },
    stealth: {
      apiKey: trimmed(env.STEALTHGPT_API_KEY),
      apiUrl: stripSlash(env.STEALTHGPT_API_URL || "https://www.stealthgpt.ai"),
    },
  };
}
