# cotrack – notes for AI assistants

- Plain Cloudflare Worker, **no build step**: `src/worker.js` (API + routing) imports `src/ui.html` as text.
  MCP server in `src/mcp.js`; OAuth 2.1 for MCP clients (claude.ai, ChatGPT) in `src/oauth.js` – security-relevant:
  changes there go through a branch + PR. OAuth tokens only ever act as `ai` and are valid only on `/mcp`.
  Schema in `migrations/` (D1). Keep it dependency-free.
- Live instance: https://cotrack.ilianos1.workers.dev – project slug `cotrack` tracks this repo's own open points.
- Demo instance (invented data, own tokens): https://cotrack-demo.ilianos1.workers.dev – worker `cotrack-demo`, D1
  `cotrack-demo-db` (`[env.demo]`), data from `demo/seed.mjs` plus a copy of Patchwerk. Deployed with main by its own Workers Build (code + migrations,
  data stays); resetting the data: `demo/README.md`. Keep `demo/seed.mjs` in step with the event format in `src/worker.js`.
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
- Effort and benefit (decision D21, methodology v2.10, migration 0009): optional `effort` (XS–XL) and `benefit` (low/medium/high)
  on actions and ideas only; `sized_by` = who set them (`ai` = estimate, `user` = confirmed; the AI may send `confirmed: true`
  only when the user named or confirmed them). Decisions inherit benefit via chains (computed in Next, `src/ui.html`). The lists
  `SIZED_KINDS`/`EFFORTS`/`BENEFITS` exist in `src/worker.js` and `src/ui.html` – keep both in sync. The rule for the AI lives in
  the MCP instructions (`src/mcp.js`), not in the prompt (ChatGPT length limit).
- Short titles (decision D23, methodology v2.11): at most 80 characters (`TITLE_TARGET`), details in the body. No hard limit:
  the MCP answer of `cotrack_add`/`cotrack_update` carries a note from `TITLE_HINT_AT` (100) on (`titleHint` in `src/mcp.js`),
  the edit dialog counts from 80 on, and text lists mark items with a description with 📝 (`hasDetails` in `src/worker.js`).
  `TITLE_TARGET` exists in `src/mcp.js` and `src/ui.html` – keep both in sync. Never export plain numbers or strings from
  `src/worker.js`: as the Worker's main module, its named exports must be handlers (functions) or objects.
- Brief descriptions (decision D25, methodology v2.12): cotrack is tracking, not a knowledge base – a body holds what is needed
  to act (about five lines), details live in the linked `source`, progress is one replaced "Stand:" line. No hard limit: a note in
  the MCP answer from `BODY_HINT_AT` (600) on (`bodyHint` in `src/mcp.js`), a counter in the edit dialog. `BODY_HINT_AT` exists
  in `src/mcp.js` and `src/ui.html` – keep both in sync.
- Items across projects (decision D26, methodology v2.13, migration 0010): an item has one home project; `also_in` (slugs)
  shows it in further projects under its qualified reference ("FIN:W3"). `waiting_on` stores plain refs for the same project
  and `slug:REF` for others (input may use the code). Keys are `slug:REF` everywhere (`itemKey`, `waitKeys`, `keyLabel` in
  `src/worker.js`; `waitKey`, `keyRef` in `src/ui.html` – keep both in sync). `projectItems` loads a project's view (own +
  shared items) and adds `ext_open`/`ext_next` for links to items outside it; `linkedScope` widens versions and
  `cotrack_changes` to what a project shows or is linked to. The edit dialog shows "Auch angezeigt in" only when it is set (otherwise a small
  button opens it): chips plus a search field with suggestions, same matching as the project search (`projectMatches`,
  the list opens upward and fits the visible dialog, keyboard included – `place`;
  `alsoInPicker` in `src/ui.html`; `MAX_ALSO_IN` exists there and in `src/worker.js` – keep both in sync).
- All user text in the UI must be rendered via `textContent` (the `h()` helper) – never `innerHTML`.
- Installable app (PWA): manifest and icons in `src/pwa.js`, served publicly by `src/worker.js`; no service worker (not needed
  for installing, and the app only works online anyway). Install entry: ☰ → Dieses Gerät, shown when the browser offers it.
- Retired categories (`kinds.active = 0`, e.g. T from methodology v1) never appear in the web app's filter or board, unless
  they still hold open items; their closed items stay in the database as history. The API no longer accepts new ones.
- History per item (decision D22): the edit dialog's "Angelegt … · geändert …" line opens a compact table (when · who ·
  which fields; status and owner with value; same actor within 5 minutes = one row), loaded from
  `GET …/items/:ref/events` (`itemHistory` in `src/worker.js`), which follows conversions back (`from`) via the `converted` events, so deleted sources keep their history. UI:
  `itemHistory`/`itemHistRows` in `src/ui.html`.
- Instance settings (table `settings`, migration 0006; web app ☰ → Chat-Fußzeile → Anpassen; `GET/PATCH /api/settings`) set the footer's
  default layout and group markers for API and MCP. Only the user token may change them; a `layout` in a request wins. A marker gets a ":" only when it ends in text ("Du:"), never after an emoji (`groupMark` in `src/worker.js`, `mark` in
  `src/ui.html` – keep both in sync).
  Who controls what (prompt vs. server vs. settings) is explained in `docs/PROMPT.md` → "Wozu der Prompt?".
