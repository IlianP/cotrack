# Setting up cotrack – step by step

**English** · [Deutsch](SETUP.de.md)

This guide puts cotrack on **your own free Cloudflare account**, even if you have never used Cloudflare before. At the end
you have your own address such as `https://cotrack.your-name.workers.dev` and connect your AI assistant to it. Time: about
20 minutes.

> **Your address:** Wherever the docs say `<your-address>`, use the address you get in step 7 (without a trailing slash).
> The address `cotrack.ilianos1.workers.dev` in examples belongs to the author, not to you.

## Shortcut: let your AI assistant do steps 3 to 7

If your AI assistant can run commands itself – e.g. **Claude Code** in a terminal – or has the **[Cloudflare connector (MCP)](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)** (`https://mcp.cloudflare.com/mcp`),
it can do steps 3 to 7 for you. You only:

1. **Step 1:** create the Cloudflare account (no AI can do that for you).
2. During **login (step 4)**, click "Allow" in the browser window that opens.
3. Do **step 6 (token) yourself**, so your token doesn't end up in the chat history.

Example request to your assistant:

> Set up cotrack from https://github.com/IlianP/cotrack on my Cloudflare account, exactly following docs/SETUP.md,
> steps 3, 4, 5 and 7. Skip step 6 (token), I'll do that myself; don't store anything in step 7. Tell me my cotrack address at the end.

Then continue with steps 6 and 8.

## What you need

- A **Cloudflare account** (free; step 1). You don't need your own domain.
- **Node.js**, a current LTS version (22 or newer – the current `wrangler` requires it): <https://nodejs.org> → download "LTS" and install it.
- A **terminal**: "Terminal" on macOS, "PowerShell" on Windows, your usual terminal on Linux.
- Optionally **git**. Without git you download the code as a ZIP (step 2).

