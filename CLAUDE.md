# cotrack – notes for AI assistants

- Plain Cloudflare Worker, **no build step**: `src/worker.js` (API + routing) imports `src/ui.html` as text.
  Schema in `migrations/` (D1). Keep it dependency-free.
- Live instance: https://cotrack.ilianos1.workers.dev – project slug `cotrack` tracks this repo's own open points.
- `COTRACK.md` (repo root) maps this repo to its cotrack project (`project:` = slug; `code:` = short code once set). Keep it in sync with the board.
- Open points of this project live in cotrack itself (project `cotrack`), never in `docs/STATUS.md` (that file only
  links to the board). Use the cotrack MCP tools if connected, otherwise the API with `COTRACK_TOKEN`:
  `curl -s -H "Authorization: Bearer $COTRACK_TOKEN" https://cotrack.ilianos1.workers.dev/api/projects/cotrack/footer?format=text`
- Keep references stable: never renumber, never reuse. Accepted ideas are converted (`/convert`), not edited.
- UI language is German; code, README and API are English. Methodology: `docs/METHODIK.md` (current rules at the top) and `docs/PROMPT.md` – keep both in sync.
- All user text in the UI must be rendered via `textContent` (the `h()` helper) – never `innerHTML`.
