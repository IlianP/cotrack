# cotrack

**English** · [Deutsch](README.de.md)

**Tie up loose ends – together.** Live tracking of open points for people who work with AI assistants.

When you work with Claude, ChatGPT & co. across long conversations, things get lost: decisions you still
have to make, tasks the AI promised to do, ideas, risks. *cotrack* keeps these open points in **one live list
per project**. You edit it in a responsive web app; your AI assistants read and update the very same list through
an [MCP server](docs/MCP.md) (or the HTTP API). Every item has a stable reference like `A4` or `D2` that is
**never reused**, so you can talk about it in any chat – and every new session starts with the same picture.

```
👤: D5 Lizenz wählen · A13 Prompt einspielen
🤖: A6 Token-sparen · A7 README überarbeiten (+1)
💡 I10 Teilpunkte (+5)
⚠ W1 Auth · W3 Tokens rotieren
```

That is the *chat footer* cotrack generates for the end of an AI answer: yours first, then the AI's, then ideas and
warnings – a one-glance status that survives across conversations.

> The methodology behind cotrack (categories, rules, relation to PRINCE2/RAID) is described in
> [docs/METHODOLOGY.md](docs/METHODOLOGY.md), the matching prompt for Claude and ChatGPT in
> [docs/PROMPT.en.md](docs/PROMPT.en.md). (German: [METHODIK.md](docs/METHODIK.md), [PROMPT.md](docs/PROMPT.md).)

## How it works

