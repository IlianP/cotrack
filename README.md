# cotrack

**Tie up loose ends – together.** Live tracking of open points for people who work with AI assistants.

When you work with Claude, ChatGPT & co. across long conversations, things get lost: decisions you still
have to make, tasks the AI promised to do, ideas, risks. *cotrack* keeps these open points in one live list
per project. You edit it in a responsive web app; your AI assistants read and update it through an HTTP API
(and soon an MCP server). Every item has a stable reference like `T3` or `A4` that is **never reused**, so you can
talk about it in any chat.

> 🇩🇪 Die Methodik hinter cotrack (Kategorien, Regeln, Bezug zu PRINCE2/RAID) ist in
> [docs/METHODIK.md](docs/METHODIK.md) beschrieben.

## Features (prototype)

- **Categories** – default set: **A** action (yours or the AI's) · **D** decision · **I** idea (💡) · **W** warning (⚠). Configurable.
- **Stable references** per project and category; dependencies (`D1 ▶A2` = D1 first, then A2; `A2 ⏸D1` = A2 waits for D1, computed both ways).
- **Projects** – one per GitHub repository (or anything else), plus a cross-project view. Each has a unique slug and an optional
  2–4 character **code** you choose (e.g. `CT`), used for qualified references like `CT:A14` when one conversation spans several projects.
- **Live** – the web app picks up changes made by you or an AI within a few seconds.
- **Chat footer** – generates the one-line summary used at the end of AI answers, e.g.
  `Du: D1 ▶A2 Lizenz · A5 Tokens · 🤖KI: A2 MCP-Server · 💡 I2 Sync · ⚠ W1 Auth` – by default one line per group
  (`layout=single` for one line).
- **STATUS.md export** – the "Offene Punkte" section for handovers.
- **Audit trail** – every change is logged with who made it (you or the AI).
- Responsive (phone, tablet, desktop), dark mode, no build step, no dependencies.

## Architecture

```
Browser (src/ui.html) ─┐
                       ├─► Cloudflare Worker (src/worker.js) ─► D1 (SQLite)
AI assistant (API) ────┘        Bearer token → actor "user" | "ai"
```

## Self-hosting

Requirements: a Cloudflare account and Node.js.

```bash
npm install
npx wrangler d1 create cotrack-db          # put the id into wrangler.toml
npm run db:migrate
npx wrangler secret put TOKEN_USER         # e.g. openssl rand -hex 24
npx wrangler secret put TOKEN_AI
npm run deploy
```

Open the worker URL, enter `TOKEN_USER`, create a project. Give `TOKEN_AI` to your AI assistant.

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
references are written qualified (`CT:A14`) and the footer gets one line per project (`CT ▸ Du: … · 🤖KI: …`).
Details: [docs/MCP.md](docs/MCP.md), [docs/METHODIK.md](docs/METHODIK.md).

## MCP server

`POST /mcp` (or `/mcp/<token>` for clients that cannot send headers) speaks the Model Context Protocol
(Streamable HTTP, stateless). Tools: `cotrack_projects`, `cotrack_status`, `cotrack_list`, `cotrack_get`, `cotrack_add`,
`cotrack_update`, `cotrack_convert`, `cotrack_footer`, `cotrack_changes`. Answers are compact text to save tokens.
Setup for Claude and ChatGPT (German): [docs/MCP.md](docs/MCP.md).

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
| GET / PATCH / DELETE | `/api/projects/:slug/items/:ref` | read / update / delete, e.g. `.../items/T3` or qualified `.../items/CT:A3` |
| POST | `/api/projects/:slug/items/:ref/convert` | accept an idea: `{kind: "A"}` → new item, idea closed with link |
| GET | `/api/projects/:slug/footer?format=text&since=ISO&max=8&delta=1&layout=multi\|single` | chat footer (`layout=multi`, the default for now: one line per group; `single`: one line; `delta=1`: only `neu: … · erledigt: …`) |
| GET | `/api/footer?projects=CT,TEST&format=text&since=ISO&delta=1&layout=` | footer for several projects, one block each (`CT ▸ …`) |
| GET | `/api/projects/:slug/status.md` | "Offene Punkte" section for `docs/STATUS.md` |
| GET | `/api/projects/:slug/events?after=` | change log |
| GET | `/api/items?owner=user&status=open&format=text` | items across all projects |
| GET / POST | `/api/kinds` | list / create-or-update categories |

Status values: `open`, `doing`, `blocked`, `done`, `dropped`. Owners: `user`, `ai` or any name (default: the creator).
`seq` lets you import an existing reference (e.g. `T3` from a chat); a reference that was ever used is rejected.

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
- WebSocket live updates (Durable Objects)
- Proper login (Cloudflare Access / OAuth) and multi-user support
- Methodology v2 – see [docs/METHODIK.md](docs/METHODIK.md)

## License

[MIT](LICENSE)
