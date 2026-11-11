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
⚠️ W1 Auth · W3 Tokens rotieren
```

That is the *chat footer* cotrack generates for the end of an AI answer: yours first, then the AI's, then ideas and
warnings – a one-glance status that survives across conversations.

> The methodology behind cotrack (categories, rules, relation to PRINCE2/RAID) is described in
> [docs/METHODOLOGY.md](docs/METHODOLOGY.md), the matching prompt for Claude and ChatGPT in
> [docs/PROMPT.en.md](docs/PROMPT.en.md). (German: [METHODIK.md](docs/METHODIK.md), [PROMPT.md](docs/PROMPT.md).)

## How it works

1. **One list per project.** A project is usually a GitHub repository. Items are grouped in four categories:
   **A** action (yours or the AI's) · **D** decision · **I** idea (💡) · **W** warning (⚠️).
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
  (☰ → Chat footer → Customize), as are the markers 👤 / 🤖; a short "new / done" line for answers that change things; one block
  per project when several are in play.
- **PrioFlow** – a skill that has the AI rate the open items and guide you through the next ones
  ([details below](#prioflow-what-is-next)).
- **STATUS.md export** – the "Offene Punkte" section for handovers.
- **Audit trail** – every change is logged with who made it (you or the AI).
- **Installable as an app** – Chrome/Edge on Android and the desktop: ☰ → *Install as app*; cotrack then runs in its own
  window with its own entry in the app switcher, and on Android links to it open in the app. iOS: Share → *Add to Home Screen*.
- Responsive (phone, tablet, desktop), dark mode (follows the system, or set light/dark in ☰), German and English (follows the
  browser language, or choose in ☰), **no build step, no dependencies** (plain Cloudflare Worker + D1).

> **Status:** early and used daily by its author. Access is protected by a single secret token only (no login, no roles) –
> fine for personal use, not for sharing a deployment with strangers. See the roadmap. The web app and the
> chat footer are available in German and English (footer: `lang`); code and API are English; this README is available in English and [German](README.de.md).

## Architecture

```
Browser (src/ui.html) ────────┐
                              ├─► Cloudflare Worker ─► D1 (SQLite)
AI (MCP or HTTP API) ─────────┘   src/worker.js · src/mcp.js · src/oauth.js
                                  Bearer token or OAuth → actor "user" | "ai"
```

## Self-hosting

**New to Cloudflare?** Follow the step-by-step guide [docs/SETUP.md](docs/SETUP.md): it covers creating a free account,
deploying (in a terminal or only in the browser), your token and connecting your AI – and which steps your AI assistant
can do for you. cotrack runs on **your own Cloudflare account**; the free plan is enough for personal use.

Short version for those who know Cloudflare (requirements: a Cloudflare account and Node.js 22+):

```bash
npm install
npx wrangler login
npx wrangler d1 create cotrack-db          # put the id into wrangler.toml
npm run db:migrate
npm run deploy                             # prints your address, e.g. https://cotrack.<you>.workers.dev
npx wrangler secret put TOKEN_USER         # your token, e.g. openssl rand -hex 24
```

Open your worker address, enter your token, create a project. Connect your AI with `<your-address>/mcp` (OAuth; you confirm
once with your token). Optional `TOKEN_AI`: a fixed token for AI tools without a browser, see [docs/MCP.md](docs/MCP.md).
Footer layout and markers: ☰ → *Chat footer → Customize* in the web app.
After pulling updates, run `npm run db:migrate` again before deploying – new versions may add migrations.

## Connect your AI (MCP)

`POST /mcp` speaks the Model Context Protocol
(Streamable HTTP, stateless, implemented without a library in [`src/mcp.js`](src/mcp.js)). Tools: `cotrack_projects`, `cotrack_project_create`, `cotrack_project_update`,
`cotrack_status`, `cotrack_list`, `cotrack_get`, `cotrack_add`, `cotrack_update`, `cotrack_convert`, `cotrack_footer`,
`cotrack_changes`. There is deliberately no delete tool: the AI drops items (`status: "dropped"`), nothing is lost.

Claude Code, for example (then `/mcp` → `cotrack` → authenticate):

```bash
claude mcp add --transport http cotrack <your-address>/mcp
```

**claude.ai and ChatGPT** connect via **OAuth** ([`src/oauth.js`](src/oauth.js), no library): add a connector with the
URL `<your-address>/mcp`; cotrack opens a consent page once, you confirm with your token, and the app gets
short-lived tokens that act as `ai`. No secret appears in the URL (the old form `/mcp/<token>` has been removed).
Step by step (German): [docs/MCP.md](docs/MCP.md).

Then install the **custom prompt** ([docs/PROMPT.en.md](docs/PROMPT.en.md)). The server only answers when it is asked;
the prompt is what makes the AI ask – at the start of a session, for new items, for the footer. Who controls what
(prompt, server, web app settings): [overview](docs/PROMPT.en.md#why-a-prompt--who-controls-what).

## PrioFlow: what is next?

Instead of picking items from the list yourself, you call the **PrioFlow** skill. The AI fetches all open items, rates
them, proposes the next three and starts with the first one right away: for a decision with options and a
recommendation, for a task with one concrete first step. It records the result in cotrack immediately and takes the
next item until you say "stop". It weighs what unblocks other items, what is quick to do, what has a deadline or has been
lying around, and what moves the project forward most; warnings count as weight. Along the way it offers its own tasks,
and from ten open ideas on there is a short idea round.

The model does the rating, not the server. A different model or more reasoning effort changes the result without any
change to cotrack.

| Where | Setup | Call |
|---|---|---|
| Claude Code, in this repository | already there (`.claude/skills/prioflow`, German) | `/prioflow` |
| Claude Code, in all projects | copy the folder `skills/en/prioflow` to `~/.claude/skills/` | `/prioflow` |
| claude.ai | upload a ZIP of the folder: Customize → Skills → "+" → Upload a skill (needs code execution) | "PrioFlow" or "PrioFlow!" |

```bash
cd skills/en && zip -r prioflow.zip prioflow
```

Arguments: `all` (all projects), `ideas` (straight to the idea round) or a project code. The German version is in
[`skills/de/prioflow`](skills/de/prioflow/SKILL.md). The skill needs no line in the prompt; it is not set up for ChatGPT.

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

All endpoints except `/`, `/api/health` and the OAuth endpoints for MCP clients (`/.well-known/…`, `/register`,
`/authorize`, `/token`, `/revoke`; see [docs/MCP.md](docs/MCP.md)) require `Authorization: Bearer <token>`.
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

- Sync with `docs/STATUS.md` in GitHub repositories
- WebSocket live updates (Durable Objects) instead of polling
- Proper login (Cloudflare Access / OAuth) and multi-user support
- Per-pull-request preview deployments with a separate test database

The open points of this project are tracked in cotrack itself – see [docs/STATUS.md](docs/STATUS.md).

## License

[MIT](LICENSE)
