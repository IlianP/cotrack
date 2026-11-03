# cotrack – notes for AI assistants

- Plain Cloudflare Worker, **no build step**: `src/worker.js` (API + routing) imports `src/ui.html` as text.
  Schema in `migrations/` (D1). Keep it dependency-free.
- Live instance: https://cotrack.ilianos1.workers.dev – project slug `cotrack` tracks this repo's own open points.
- Open points of this project live in cotrack itself. If `COTRACK_TOKEN` (AI token) is available in the
  environment, read and update them via the API (see README) instead of only listing them in chat:
  `curl -s -H "Authorization: Bearer $COTRACK_TOKEN" https://cotrack.ilianos1.workers.dev/api/projects/cotrack/footer?format=text`
- Keep references stable: never renumber, never reuse. Accepted ideas are converted (`/convert`), not edited.
- UI language is German; code, README and API are English. Methodology discussion: `docs/METHODIK.md`.
- All user text in the UI must be rendered via `textContent` (the `h()` helper) – never `innerHTML`.
