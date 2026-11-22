# Demo instance

A separate cotrack instance with invented data, for showing the app without touching real projects.

- Author's instance: https://cotrack-demo.ilianos1.workers.dev – worker `cotrack-demo`, D1 database `cotrack-demo-db`
  (`[env.demo]` in `wrangler.toml`). Own tokens (`TOKEN_USER`, `TOKEN_AI`), unrelated to the live instance.
- **Open to everyone** (`DEMO_OPEN = "1"` in `[env.demo.vars]`): without a token a visitor is a guest. Guests may change
  items – of the four demo projects and of the copied ones (Patchwerk) – nothing else: no settings, no projects, and AI
  assistants still need the token (OAuth). A project you create later with the token is view-only for guests (it is not in
  the snapshot). Each address gets 120 units a minute (reads 1, writes 5; rate limiting binding
  `GUEST_LIMIT`), and the web app polls every 15 s instead of 4 s, because the demo shares the account's daily limits with
  the live instance. Signing in with `TOKEN_USER` works as before (☰ → "Mit Token anmelden").
- **Nightly reset**: the cron `41 2 * * *` (`[env.demo.triggers]`) runs `resetDemo` in `src/worker.js`, in one D1 batch (one
  transaction; the guard below stops it on any other database): the demo projects from `demo/data.mjs` (same data as
  `demo/seed.mjs`), the copied projects from a snapshot – tables `demo_snap_projects|items|counters|events`, taken once
  before the first guest change or the first reset (`ensureSnapshot`). To take a new snapshot (e.g. after copying a project
  in again), drop these four tables; the next guest change or reset takes it afresh. A reset turns the demo back in time,
  so references created by guests are handed out again afterwards. Test it locally with
  `npx wrangler dev --env demo --test-scheduled` and `curl "http://localhost:8787/__scheduled?cron=41+2+*+*+*"`.
- Content: four invented projects from `demo/data.mjs` (German) plus a copy of a real project (Patchwerk) taken from the
  live database once. The seed covers what the views need: open/done/dropped items, a history of several weeks by you and
  the AI, dependency chains (also across projects, plus one deliberate cycle for "Auffällig"), sub-items, effort and benefit
  (estimated and confirmed), converted ideas, an item shown in two projects, due dates, blocked and reopened items.

## Update the code

Automatic: a second Workers Build (trigger "Deploy demo (main)" on the worker `cotrack-demo`) runs on every push to `main`,
like the live one – it applies the migrations to `cotrack-demo-db` and runs `npx wrangler deploy --env demo`. The data stays.
By hand, with wrangler:

```bash
npx wrangler deploy --env demo
```

```bash
npx wrangler d1 migrations apply cotrack-demo-db --env demo --remote
```

Without wrangler credentials (e.g. an AI session with the Cloudflare connector), copy the deployed bundle of the live worker
(`GET …/workers/scripts/cotrack/content/v2`) and upload it as `cotrack-demo` with the demo's bindings.

## Reset the data

`demo/seed.mjs` writes SQL that deletes and recreates its four projects with dates relative to now (other projects stay),
then renumbers the change log by time. It starts with a guard: only a database with the table `demo_instance` accepts it, so
it stops right away if pointed at the live database.

```bash
node demo/seed.mjs > /tmp/demo-seed.sql
```

```bash
npx wrangler d1 execute cotrack-demo-db --env demo --remote --file /tmp/demo-seed.sql
```

A new demo database needs the schema (`npx wrangler d1 migrations apply cotrack-demo-db --env demo --remote`) and the marker
table once before the first reset:

```bash
npx wrangler d1 execute cotrack-demo-db --env demo --remote --command "CREATE TABLE demo_instance (note TEXT NOT NULL)"
```

When the event format in `src/worker.js` changes (`createItem`, `updateItem`, `convertItem`), change `demo/data.mjs` with it.
`demo/data.mjs` is the data and its simulation (pure, bundled into the Worker); `demo/seed.mjs` only writes it as an SQL file.
