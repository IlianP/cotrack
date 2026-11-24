# cotrack – notes for AI assistants

- Plain Cloudflare Worker, **no build step**: `src/worker.js` (API + routing) imports `src/ui.html` as text.
  MCP server in `src/mcp.js`; OAuth 2.1 for MCP clients (claude.ai, ChatGPT) in `src/oauth.js` – security-relevant:
  changes there go through a branch + PR. OAuth tokens only ever act as `ai` and are valid only on `/mcp`.
  Schema in `migrations/` (D1). Keep it dependency-free.
- Live instance: https://cotrack.ilianos1.workers.dev – project slug `cotrack` tracks this repo's own open points.
- Demo instance (invented data, own tokens): https://cotrack-demo.ilianos1.workers.dev – worker `cotrack-demo`, D1
  `cotrack-demo-db` (`[env.demo]`), data from `demo/data.mjs` (CLI: `demo/seed.mjs`) plus a copy of Patchwerk. Deployed with main by its own Workers Build (code + migrations,
  data stays); resetting the data: `demo/README.md`. Keep `demo/data.mjs` in step with the event format in `src/worker.js`.
  README pictures (`docs/img/`, A130): `node demo/screenshots.mjs` renews clip and screenshots in both languages from a
  local instance with the demo projects (German: `demo/data.mjs`; English: `demo/data.en.mjs`, same timeline, built with
  the helpers `demo/data.mjs` exports) – rerun it after visible changes to the web app. Needs Playwright and ffmpeg; never
  take pictures of the live instance. The demo holds both languages (A132): English projects are `en-…` with codes of their
  own (`DEMO_SLUGS_ALL`, `contentAll`; seed and nightly reset write both), and the web app shows a guest only those of its
  language (`demoHidden`/`demoVisible` in `src/ui.html`). Keep the two contents in step.
  Open demo (A114): `DEMO_OPEN = "1"` lets requests without any token in as guests (actor `user`, `guest: true` in `/api/me`);
  `guestGuard` allows writes only to items of `DEMO_SLUGS` and of the projects in the snapshot (`ensureSnapshot`, tables
  `demo_snap_*`: the copied Patchwerk), `GUEST_LIMIT` limits per address, the cron runs `resetDemo` nightly (snapshot + data).
  The web app's guest mode: `state.guest`, `signedIn()`, slower poll, no settings/projects in ☰. The live instance has no
  `DEMO_OPEN`, so nothing changes there.
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
- Undo (decision D33): your own changes in the web app get "Rückgängig" in the toast (`undoToast`; Ctrl+Z / ⌘Z while shown;
  only the latest toast counts). `revertChange(before, after)` in `src/ui.html` puts back only fields still as that change
  left them (`UNDO_FIELDS`), and sends what it read as `expect` – `updateItem` compares it inside the UPDATE (`EXPECT_COLS`,
  409 `conflict`, undo then reads again). Deleting has no confirm: `POST …/items/:ref/restore` (`restoreItem` in `src/worker.js`) brings
  the item back from the snapshot in its "deleted" event (event "restored"); the history panel offers it as well.
  Undo sends `undo: true` (noted as `data.undo`). When it puts back all of the item's latest change (same actor, that
  change set `updated_at`), `undoStamp` in `src/worker.js` returns `updated_at`/`updated_by` (and `closed_at` when it
  closes again) to the change before – read from the events, one per write. The undo's event keeps its real time; polling
  goes by event ids, not `updated_at`, so others still see it.
- Overview (decision D34): the logo (`#homeBtn`, also ☰ and quick access) opens `#home` – `openHome`/`closeHome`,
  `homeModel`, `renderHome`, `homeCard` in `src/ui.html`; like the statistics it replaces bar and board (`body.home-mode`)
  and follows the poll. It reads the open items of all projects and the newest events, ranks "your turn" with
  `nextQueue(items, true)` (the Next order, without "Später" and the time filter). "New" = changes by the other side since
  the overview was last left (localStorage `cotrack.homeSeen`; the first time: 24 hours).
- Quick access and links to items (D34): `#pal` (Ctrl/⌘+K, ☰) – `openPal`, `palMatches`, `palCommands` in `src/ui.html`;
  items of all projects come from one `GET /api/items?status=all` per opening and are matched in the browser. The address
  `#slug/A14` opens that item (`hashTarget`, `openHashItem`, `openItemKey`); the edit dialog copies it (`itemUrl`) and
  `cotrack_get` (`src/mcp.js`) names it as `Link:`. References in pills open their item (`refLink`).
