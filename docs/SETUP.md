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
3. Do **step 6 (token) yourself**, so your token doesn't end up in the chat history.

Example request to your assistant:

> Set up cotrack from https://github.com/IlianP/cotrack on my Cloudflare account, exactly following docs/SETUP.md,
> steps 3, 4, 5 and 7. Skip step 6 (token), I'll do that myself; don't store anything in step 7. Tell me my cotrack address at the end.

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
| The web app says "unauthorized" | Token copied wrongly, or the token from step 7 is missing. |
| Error "no such table" | `npm run db:migrate` was not run. |