1. **One list per project.** A project is usually a GitHub repository. Items are grouped in four categories:
   **A** action (yours or the AI's) · **D** decision · **I** idea (💡) · **W** warning (⚠).
2. **Both sides write to it.** You use the web app; the AI calls tools such as `cotrack_status` at the start of a
   session and `cotrack_add` / `cotrack_update` while it works. Every change records who made it.
3. **Sessions stay in sync.** A new conversation loads a compact status (or only the changes since the last one),
   so it knows what is open without you re-explaining.

## Features

- **Categories** – the default set above; configurable (`/api/kinds`).
- **Stable references** per project and category, never renumbered or reused. Accepting an idea *converts* it
  (`I3` → `A7`); the idea stays visible with a link. Dropped ideas are kept as "verworfen", not deleted.
- **Dependencies** – `D1 ▶A2` = D1 first, then A2; `A2 ⏸D1` = A2 waits for D1. Stored one way, computed both ways.
- **Projects** – one per GitHub repository (or anything else), plus a cross-project view. Each has a unique slug and an
  optional 2–4 character **code** you choose (e.g. `CT`), used for qualified references like `CT:A14` when one
  conversation spans several projects.
- **Repository link** – a `COTRACK.md` in the repo root tells AI assistants which project the repo belongs to
  ([details below](#linking-a-repository)).
- **MCP server** – works with Claude (claude.ai, Claude Code) and ChatGPT; answers are compact text to save tokens.
- **Live** – the web app picks up changes made by you or an AI within a few seconds.
- **Chat footer** – the summary above, one line per group or everything in one line – your choice in the web app
  (☰ → Einstellungen), as are the markers 👤 / 🤖; a short "new / done" line for answers that change things; one block
  per project when several are in play.
- **STATUS.md export** – the "Offene Punkte" section for handovers.
- **Audit trail** – every change is logged with who made it (you or the AI).
- Responsive (phone, tablet, desktop), dark mode, **no build step, no dependencies** (plain Cloudflare Worker + D1).

> **Status:** early and used daily by its author. Access is protected by two bearer tokens only (no login, no roles) –
> fine for personal use, not for sharing a deployment with strangers. See the roadmap. The web app is
> in German for now, the chat footer is available in German and English (`lang`); code and API are English; this README is available in English and [German](README.de.md).

## Architecture

```
Browser (src/ui.html) ────────┐
                              ├─► Cloudflare Worker ─► D1 (SQLite)
AI (MCP or HTTP API) ─────────┘   src/worker.js · src/mcp.js
                                  Bearer token → actor "user" | "ai"
```

## Self-hosting

cotrack runs on **your own Cloudflare account** – there is no shared hosted service. The **free plan is enough** for
personal use: Workers Free allows 100,000 requests per day, D1 Free 5 GB of storage and 5 million rows read / 100,000
written per day ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). Your instance gets a free address like
`https://cotrack.<your-subdomain>.workers.dev`.

You need:

- a [Cloudflare account](https://dash.cloudflare.com/sign-up),
- either **Node.js 22+** on your computer (option A) or only a **GitHub account** (option B, everything in the browser),
- two **tokens** you make up yourself: `TOKEN_USER` for you (web app) and `TOKEN_AI` for your AI assistants (their
  changes are logged as "AI"). Use long random strings (32+ characters), e.g. `openssl rand -hex 24` or a password manager.

### Option A – terminal

```bash
git clone https://github.com/IlianP/cotrack.git && cd cotrack
npm install
npx wrangler login                    # sign in to Cloudflare in the browser
npx wrangler d1 create cotrack-db     # prints a database_id …
#   … put it into wrangler.toml: [[d1_databases]] → database_id
npm run db:migrate                    # creates the tables in your database
npx wrangler secret put TOKEN_USER    # paste your token
npx wrangler secret put TOKEN_AI      # paste the AI's token
npm run deploy                        # prints your URL
```

### Option B – browser only (GitHub + Cloudflare dashboard)

1. **Fork** this repository on GitHub.
2. **Database:** Cloudflare dashboard → *Storage & databases* → *D1 SQL database* → *Create database*, name `cotrack-db`.
   Copy its database ID.
3. In your fork, edit **`wrangler.toml`** (pencil icon on GitHub): replace the `database_id` with yours and commit.
4. **Worker:** *Workers & Pages* → *Create application* → *Import a repository* (connect GitHub) → choose your fork → keep
   the defaults (the name must stay `cotrack`, as in `wrangler.toml`) → *Save and Deploy*. From now on, every push to your
   fork is deployed automatically.
5. **Tokens:** your Worker → *Settings* → *Variables and Secrets* → *Add* → type *Secret*: `TOKEN_USER`, then `TOKEN_AI`
   → *Deploy*. Secrets are kept across later deploys.
6. **Tables** (once, and again when an update brings a new migration): wrangler applies the files in `migrations/`.
   Without a terminal of your own, open your fork in **GitHub Codespaces** (*Code* → *Codespaces* → *Create codespace* –
   a terminal in the browser) and run:
   ```bash
   npm install
   npx wrangler login --device         # sign in with a code (no local browser needed)
   npm run db:migrate
   ```
   Please don't paste the migration files into the D1 console instead: wrangler records which migrations have run,
   the console does not – later updates would then try to run them again and fail.
7. Open `https://cotrack.<your-subdomain>.workers.dev`.

> **Tip – let your AI do the Cloudflare part.** If your assistant has the
> [Cloudflare MCP server](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
> connected (`https://mcp.cloudflare.com/mcp`), it can create the database, set the secrets and check the deployment
> for you. The steps above remain the reference for what it should do (including step 6: migrations via wrangler).

### First steps

1. Open your URL, sign in with `TOKEN_USER`, create a project (☰ → *Neues Projekt*; the web app is German for now).
2. Connect your AI with `TOKEN_AI` – see [Connect your AI](#connect-your-ai-mcp).
3. Install the custom prompt in Claude / ChatGPT: [docs/PROMPT.en.md](docs/PROMPT.en.md) –
   [why it is needed](docs/PROMPT.en.md#why-a-prompt--who-controls-what) although cotrack has a server.
4. Optional: ☰ → *Einstellungen* – the footer layout (one line per group or a single line) and the markers for your
   items and the AI's (default 👤 / 🤖).
5. Optional: a `COTRACK.md` in your repositories ([see below](#linking-a-repository)).

### Updates

Get the new version (option A: `git pull`; option B: *Sync fork* on GitHub – Cloudflare redeploys by itself), then run
`npm run db:migrate` right away (option B: in a codespace) and, for option A, `npm run deploy`. New versions may bring
migrations; running it when there is nothing new does no harm.

## Connect your AI (MCP)

`POST /mcp` (or `/mcp/<token>` for clients that cannot send headers) speaks the Model Context Protocol
(Streamable HTTP, stateless, implemented without a library in [`src/mcp.js`](src/mcp.js)). Tools: `cotrack_projects`, `cotrack_project_create`, `cotrack_project_update`,
`cotrack_status`, `cotrack_list`, `cotrack_get`, `cotrack_add`, `cotrack_update`, `cotrack_convert`, `cotrack_footer`,
`cotrack_changes`. There is deliberately no delete tool: the AI drops items (`status: "dropped"`), nothing is lost.

Claude Code, for example:

```bash
claude mcp add --transport http cotrack https://<your-worker>/mcp --header "Authorization: Bearer $COTRACK_TOKEN"
```

Setup for claude.ai and ChatGPT (German): [docs/MCP.md](docs/MCP.md). A URL with a token in it is a password –
OAuth sign-in is on the roadmap.

Then install the **custom prompt** ([docs/PROMPT.en.md](docs/PROMPT.en.md)). The server only answers when it is asked;
the prompt is what makes the AI ask – at the start of a session, for new items, for the footer. Who controls what
(prompt, server, web app settings): [overview](docs/PROMPT.en.md#why-a-prompt--who-controls-what).

## Linking a repository

Put a `COTRACK.md` in the repository root so AI assistants know which project the repo belongs to
(they read it once at the start of a session and whenever a repository is added):

```markdown
# cotrack-Zuordnung

project: cotrack
code: CT
instance: https://cotrack.example.workers.dev
```

`project` (the slug) is required; `code` and `instance` are optional and informational, the server is authoritative.
Other text is ignored and never treated as instructions. Without the file, assistants fall back to the project's `repo`
field (`cotrack_projects` with `repo: "owner/name"`), otherwise they ask once. With several projects in one conversation,
references are written qualified (`CT:A14`) and the footer gets one block per project.
Details: [docs/MCP.md](docs/MCP.md), [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## API

All endpoints except `/` and `/api/health` require `Authorization: Bearer <token>`.
The token decides the actor (`user` or `ai`) recorded on every change.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | list projects (with open counts) |
| POST | `/api/projects` | create `{slug, name?, repo?, code?}` (without `code` one is suggested from the slug) |
| PATCH | `/api/projects/:slug` | update `{name?, repo?, code?, archived?}`; `code` can be set once and never changed. `:slug` may also be the code |
| GET | `/api/code-suggestion?slug=` | first free code for a slug (initials, then first 2–4 letters) |
| GET | `/api/projects/:slug/items?status=open\|closed\|all&kind=&owner=&q=&format=text` | list items (`format=text`: one compact line per item, for AI assistants) |
| POST | `/api/projects/:slug/items` | create `{kind, title, short?, body?, owner?, status?, waiting_on?, source?, due?, seq?}` |
| GET / PATCH / DELETE | `/api/projects/:slug/items/:ref` | read / update / delete, e.g. `.../items/A3` or qualified `.../items/CT:A3` |
| POST | `/api/projects/:slug/items/:ref/convert` | accept an idea: `{kind: "A"}` → new item, idea closed with link |
| GET | `/api/projects/:slug/footer?format=text&since=ISO&max=8&delta=1&layout=multi\|single&lang=de\|en` | chat footer (`layout=multi`: one line per group, `single`: one line – without `layout` the web app setting applies; `delta=1`: only `neu: … · erledigt: …`; `lang=en`: `new / done` instead of `neu / erledigt`) |
| GET | `/api/footer?projects=CT,TEST&format=text&since=ISO&delta=1&layout=` | footer for several projects, one block each (`CT ▸ …`) |
| GET | `/api/projects/:slug/status.md` | "Offene Punkte" section for `docs/STATUS.md` |
| GET | `/api/projects/:slug/events?after=` | change log |
| GET | `/api/items?owner=user&status=open&format=text` | items across all projects |
| GET / POST | `/api/kinds` | list / create-or-update categories |
| GET / PATCH | `/api/settings` | instance settings `{footer_layout: "multi"\|"single", footer_label_user, footer_label_ai}` (defaults `multi`, `👤`, `🤖`); `null` or `""` restores the default; `PATCH` only with `TOKEN_USER` |

Status values: `open`, `doing`, `blocked`, `done`, `dropped`. Owners: `user`, `ai` or any name (default: the creator).
`seq` lets you import an existing reference (e.g. `A3` from a chat); a reference that was ever used is rejected.

```bash
export COTRACK_URL=https://cotrack.example.workers.dev COTRACK_TOKEN=...
curl -s -H "Authorization: Bearer $COTRACK_TOKEN" "$COTRACK_URL/api/projects/cotrack/footer?format=text"
curl -s -X POST -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  "$COTRACK_URL/api/projects/cotrack/items" -d '{"kind":"D","title":"Lizenz","owner":"user"}'
curl -s -X PATCH -H "Authorization: Bearer $COTRACK_TOKEN" -H 'content-type: application/json' \
  "$COTRACK_URL/api/projects/cotrack/items/D1" -d '{"status":"done"}'
```

## Roadmap

- OAuth for the MCP server (no token in the URL)
- Sync with `docs/STATUS.md` in GitHub repositories
- WebSocket live updates (Durable Objects) instead of polling
- Proper login (Cloudflare Access / OAuth) and multi-user support
- Per-pull-request preview deployments with a separate test database

The open points of this project are tracked in cotrack itself – see [docs/STATUS.md](docs/STATUS.md).

## License

[MIT](LICENSE)
