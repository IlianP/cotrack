# cotrack – notes for AI assistants

- Plain Cloudflare Worker, **no build step**: `src/worker.js` (API + routing) imports `src/ui.html` as text.
  MCP server in `src/mcp.js`; OAuth 2.1 for MCP clients (claude.ai, ChatGPT) in `src/oauth.js` – security-relevant:
  changes there go through a branch + PR. OAuth tokens only ever act as `ai` and are valid only on `/mcp`.
  Schema in `migrations/` (D1). Keep it dependency-free.
- Live instance: https://cotrack.ilianos1.workers.dev – project slug `cotrack` tracks this repo's own open points.
- `COTRACK.md` (repo root) maps this repo to its cotrack project (`project:` = slug; `code:` = short code once set). Keep it in sync with the board.
- Open points of this project live in cotrack itself (project `cotrack`), never in `docs/STATUS.md` (that file only
  links to the board). Use the cotrack MCP tools if connected, otherwise the API with `COTRACK_TOKEN`:
  `curl -s -H "Authorization: Bearer $COTRACK_TOKEN" https://cotrack.ilianos1.workers.dev/api/projects/cotrack/footer?format=text`
- Keep references stable: never renumber, never reuse. Accepted ideas are converted (`/convert`), not edited.
- The web app is bilingual (German/English): it follows the browser language (de-* → German, anything else → English),
  switchable per device in ☰ (localStorage `cotrack.lang`). Every UI text lives in `STRINGS` in `src/ui.html` – add new
  texts in both languages (static markup: `data-t` / `data-t-attr`); built-in category names are translated client-side
  (`KIND_EN`). Code and API are English. The README exists in two languages: `README.md` (English, default) and `README.de.md` (German) – **change both together**. Methodology and prompt also exist in both languages: `docs/METHODIK.md` ↔ `docs/METHODOLOGY.md` and `docs/PROMPT.md` ↔ `docs/PROMPT.en.md` (current rules at the top of the methodology) – keep all four in sync. The footer language is selected with `lang=de|en` (`src/worker.js`); the English prompt asks for `en`.
- PrioFlow skill (the model rates open items and guides the user; no server logic): `skills/de/prioflow/SKILL.md` ↔
  `skills/en/prioflow/SKILL.md` – keep in sync. `.claude/skills/prioflow` is a symlink to the German one for sessions in this repo.
  Folder name must stay `prioflow` (= `name:` in the frontmatter, required for the claude.ai upload).
- Setup guide for people new to Cloudflare in both languages: `docs/SETUP.md` ↔ `docs/SETUP.de.md` – keep in sync. User-facing
  setup docs use the placeholder `<your-address>` / `<deine-adresse>`, never the author's instance.
- All user text in the UI must be rendered via `textContent` (the `h()` helper) – never `innerHTML`.
- Instance settings (table `settings`, migration 0006; web app ☰ → Einstellungen; `GET/PATCH /api/settings`) set the footer's
  default layout and group markers for API and MCP. Only the user token may change them; a `layout` in a request wins.
  Who controls what (prompt vs. server vs. settings) is explained in `docs/PROMPT.md` → "Wozu der Prompt?".