- Due dates (D34, methodology v2.14): `due` (YYYY-MM-DD) is shown by `duePill` (`dueDays`, `dueRel`; amber from `DUE_SOON`
  = 2 days before, red after), sorts the board (`SORTS` → `due`) and brings items forward in Next (`dueUrgent` in
  `nextQueue`). The AI sets it via `cotrack_add`/`cotrack_update` only for real dates (`dueParam` and the instructions in
  `src/mcp.js`). `demo/seed.mjs` writes due dates relative to today (`due(days)`).
- Session links (decision D35, methodology v2.15, migration 0011): `first_session`/`last_session` on items. Every write may
  carry `session` (https address of the chat or coding session, `normSession` in `src/worker.js`): creating sets both, an
  update sets the last (and the first while none is known), empty clears the last (the first too if it is the same link), a
  conversion keeps the idea's first. The event data records `session` as a note on where the change was made – never as a
  field change (`SESSION_COLS` are stripped from it). Without migration 0011 the columns are skipped (`sessionColumns`) and
  only the events keep it. MCP: `session` on add/update/convert, the rule in `INSTRUCTIONS`, `sourceHint` when a session link
  lands in `source`. UI: `sessionLink`/`sessionAnchor`, the field in `openEdit` (shown when set, otherwise "🔗 Session-Link
  eintragen"; `save` sends `session` only when the field was changed), a ↗ column in `itemHistTable`; undo restores it via
  `last_session` in `UNDO_FIELDS`/`EXPECT_COLS`, sent back as `session`. Session links never go into `source`; search (`q`) covers `source` as well.
- Compact board (D34, three steps since A135): `#denseBtn` steps `state.density` through `DENSITIES` – cards · `wrap`
  (whole title, no description; reference and title flow like a sentence, the signs float right of the first line) ·
  `line` (one line; a title that does not fit gives way to its short label, `fitTitles` after layout and resize – A138) –
  rendered in `renderItem`; localStorage `cotrack.dense` = `wrap` | `1` (= line, as before).
  A prerequisite that is done shows as ✓ instead of ⏸: `stillOpen` (open in the list, or in `ext_open`) – `GET /api/items`
  therefore annotates `ext_open`/`ext_next` like the project lists.
- Project order (D37, A120): the server lists projects by `updated_at` (every item change, by user or AI). The web app
  re-sorts on each device (`state.projectSort`, localStorage `cotrack.projectSort`; `sortProjects`, `PROJECT_SORTS` in
  `src/ui.html`): changed · name · opened (`noteProjectOpened`, localStorage `cotrack.projectOpened`). Chosen with the
  button in the picker's "Alle Projekte" row (`projectSortBtn`, `#projectSortPop`); every `state.projects` list follows it.
- Footer delta (A121): `since` is either the version number from `cotrack_status` (the instance-wide newest event id,
  `latestEvent` in `src/mcp.js`, so it also fits a footer over several projects; digits = event id; `sinceVersion`,
  `changedSince` in `src/worker.js` – exact) or an ISO time (only as exact as the AI's clock). The MCP texts ask for the version.
- Sources as links (D34): `sourceLink` in `src/ui.html` turns "PR #7", "#12", a commit hash or a repository path into a
  GitHub link when the project has a `repo`; full addresses get a readable label.
- Several sources (decision D36, methodology v2.16): `source` holds up to `MAX_SOURCES` (3) lines, one source each – `normSource`
  in `src/worker.js` trims, drops blank lines and repeats, refuses more (400 `too_many_sources`); `sourceLines` in `src/ui.html`.
  `MAX_SOURCES` exists in both – keep them in sync. Card and Next show one link per line, the edit dialog a multi-line field
  (`src-input`: one line per source, no wrapping, small font; links per line in `srcOpen`); the compact board shows none. The rule for the AI (normally one, replace instead of
  append) lives in `INSTRUCTIONS` and the `source` description in `src/mcp.js`, not in the prompt.
- Web app version (A124): the worker hashes `src/ui.html` (`UI_VERSION`, `fnv1a`) and writes it into the page (placeholder in
  `const UI_VERSION` in `src/ui.html` – keep exactly one occurrence). `json()`/`plain()` send it as `x-cotrack-ui`; `api()` in the
  page sends its own and calls `uiOutdated` on a mismatch (reloads when no dialog is open and nothing is typed, at most once a
  minute, otherwise a toast with "Neu laden"). Writes to `/api` from an outdated page – a different `x-cotrack-ui`, or none with
  `Sec-Fetch-Site: same-origin` (pages from before the check) – get 409 `client_outdated` (`outdatedPage`). Scripts and MCP send
  neither and are not affected. Reason: an old page's single-line source field merged two sources into one line (D36).
- Tests: `npm test` (`test/run.mjs`) starts `wrangler dev` on a temporary D1 with test tokens and runs `test/*.test.mjs` with
  node:test – `api.test.mjs` (API + MCP), `ui.test.mjs` (Playwright, skipped without it). Add a test for every fix and check it
  fails without the fix. Each test file uses a project of its own (`freshProject`). Tests run **locally only – never in GitHub
  Actions or any other CI** (the user's decision: Actions minutes cost real money); do not add workflows that run them.
- All user text in the UI must be rendered via `textContent` (the `h()` helper) – never `innerHTML`.
- Board layout (decision D30, landscape changed with A136): `layoutBoard` in `src/ui.html` picks one of three by the screen
  (`boardLayout`) – `fit` (landscape and portrait with room for two columns: the board fills the screen, `fitPlan` spreads the
  categories over the columns by item count, each scrolls on its own; the last column ends above the floating "+"), `page`
  (only landscape screens lower than 500px – phones held sideways – or with room for one column: the page scrolls, columns
  fill the width up to `BOARD_MAX` each, extra categories go under the shortest column, `packBoard`) and `swipe` (phones: one category per screen, one swipe = exactly one category (`scroll-snap-stop`); the
  neighbours are only hinted – faded, their items take no taps, a tap there jumps to them (class `cur`, `syncLaneChips`);
  the item lists contain only vertical overscroll, otherwise the sideways swipe is swallowed; the category toggles jump there
  instead of filtering). Column scroll positions survive live updates (`boardSig`).
- Installable app (PWA): manifest and icons in `src/pwa.js`, served publicly by `src/worker.js`; no service worker (not needed
  for installing, and the app only works online anyway). Install entry: ☰ → Dieses Gerät, shown when the browser offers it.
- Retired categories (`kinds.active = 0`, e.g. T from methodology v1) never appear in the web app's filter or board, unless
  they still hold open items; their closed items stay in the database as history. The API no longer accepts new ones.
- History per item (decision D22): the edit dialog's "Angelegt … · geändert …" line opens a compact table (when · who ·
  which fields; status and owner with value; same actor within 5 minutes = one row), loaded from
  `GET …/items/:ref/events` (`itemHistory` in `src/worker.js`), which follows conversions back (`from`) via the `converted` events, so deleted sources keep their history. UI:
  `itemHistory`/`itemHistRows` in `src/ui.html`. A row names only its net change (`itemHistRow`): a field that ends where it
  started (done and reopened, a change and its undo), a tick taken back or a deletion restored is left out, an empty row
  disappears. Event data holds new values only, so `itemHistBefore` replays the log for the value before each change
  (`HIST_UNKNOWN` where it cannot tell, e.g. a body set at creation – then the field stays named); the web app's undo
  sends `undo: true`, noted on the event (`data.undo`, like `session` not a field), which tells the value before the
  change it reverts.
- Footer bar in the board (A134): off by default; ☰ → Chat-Fußzeile → Im Board (`boardFooterRow`) turns it on per device –
  `state.boardFooter`, localStorage `cotrack.boardFooter` = `single` | `multi` (`BOARD_FOOTERS`). `renderFooter` fetches only
  while it is shown; `footerNodes` turns the references in it into `refLink`s (`FOOTER_REF`, `footerKey`).
- Instance settings (table `settings`, migration 0006; web app ☰ → Chat-Fußzeile → Anpassen; `GET/PATCH /api/settings`) set the footer's
  default layout and group markers for API and MCP. Only the user token may change them; a `layout` in a request wins. A marker gets a ":" only when it ends in text ("Du:"), never after an emoji (`groupMark` in `src/worker.js`, `mark` in
  `src/ui.html` – keep both in sync).
  Who controls what (prompt vs. server vs. settings) is explained in `docs/PROMPT.md` → "Wozu der Prompt?".
