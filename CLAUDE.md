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
- One language for everything (decision D19): ☰ → Sprache saves the instance setting `language` (de|en) on the server; it applies
  to the web app on every device and to what cotrack tells the AI. Not chosen ("Auto", no settings row): the web app follows the
  browser language (de-* → German, anything else → English), the AI gets German. localStorage `cotrack.lang` only caches it
  (`syncLang` in `src/ui.html`). Every UI text lives in `STRINGS` in `src/ui.html` – add new
  texts in both languages (static markup: `data-t` / `data-t-attr`); built-in category names are translated client-side
  (`KIND_EN`). Code and API are English. What cotrack tells the AI is bilingual too: MCP instructions, tool descriptions and
  answers (`INSTRUCTIONS`, `toolList`, `MSG` in `src/mcp.js`) and the text answers of the API (`TEXT` in `src/worker.js`) follow
  the setting `language` (default de); a `lang` in a request wins –
  change both languages together. The OAuth consent page (`PAGE_TEXT` in `src/oauth.js`) and the app manifest follow the
  browser's Accept-Language (`preferredLang`, same rule as the web app). The README exists in two languages: `README.md` (English, default) and `README.de.md` (German) – **change both together**. Methodology and prompt also exist in both languages: `docs/METHODIK.md` ↔ `docs/METHODOLOGY.md` and `docs/PROMPT.md` ↔ `docs/PROMPT.en.md` (current rules at the top of the methodology) – keep all four in sync. The footer language is selected with `lang=de|en` (`src/worker.js`; without it the `language` setting); the English prompt asks for `en`.
  The MCP guide exists in both languages: `docs/MCP.md` ↔ `docs/MCP.en.md` – keep in sync.
- PrioFlow skill (the model rates open items and guides the user; no server logic): `skills/de/prioflow/SKILL.md` ↔
  `skills/en/prioflow/SKILL.md` – keep in sync. `.claude/skills/prioflow` is a symlink to the German one for sessions in this repo.
  Folder name must stay `prioflow` (= `name:` in the frontmatter, required for the claude.ai upload).
- Setup guide for people new to Cloudflare in both languages: `docs/SETUP.md` ↔ `docs/SETUP.de.md` – keep in sync. User-facing
  setup docs use the placeholder `<your-address>` / `<deine-adresse>`, never the author's instance.
- Sub-items (decision D16, methodology v2.8): a checklist `- [ ] step` in the body of an action (A) – no table, no refs of
  their own. Parsed in `src/worker.js` (`parseChecks`, `checkProgress`, `PATCH {check|uncheck}`) and in `src/ui.html` (same
  regex) – keep both in sync. Max 8 on the server; the methodology asks for at most 5 and only on the user's request.
- All user text in the UI must be rendered via `textContent` (the `h()` helper) – never `innerHTML`.
- Installable app (PWA): manifest and icons in `src/pwa.js`, served publicly by `src/worker.js`; no service worker (not needed
  for installing, and the app only works online anyway). Install entry: ☰ → Dieses Gerät, shown when the browser offers it.
- Retired categories (`kinds.active = 0`, e.g. T from methodology v1) never appear in the web app's filter or board, unless
  they still hold open items; their closed items stay in the database as history. The API no longer accepts new ones.
- Instance settings (table `settings`, migration 0006; web app ☰ → Chat-Fußzeile → Anpassen; `GET/PATCH /api/settings`) set the footer's
  default layout and group markers for API and MCP. Only the user token may change them; a `layout` in a request wins.
  Who controls what (prompt vs. server vs. settings) is explained in `docs/PROMPT.md` → "Wozu der Prompt?".