> **No terminal?** Everything also works in the browser with a GitHub account – see
> [Browser only](#browser-only-github--cloudflare-dashboard).

## 1. Create a Cloudflare account

1. Open <https://dash.cloudflare.com/sign-up>, enter email and password.
2. Open the confirmation email and click the link.
3. Done. The free plan is enough for cotrack (Workers: 100,000 requests per day; D1: 5 GB, 5 million rows read and
   100,000 written per day – [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). If Cloudflare asks for a domain or a plan, you can skip it.

## 2. Get the code

With git:

```bash
git clone https://github.com/IlianP/cotrack.git
cd cotrack
```

Without git: on <https://github.com/IlianP/cotrack> click **Code → Download ZIP**, unpack it and change into the unpacked
folder in the terminal (type `cd ` and drag the folder into the terminal window).

## 3. Install the tools

```bash
npm install
```

This installs `wrangler`, Cloudflare's command-line tool. Run all following commands in the `cotrack` folder.

## 4. Log in to Cloudflare

```bash
npx wrangler login
```

A browser window opens: sign in with your Cloudflare account and click **Allow**. The terminal then shows
"Successfully logged in".

## 5. Create the database

```bash
npx wrangler d1 create cotrack-db
```

The output contains a line like `database_id = "1234abcd-…"`. Open the file **`wrangler.toml`** in the `cotrack` folder in a
text editor and replace the existing `database_id` with yours:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cotrack-db"
database_id = "1234abcd-…"   # ← your ID from the output
migrations_dir = "migrations"
```

Save, then create the tables (confirm the prompt with `y`):

```bash
npm run db:migrate
```

## 6. Choose your token (do this yourself)

cotrack has no password login; it uses **one secret token** – a long random string that you keep like a password.
**Cloudflare does not create it**: you generate it yourself and store it at Cloudflare in step 7. You need it for the web app
and once whenever you connect an AI assistant.

Generate the token (works on macOS, Windows and Linux):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Store the value in a **password manager**. Anyone who knows it can read and change your items.

Replacing the token (e.g. because it was visible somewhere): generate a new value and store it again as in step 7; then sign
in to the web app with the new value. Connected AI assistants stay connected.

## 7. Publish and store the token

```bash
npm run deploy
```

The very first time, wrangler may ask for a **workers.dev name** (e.g. `your-name`); it becomes part of your address.
At the end the terminal shows your address, e.g.:

```
https://cotrack.your-name.workers.dev
```

**That is `<your-address>`.** Write it down.

Now store the token. The command asks for the value; paste your token from step 6:

```bash
npx wrangler secret put TOKEN_USER
```

Without a terminal you can do this in the browser: <https://dash.cloudflare.com> → **Workers & Pages** → **cotrack** →
**Settings** → **Variables and Secrets** → **Add** → type "Secret", name `TOKEN_USER`, paste the value, save.

## 8. Try it and connect your AI

1. Open `<your-address>` in the browser, enter your token and create a first project.
2. Connect your AI assistant – always with just the address, no token (details in [MCP.md](MCP.md), German):
   - **claude.ai / ChatGPT:** add a connector with the URL `<your-address>/mcp`. When connecting, the cotrack consent page
     opens: enter your token and choose "Zugriff erlauben" (allow).
   - **Claude Code:**
     ```bash
     claude mcp add --transport http cotrack <your-address>/mcp
     ```
     Then type `/mcp` in Claude Code, pick `cotrack` and authenticate; the same consent page opens in the browser.

   The assistant gets its own short-lived credentials. It never sees your token, and its changes are logged as "AI".
3. Install the matching prompt: [PROMPT.en.md](PROMPT.en.md) (part 1 + part 2) –
   [why it is needed](PROMPT.en.md#why-a-prompt--who-controls-what) although cotrack has a server.
4. Optional: in the web app ☰ → **Settings** – footer layout (one line per group or a single line) and the markers
   for your items and the AI's (default 👤 / 🤖).

## Browser only: GitHub + Cloudflare dashboard

Without Node.js and terminal – you need a GitHub account in addition. Cloudflare then builds directly from your copy of the
repository.

1. Create the Cloudflare account (step 1) and **fork** <https://github.com/IlianP/cotrack> on GitHub.
2. **Database:** <https://dash.cloudflare.com> → **Storage & databases** → **D1 SQL database** → **Create database**, name
   `cotrack-db`. Copy its database ID.
3. In your fork, open **`wrangler.toml`** (pencil icon), replace `database_id` with your ID and commit.
4. **Worker:** **Workers & Pages** → **Create application** → **Import a repository** (connect GitHub) → your fork. Keep the
   name `cotrack` (as in `wrangler.toml`), enter `npm run db:migrate` as build command and `npx wrangler deploy` as deploy
   command → **Save and Deploy**. The build creates the tables; from now on every push to your fork is published.
5. **Token:** let your password manager generate a long random value (32+ characters) and store it: **cotrack** →
   **Settings** → **Variables and Secrets** → **Add** → type "Secret", name `TOKEN_USER` → save. Secrets are kept on later
   deploys.
6. Your address is shown on the Worker's overview page. Continue with step 8.

Updates: **Sync fork** on GitHub – Cloudflare builds, migrates and publishes by itself.

If the build log says the migration failed (e.g. missing permission for D1), run it once from a terminal instead:
`npm install`, `npx wrangler login`, `npm run db:migrate`. A terminal in the browser is enough, e.g. **GitHub Codespaces**
(on your fork: **Code → Codespaces → Create codespace**; log in there with `npx wrangler login --device`). Please don't paste
the migration files into the D1 console: it doesn't record which migrations ran, and later updates would then fail.

## Updates

```bash
git pull            # or download the new ZIP
npm install
npm run db:migrate  # new versions may add tables
npm run deploy
```

Optionally Cloudflare can publish automatically on every push: fork the repository on GitHub, then in the dashboard go to
**Workers & Pages → cotrack → Settings → Builds → Connect** and enter `npm run db:migrate` as build command and
`npx wrangler deploy` as deploy command.

## Troubleshooting

| Message | Fix |
|---|---|
| `wrangler: command not found` or `npx` unknown | Node.js is not installed, or the terminal was opened before installing it – reopen the terminal. |
| `Couldn't find a D1 DB with the name or binding` | `database_id` in `wrangler.toml` is still the author's – repeat step 5. |
| The web app says "unauthorized" | Token copied wrongly, or the token from step 7 is missing. |
| Error "no such table" | `npm run db:migrate` was not run. |
| npm warns `EBADENGINE`, or wrangler does not start | Node.js is too old – install the current LTS (22 or newer). |
| Settings say "Not available yet … migration" (German: „Noch nicht verfügbar … Migration“) | `npm run db:migrate` was not run after the update. |
