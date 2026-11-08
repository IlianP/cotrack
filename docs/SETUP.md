# Setting up cotrack – step by step

**English** · [Deutsch](SETUP.de.md)

This guide puts cotrack on **your own free Cloudflare account**, even if you have never used Cloudflare before. At the end
you have your own address such as `https://cotrack.your-name.workers.dev` and connect your AI assistant to it. Time: about
20 minutes.

> **Your address:** Wherever the docs say `<your-address>`, use the address you get in step 7 (without a trailing slash).
> The address `cotrack.ilianos1.workers.dev` in examples belongs to the author, not to you.

## Shortcut: let your AI assistant do steps 3 to 7

If your AI assistant can run commands itself – e.g. **Claude Code** in a terminal – or has a **Cloudflare connector (MCP)**,
it can do steps 3 to 7 for you. You only:

1. **Step 1:** create the Cloudflare account (no AI can do that for you).
2. During **login (step 4)**, click "Allow" in the browser window that opens.
3. Do **step 6 (tokens) yourself**, so your tokens don't end up in the chat history.

Example request to your assistant:

> Set up cotrack from https://github.com/IlianP/cotrack on my Cloudflare account, exactly following docs/SETUP.md,
> steps 3, 4, 5 and 7. Skip step 6 (tokens), I'll do that myself. Tell me my cotrack address at the end.

Then continue with steps 6 and 8.

## What you need

- A **Cloudflare account** (free; step 1). You don't need your own domain.
- **Node.js**, a current LTS version (20 or newer): <https://nodejs.org> → download "LTS" and install it.
- A **terminal**: "Terminal" on macOS, "PowerShell" on Windows, your usual terminal on Linux.
- Optionally **git**. Without git you download the code as a ZIP (step 2).

## 1. Create a Cloudflare account

1. Open <https://dash.cloudflare.com/sign-up>, enter email and password.
2. Open the confirmation email and click the link.
3. Done. The free plan is enough for cotrack. If Cloudflare asks for a domain or a plan, you can skip it.

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

## 6. Choose two tokens (do this yourself)

cotrack has no password login; it uses two secret tokens. **Cloudflare does not create them** – you generate them
yourself (command below) and store them at Cloudflare in step 7. They are two different values:

| Token | Who uses it |
|---|---|
| `TOKEN_USER` | you: the web app, and approving claude.ai/ChatGPT when they connect |
| `TOKEN_AI` | AI assistants that need a fixed token (Claude Code, scripts) |

Generate two random tokens (run twice; works on macOS, Windows and Linux):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Store the first value as `TOKEN_USER` and the second as `TOKEN_AI` in a **password manager**. Anyone who knows a token
can read and change your items. If you only use claude.ai or ChatGPT, day to day you only need `TOKEN_USER` (web app and
consent page); create `TOKEN_AI` anyway, e.g. for Claude Code.

Replacing a token (e.g. because it was visible somewhere): generate a new value and store it again with the same command
from step 7. Then use the new value everywhere the old one was used.

You add the tokens in step 7, right after the first deploy.

## 7. Publish and add the tokens

```bash
npm run deploy
```

The very first time, wrangler may ask for a **workers.dev name** (e.g. `your-name`); it becomes part of your address.
At the end the terminal shows your address, e.g.:

```
https://cotrack.your-name.workers.dev
```

**That is `<your-address>`.** Write it down.

Now add the tokens. Each command asks for the value; paste the respective token:

```bash
npx wrangler secret put TOKEN_USER
npx wrangler secret put TOKEN_AI
```

Without a terminal you can do this in the browser: <https://dash.cloudflare.com> → **Workers & Pages** → **cotrack** →
**Settings** → **Variables and Secrets** → **Add** → type "Secret", name `TOKEN_USER` or `TOKEN_AI`, paste the value, save.

## 8. Try it and connect your AI

1. Open `<your-address>` in the browser, enter `TOKEN_USER` and create a first project.
2. Connect your AI assistant (details in [MCP.md](MCP.md), German):
   - **claude.ai / ChatGPT:** add a connector with the URL `<your-address>/mcp` (no token). When connecting, the cotrack
     consent page opens; enter `TOKEN_USER` and choose "Zugriff erlauben" (allow).
   - **Claude Code:**
     ```bash
     claude mcp add --transport http cotrack <your-address>/mcp --header "Authorization: Bearer <TOKEN_AI>"
     ```
3. Install the matching prompt: [PROMPT.en.md](PROMPT.en.md) (part 1 + part 2).

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
| The web app says "unauthorized" | Token copied wrongly, or the tokens from step 7 are missing. |
| Error "no such table" | `npm run db:migrate` was not run. |
