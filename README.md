# ZamWriter

A private admin panel for humanizing text with [StealthGPT](https://www.stealthgpt.ai) and checking it for AI with [Pangram](https://www.pangram.com). The UI is built with Cloudflare's [Kumo](https://kumo-ui.com) components.

## Features

- **Two tabs, usable on their own or together.**
  - **Humanize**: paste text, pick StealthGPT's quality mode (Fast or Quality), model (Lite, Standard or Super) and output format, and humanize. Re-humanize any version, or edit one by hand. Every edit is saved as a new version.
  - **Pangram check**: paste text for a full Pangram report, or check any version of a document.
  - **In sequence**: after humanizing, one **Check with Pangram** click checks the new version. Turn on *Then check with Pangram* to have each rewrite checked automatically.
- **Every version is kept.** A document holds the original text plus every humanized or edited version. Versions never change after they are created. Each one keeps its own StealthGPT human score, settings, credits spent, Pangram result and plagiarism result.
- **Version comparison.** Compare a version side by side with its source. The report's *Versions* tab lists every version's StealthGPT score and Pangram verdict.
- **Full Pangram report.**
  - Highlighting for AI-generated, AI-assisted and human text, with tooltips for each segment.
  - Verdict, composition, humanizer detection, text statistics and confidence.
  - A graph, a document map and a score histogram.
  - A segment navigator (← / →).
  - An optional plagiarism check.
  - Export by printing to PDF, as a copied summary, as CSV, or as JSON.
- **Long runs are safe.** Humanize runs and Pangram checks are stored with their run/task id. They resume after a page reload instead of losing a result you paid for. Each humanize run sends an idempotency key, so a retry never charges twice.
- **Protected by an admin API key.** All API routes need a session or the key itself (see [Security](#security)).
- **Cost estimates.** Before each humanize run or Pangram check, ZamWriter shows its estimated price. Each version records what its run and check cost, each document shows its running total, and the header shows your remaining StealthGPT credits (see [Pricing](#pricing)).
- Organize documents with titles, tags and notes, and search across all of them. Light and dark themes, and a responsive layout.

## Setup

Requires [Bun](https://bun.sh) (tested with 1.4).

```bash
git clone https://github.com/karilaa-dev/pangram-webui.git zamwriter
cd zamwriter
bun install
cp .env.example .env   # then fill in the keys
bun run start
```

Open http://localhost:3000 and sign in with your `ADMIN_API_KEY`.

### Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `ADMIN_API_KEY` | – | **Required.** The key you sign in with. The server refuses to start without it. Use a long random value, e.g. `openssl rand -hex 32` |
| `PANGRAM_API_KEY` | – | Pangram API key. Pangram checks are disabled without it |
| `STEALTHGPT_API_KEY` | – | StealthGPT API key ([get one](https://www.stealthgpt.ai/stealthapi)). Humanizing is disabled without it |
| `PORT` | `3000` | Port the server listens on |
| `PANGRAM_API_URL` | `https://text.external-api.pangram.com` | Pangram detection API (task-based) |
| `PANGRAM_PLAGIARISM_URL` | `https://plagiarism.api.pangram.com` | Pangram plagiarism API |
| `STEALTHGPT_API_URL` | `https://www.stealthgpt.ai` | StealthGPT API base URL |

Bun loads `.env` automatically.

## Pricing

Both APIs bill per word. ZamWriter estimates each action's price from the published API rates and the model you pick:

| Action | Model | Rate | How it's counted |
| --- | --- | --- | --- |
| Humanize (StealthGPT) | Lite, Standard | $0.20 per 1,000 words | Input **plus** output words |
| Humanize (StealthGPT) | Super | $0.05 per 100 words ($0.50 per 1,000) | Input **plus** output words |
| Pangram check | Pangram 4 | $0.05 per 100 words | Words in the checked version, rounded up to the next 100 |
| Pangram check | Pangram 3 (legacy) | $0.05 per 1,000 words | Rounded up to the next 1,000 |

For example, a 412-word text costs:

- **Lite or Standard:** about $0.16 to humanize (≈ 824 words in + out).
- **Super:** about $0.41 to humanize.
- **Pangram 4:** $0.25 to check (5 × 100-word blocks).

How the numbers are worked out:

- **Estimates use your current choices.** Before a run, the humanize estimate assumes the rewrite is about as long as the input. Each model option shows its rate in the dropdown.
- **Costs are recorded per run.** After a run, ZamWriter records its cost from the actual input and output word counts. It also shows the credits StealthGPT reports spending.
- **Totals include re-checks.** Each document shows a running total that counts re-checks too.
- **Not covered:** Plagiarism checks are billed separately by Pangram. StealthGPT's starter pack, $100 for 500,000 words, isn't factored in either.

The rates are hard-coded in [`src/lib/pricing.ts`](src/lib/pricing.ts).

## Settings

The quality mode, model, output format and Pangram model selects have no "default" option. The first time, they start on the lowest option: Fast, Lite, plain text, and the oldest Pangram model the API lists. After that, ZamWriter remembers your latest choice in this browser.

## Security

- Signing in exchanges `ADMIN_API_KEY` for a session cookie. The cookie lasts 30 days and is `HttpOnly` and `SameSite=Strict`. It is also `Secure` when the request arrives over HTTPS.
- Sessions are signed with the admin key itself. Changing `ADMIN_API_KEY` signs out every session.
- The key is compared in constant time. Each IP address gets 10 failed sign-ins per 15 minutes. Behind a reverse proxy, all failures count against the proxy's address.
- Scripts can skip the login and send `Authorization: Bearer <ADMIN_API_KEY>`.
- The Pangram and StealthGPT keys stay on the server. The browser only talks to ZamWriter's own `/api/*` routes.
- Documents, versions and reports are stored in the browser's IndexedDB, not on the server. They are visible to anyone with access to that browser profile.
- Serve the panel over HTTPS when it is reachable beyond localhost.

## Development

```bash
bun run dev        # hot reload
bun run demo       # run against a built-in mock of Pangram + StealthGPT (no keys, no credits)
bun test           # server tests (auth, proxies, run polling) against the mock
bun run typecheck
```

### API

All routes except `/api/auth/*` require a session cookie or a Bearer token.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/auth/session` | Whether the request is signed in, plus which services are configured |
| `POST` | `/api/auth/login` | `{ key }` → sets the session cookie |
| `POST` | `/api/auth/logout` | Clears the session cookie |
| `POST` | `/api/humanizer/runs` | `{ text, qualityMode, model?, outputFormat, idempotencyKey? }` → starts a StealthGPT run |
| `GET` | `/api/humanizer/runs/:id` | Run status. Once `done`, includes `text`, `score`, `creditsSpent` and `remainingCredits` |
| `GET` | `/api/humanizer/balance` | Remaining StealthGPT credits |
| `GET` | `/api/pangram/models` | Detection models available to the Pangram key |
| `POST` | `/api/pangram/tasks` | `{ text, model }` → starts a Pangram detection task |
| `GET` | `/api/pangram/tasks/:id` | Task stage. Once `done`, includes the full result |
| `POST` | `/api/pangram/plagiarism` | `{ text }` → plagiarism check |

## License

MIT
