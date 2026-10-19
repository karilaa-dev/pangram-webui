import index from "./src/index.html";
import { loadConfig, type Config } from "./server/config";
import { createRoutes } from "./server/routes";

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

if (!config.pangram.apiKey) console.warn("PANGRAM_API_KEY is not set; Pangram checks are disabled.");
if (!config.stealth.apiKey) console.warn("STEALTHGPT_API_KEY is not set; humanizing is disabled.");

const server = Bun.serve({
  port: config.port,
  development: process.env.NODE_ENV !== "production",
  routes: {
    ...createRoutes(config),
    "/*": index,
  },
});

console.log(`ZamWriter running at ${server.url}`);
