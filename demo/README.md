# Demo instance

A separate cotrack instance with invented data, for showing the app without touching real projects.

- Author's instance: https://cotrack-demo.ilianos1.workers.dev – worker `cotrack-demo`, D1 database `cotrack-demo-db`
  (`[env.demo]` in `wrangler.toml`). Own tokens (`TOKEN_USER`, `TOKEN_AI`), unrelated to the live instance.
- Content: four invented projects from `demo/seed.mjs` (German) plus a copy of a real project (Patchwerk) taken from the
  live database once. The seed covers what the views need: open/done/dropped items, a history of several weeks by you and
  the AI, dependency chains (also across projects, plus one deliberate cycle for "Auffällig"), sub-items, effort and benefit
  (estimated and confirmed), converted ideas, an item shown in two projects, due dates, blocked and reopened items.

## Update the code

The demo is **not** deployed automatically. With wrangler:

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

When the event format in `src/worker.js` changes (`createItem`, `updateItem`, `convertItem`), change `demo/seed.mjs` with it.
