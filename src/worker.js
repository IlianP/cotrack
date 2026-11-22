/**
 * cotrack – live tracking of open points (to-dos, tasks, ideas, warnings)
 * shared between a human and their AI assistants.
 *
 * Cloudflare Worker + D1, no build step. See README.md for the API.
 */
import UI_HTML from "./ui.html";
import { pwaResponse } from "./pwa.js";
import { handleMcp } from "./mcp.js";
import { handleOAuth } from "./oauth.js";
import { DEMO_SLUGS, seedStatements } from "../demo/data.mjs";

const STATUSES = ["open", "doing", "blocked", "done", "dropped"];
const OPEN = ["open", "doing", "blocked"];
const CLOSED = ["done", "dropped"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const KIND_RE = /^[A-Z]{1,4}$/;
const REF_RE = /^([A-Z]{1,4})(\d{1,6})$/;
// Project code: 2-4 characters, starts with two letters so it never looks like a reference ("A1").
const CODE_RE = /^[A-Z]{2}[A-Z0-9]{0,2}$/;
// Qualified reference: "<code or slug>:<ref>", e.g. "CT:A14".
const QREF_RE = /^([A-Za-z0-9][A-Za-z0-9-]{0,62}):([A-Za-z]{1,4}\d{1,6})$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Texts the server writes itself (text lists, STATUS.md section), per language. The language comes from the request
// (`lang=de|en`) or else from the instance setting `language` (web app ☰ → Sprache, which also sets the web app's own
// language on every device); built-in default German.
export const LANGS = ["de", "en"];
const TEXT = {
  de: {
    owners: { user: "Du", ai: "KI" },
    statuses: { open: "offen", doing: "in Arbeit", blocked: "blockiert", done: "erledigt", dropped: "verworfen" },
    none: "(keine)",
    statusHeading: "## Offene Punkte",
    statusAsOf: "Stand",
    statusEmpty: "Keine offenen Punkte.",
    statusColumns: ["Kennung", "Stichwort", "Art", "Verantwortlich", "Quelle", "Status"],
    benefits: { low: "gering", medium: "mittel", high: "hoch" },
  },
  en: {
    owners: { user: "You", ai: "AI" },
    statuses: { open: "open", doing: "in progress", blocked: "blocked", done: "done", dropped: "dropped" },
    none: "(none)",
    statusHeading: "## Open points",
    statusAsOf: "As of",
    statusEmpty: "No open points.",
    statusColumns: ["Ref", "Keyword", "Type", "Responsible", "Source", "Status"],
    benefits: { low: "low", medium: "medium", high: "high" },
  },
};
// Built-in categories are stored in German (migrations); in English they are translated unless renamed (as in src/ui.html).
const KIND_DE_NAMES = { D: "Entscheidung", A: "Aufgabe", I: "Idee", W: "Warnung" };
const KIND_EN_NAMES = { D: "Decision", A: "Action", I: "Idea", W: "Warning" };
export const kindName = (k, lang) => (lang === "en" && k.name === KIND_DE_NAMES[k.code] ? KIND_EN_NAMES[k.code] : k.name);
// Footer group labels.
// Language-independent since v2.6: 👤 = yours, 🤖 = the AI's.
const FOOTER_OWNER_LABELS = { user: "👤", ai: "🤖" };
// A group marker gets a ":" only when it ends in text ("Du:", "KI:"); emoji markers stand alone like 💡 and ⚠️.
const groupMark = (label) => (/[\p{L}\p{N}]$/u.test(label) ? `${label}:` : label);
// Footer wording per language (`lang=de|en`, default de): only the "new / done" short line.
const FOOTER_DELTA_LABELS = { de: { created: "neu", done: "erledigt" }, en: { created: "new", done: "done" } };
// Footer layout (decided 2026-11-06): "multi" = one line per group (👤 / 🤖 / 💡 / ⚠️),
// "single" = everything in one line. Built-in default only: since v2.7 the human picks the default in the
// web app (setting `footer_layout`), and a `layout` parameter in a request wins over both.
const FOOTER_LAYOUT_DEFAULT = "multi";
// Instance settings (table `settings`, migration 0006; web app ☰ → Chat-Fußzeile → Anpassen). A missing row – or a database
// without the table – means these built-in defaults.
// `language` (de|en): one language for everything (decided 2026-11-13, D19) – the web app on every device and what cotrack
// writes for AI assistants: MCP instructions, tool descriptions and answers, text lists, the footer's short line – unless a
// request names its own `lang`. Not stored = "Auto": the web app follows the browser, the AI gets German. German stays the built-in
// default so that existing instances keep their behaviour.
const SETTINGS_DEFAULTS = Object.freeze({
  footer_layout: FOOTER_LAYOUT_DEFAULT,
  footer_label_user: FOOTER_OWNER_LABELS.user,
  footer_label_ai: FOOTER_OWNER_LABELS.ai,
  language: "de",
});
const OWNER_ALIASES = { user: "user", du: "user", me: "user", ich: "user", human: "user", ai: "ai", ki: "ai" };
// Sub-items (methodology v2.8, decided in D16): a checklist "- [ ] step" / "- [x] step" in the body of a task (A).
// No extra table and no references of their own; the server only counts them ("2/4") and can tick one (check/uncheck).
const CHECK_KIND = "A";
const MAX_CHECKS = 8; // hard limit; the methodology asks for at most 5
const CHECK_LINE_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*\S)\s*$/;
// Effort and benefit (decision D21, methodology v2.10): optional, coarse, only for actions and ideas. Decisions inherit the
// benefit of what waits for them (computed in the web app), warnings get none. `sized_by` = who set them last
// ('ai' = an estimate until the human confirms or changes it). Keep in sync with src/ui.html (EFFORTS, BENEFITS).
export const SIZED_KINDS = ["A", "I"];
export const EFFORTS = ["XS", "S", "M", "L", "XL"];
export const BENEFITS = ["low", "medium", "high"];
const BENEFIT_ALIASES = { low: "low", gering: "low", niedrig: "low", 1: "low", medium: "medium", mittel: "medium", 2: "medium", high: "high", hoch: "high", 3: "high" };
// Rough hours per effort class (for the forecast in the statistics): a typical item of the class, not its upper bound.
const EFFORT_HOURS = { XS: 0.05, S: 0.25, M: 1, L: 4, XL: 12 };

class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.detail = detail;
  }
}

// Helpers for other modules (the class itself is not exported: the Workers runtime
// treats exported classes of the main module as entrypoints).
export const httpError = (status, code, detail) => new HttpError(status, code, detail);
export const isHttpError = (err) => err instanceof HttpError;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return page(UI_HTML);
      }
      // Web app manifest and icons (installable app), public like the page itself.
      if (request.method === "GET") {
        const pwa = pwaResponse(url.pathname, preferredLang(request.headers.get("accept-language")));
        if (pwa) return pwa;
      }
      // "/mcp/" with a trailing slash is the same endpoint: ChatGPT calls it that way (A39).
      if (url.pathname === "/mcp" || url.pathname === "/mcp/") return await handleMcp(request, env, url);
      // The old form /mcp/<token> was removed after the switch to OAuth (A31); say so instead of a bare 404.
      if (url.pathname.startsWith("/mcp/")) {
        return json({ error: "not_found", hint: "The token-in-URL form was removed. Connect to /mcp; sign-in is via OAuth." }, 404);
      }
      const oauth = await handleOAuth(request, env, url);
      if (oauth) return oauth;
      if (url.pathname === "/api/health") return json({ ok: true, service: "cotrack" });
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        const actor = await authenticate(request, env);
        // Open demo (DEMO_OPEN, A114): a request without any token is a guest – acts as "user", within the limits of guestGuard.
        // A wrong token stays 401, so signing in with the real one still works.
        const guest = !actor && openDemo(env) && !request.headers.has("authorization");
        if (!actor && !guest) return json({ error: "unauthorized", hint: "Send 'Authorization: Bearer <token>'" }, 401);
        if (guest && !(await guestAllowed(request, env))) {
          return json({ error: "rate_limited", hint: "Too many requests from this address, try again in a minute" }, 429);
        }
        return await route(request, env.DB, url, actor || "user", { guest });
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, detail: err.detail }, err.status);
      console.error(err);
      return json({ error: "internal_error" }, 500);
    }
  },

  // Cron (only the demo worker has one, [env.demo.triggers]): every night back to the demo data.
  async scheduled(event, env, ctx) {
    if (openDemo(env)) ctx.waitUntil(resetDemo(env.DB));
  },
};

/* ------------------------------------------------------------ open demo */
// The demo worker sets DEMO_OPEN = "1" ([env.demo.vars]): visitors try it without a token. Guests may change items only –
// of the demo projects and of the copied ones in the snapshot; no settings, no projects – and the cron resets them every night.
const openDemo = (env) => env.DEMO_OPEN === "1";

// Per address, with the Rate Limiting binding GUEST_LIMIT (if configured): reads count 1, writes 5.
async function guestAllowed(request, env) {
  if (!env.GUEST_LIMIT) return true;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const write = !["GET", "HEAD"].includes(request.method);
  const { success } = await env.GUEST_LIMIT.limit({ key: ip, delta: write ? 5 : 1 });
  return success;
}

// Items of the demo projects, and of the projects in the snapshot (copied ones such as Patchwerk), which the reset restores.
async function guestGuard(db, seg, method, project) {
  if (method === "GET" || method === "HEAD") return;
  if (seg[0] === "projects" && seg[2] === "items" && project) {
    if (DEMO_SLUGS.includes(project.slug)) return;
    await ensureSnapshot(db);
    if (await db.prepare("SELECT 1 FROM demo_snap_projects WHERE slug = ?").bind(project.slug).first()) return;
  }
  throw new HttpError(403, "demo_guest", project ? "this project is read-only in the demo" : "not available in the demo without a token");
}

// Snapshot of every project that is not generated by demo/data.mjs (copied in, e.g. Patchwerk), taken once – before the
// first guest change or the first reset, whichever comes first – into tables demo_snap_*. Only on a demo database (guard).
// Checked in the database every time (no flag in memory): dropping the tables to take a new snapshot must work at once.
// Cheap and rare – only guest changes to copied projects and the nightly reset call it.
const SNAP_TABLES = ["projects", "items", "counters", "events"];
async function ensureSnapshot(db) {
  const seeded = DEMO_SLUGS.map((s) => `'${s}'`).join(", ");
  await db.batch([
    "DELETE FROM demo_instance WHERE 0",
    `CREATE TABLE IF NOT EXISTS demo_snap_projects AS SELECT * FROM projects WHERE slug NOT IN (${seeded})`,
    ...SNAP_TABLES.slice(1).map((t) =>
      `CREATE TABLE IF NOT EXISTS demo_snap_${t} AS SELECT * FROM ${t} WHERE project_slug IN (SELECT slug FROM demo_snap_projects)`),
  ].map((sql) => db.prepare(sql)));
}

// Columns a snapshot table shares with its live table (a later migration may add columns the snapshot lacks).
async function snapColumns(db) {
  const cols = {};
  for (const t of SNAP_TABLES) {
    const live = (await db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all()).results.map((r) => r.name);
    const snap = new Set((await db.prepare(`SELECT name FROM pragma_table_info('demo_snap_${t}')`).all()).results.map((r) => r.name));
    // events get fresh numbers (the renumbering at the end orders everything by time)
    cols[t] = live.filter((c) => snap.has(c) && !(t === "events" && c === "id")).join(", ");
  }
  return cols;
}

// Back to the start every night: the copied projects from their snapshot, the demo projects from demo/data.mjs. One batch =
// one transaction: if anything fails, the data stays as it was. The first statement only works on a demo database (table
// demo_instance), so this can never wipe a live one.
export async function resetDemo(db) {
  await ensureSnapshot(db);
  const cols = await snapColumns(db);
  const inSnap = "(SELECT slug FROM demo_snap_projects)";
  const restore = [
    ...["events", "items", "counters"].map((t) => `DELETE FROM ${t} WHERE project_slug IN ${inSnap}`),
    `DELETE FROM projects WHERE slug IN ${inSnap}`,
    ...SNAP_TABLES.map((t) => `INSERT INTO ${t} (${cols[t]}) SELECT ${cols[t]} FROM demo_snap_${t}` + (t === "events" ? " ORDER BY id" : "")),
  ];
  await db.batch(seedStatements(Date.now(), { afterPrologue: restore }).map((sql) => db.prepare(sql)));
}

/* ------------------------------------------------------------------ auth */

async function authenticate(request, env) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)\s*$/i);
  return m ? tokenActor(m[1], env) : null;
}

// Each token maps to an actor, so every change is attributed automatically.
export async function tokenActor(token, env) {
  const candidates = [["user", env.TOKEN_USER], ["ai", env.TOKEN_AI]];
  for (const [actor, secret] of candidates) {
    if (secret && (await safeEqual(token, secret))) return actor;
  }
  return null;
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/* ---------------------------------------------------------------- router */

async function route(req, db, url, actor, { guest = false } = {}) {
  const seg = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method;
  const q = url.searchParams;
  // Guests write only items of demo projects: everything else that writes stops here; items are checked once the project is known.
  if (guest && !(seg[0] === "projects" && seg[2] === "items")) await guestGuard(db, seg, method, null);

  if (seg.length === 1 && seg[0] === "me" && method === "GET") return json({ actor, ...(guest ? { guest: true } : {}) });

  // Instance settings: everyone may read them (the AI gets their effect through the footer), only the human changes them.
  if (seg.length === 1 && seg[0] === "settings") {
    if (method === "GET") return json(await readSettings(db));
    if (method === "PATCH") {
      if (actor !== "user") throw new HttpError(403, "forbidden", "settings can only be changed with the user token");
      await updateSettings(db, await readJson(req), actor);
      return json(await readSettings(db));
    }
  }

  if (seg.length === 1 && seg[0] === "version" && method === "GET") {
    const row = await db.prepare("SELECT COALESCE(MAX(id), 0) AS v FROM events").first();
    return json({ version: row.v });
  }

  // Change log across all projects, newest first, e.g. GET /api/events?limit=50&before=1234 (web app: Verlauf)
  if (seg.length === 1 && seg[0] === "events" && method === "GET") return json({ events: await listEvents(db, eventRange(q)) });

  // Statistics for the web app (☰ → Statistiken), e.g. GET /api/stats?project=CT&tz=-60 (no project = all projects;
  // tz = the browser's getTimezoneOffset(), so days and hours are the reader's own)
  if (seg.length === 1 && seg[0] === "stats" && method === "GET") {
    const project = q.get("project") ? (await getProject(db, q.get("project"))).slug : null;
    return json(await buildStats(db, { project, tz: clampInt(q.get("tz"), -840, 840, 0) }));
  }

  // Suggested project code for a slug, e.g. GET /api/code-suggestion?slug=festival-workshop-planner
  if (seg.length === 1 && seg[0] === "code-suggestion" && method === "GET") {
    const slug = (q.get("slug") || "").toLowerCase();
    if (!SLUG_RE.test(slug)) throw new HttpError(400, "invalid_field", "slug");
    return json({ code: await suggestCode(db, slug) });
  }

  // Footer for several projects at once: GET /api/footer?projects=cotrack,ct2&since=ISO&delta=1
  if (seg.length === 1 && seg[0] === "footer" && method === "GET") {
    const keys = (q.get("projects") || "").split(",").map((k) => k.trim()).filter(Boolean);
    if (!keys.length) throw new HttpError(400, "missing_field", "projects");
    const textLine = await footerFor(db, keys, {
      since: q.get("since") || null,
      delta: q.get("delta") === "1",
      max: clampInt(q.get("max"), 1, 30, 8),
      layout: normLayout(q.get("layout")),
      lang: optLang(q.get("lang")),
    });
    if (q.get("format") === "text") return plain(textLine);
    return json({ footer: textLine });
  }

  if (seg[0] === "kinds" && seg.length === 1) {
    if (method === "GET") return json({ kinds: await listKinds(db, q.get("all") === "1") });
    if (method === "POST") return json({ kind: await upsertKind(db, await readJson(req)) });
  }

  // Cross-project view, e.g. GET /api/items?owner=user&status=open
  if (seg[0] === "items" && seg.length === 1 && method === "GET") {
    const items = await listItems(db, filtersFrom(q));
    // ext_open / ext_next as for one project: with a search or filter, a blocker may be open but not in the list.
    await annotateLinks(db, items);
    if (q.get("format") === "text") {
      return plain(itemsAsText(items, await listKinds(db, true), { withProject: true, lang: await langFor(db, q), codes: await projectCodes(db) }));
    }
    return json({ items });
  }

  if (seg[0] === "projects") {
    if (seg.length === 1) {
      if (method === "GET") return json({ projects: await listProjects(db, q.get("archived") === "1") });
      if (method === "POST") return json({ project: await createProject(db, await readJson(req), actor) }, 201);
    }
    const project = await getProject(db, seg[1]);
    if (guest) await guestGuard(db, seg, method, project);
    if (seg.length === 2) {
      if (method === "GET") return json({ project });
      if (method === "PATCH") return json({ project: await updateProject(db, project, await readJson(req), actor) });
    }
    const sub = seg[2];
    if (sub === "items") {
      if (seg.length === 3) {
        if (method === "GET") {
          // With the items of other projects shown here (also_in, D26); ?shared=0 for the project's own items only.
          const items = q.get("shared") === "0"
            ? await listItems(db, { ...filtersFrom(q), project: project.slug })
            : await projectItems(db, project, filtersFrom(q));
          if (q.get("format") === "text") {
            const [kinds, lang, codes] = await Promise.all([listKinds(db, true), langFor(db, q), projectCodes(db)]);
            return plain(itemsAsText(items, kinds, { lang, viewSlug: project.slug, codes }));
          }
          return json({ items });
        }
        if (method === "POST") return json({ item: await createItem(db, project, await readJson(req), actor) }, 201);
      }
      // Undo a deletion (web app: toast "Rückgängig" and Verlauf → "Wiederherstellen"); the item is gone, so before getItemByRef.
      if (seg.length === 5 && seg[4] === "restore" && method === "POST") {
        return json({ item: await restoreItem(db, project, seg[3], actor) }, 201);
      }
      const item = await getItemByRef(db, project.slug, seg[3]);
      if (seg.length === 4) {
        if (method === "GET") return json({ item });
        if (method === "PATCH") return json({ item: await updateItem(db, project, item, await readJson(req), actor) });
        if (method === "DELETE") return json({ deleted: await deleteItem(db, project, item, actor) });
      }
      // Change log of this one item, plus the items it was converted from (web app: edit dialog → Verlauf, D22)
      if (seg.length === 5 && seg[4] === "events" && method === "GET") return json(await itemHistory(db, project, item));
      if (seg.length === 5 && seg[4] === "convert" && method === "POST") {
        return json(await convertItem(db, project, item, await readJson(req), actor), 201);
      }
    }
    if (seg.length === 3 && method === "GET") {
      if (sub === "version") {
        // global: newest event of any project, so the web app notices new or archived projects too.
        const [v, row] = await Promise.all([
          linkedVersion(db, project.slug),
          db.prepare("SELECT COALESCE(MAX(id), 0) AS g FROM events").first(),
        ]);
        return json({ version: v, global: row.g });
      }
      if (sub === "events") return json({ events: await listEvents(db, { project: project.slug, ...eventRange(q) }) });
      if (sub === "footer") {
        const textLine = await footerFor(db, [project.slug], {
          max: clampInt(q.get("max"), 1, 30, 8),
          since: q.get("since") || null,
          delta: q.get("delta") === "1",
          layout: normLayout(q.get("layout")),
          lang: optLang(q.get("lang")),
        });
        if (q.get("format") === "text") return plain(textLine);
        return json({ footer: textLine });
      }
      if (sub === "status.md") {
        const [items, kinds, lang, codes] = await Promise.all([
          listItems(db, { project: project.slug, status: "all" }),
          listKinds(db, true),
          langFor(db, q),
          projectCodes(db),
        ]);
        return plain(buildStatusMarkdown(project, items, kinds, url.origin, lang, codes), "text/markdown; charset=utf-8");
      }
    }
  }
  throw new HttpError(404, "not_found");
}

/* --------------------------------------------------------------- events */

/**
 * Version of a project for polling (web app) and for cotrack_status / cotrack_changes: its newest event – and, since
 * D26, the newest event of what it shows or is linked to: items of other projects shown in it (also_in), items it
 * waits for or that wait for it across projects, and changes of also_in that add or remove it.
 */
export async function linkedVersion(db, slug) {
  const { where, args } = await linkedScope(db, slug);
  const row = await db.prepare(`SELECT COALESCE(MAX(id), 0) AS v FROM events WHERE ${where}`).bind(...args).first();
  return row.v;
}

// SQL condition on events for a project and everything shown in or linked to it (see linkedVersion).
export async function linkedScope(db, slug) {
  let rows = [];
  try {
    ({ results: rows } = await db
      .prepare(
        `SELECT project_slug, kind || seq AS ref, waiting_on, also_in FROM items
         WHERE (also_in IS NOT NULL AND ',' || also_in || ',' LIKE ?) OR waiting_on LIKE '%:%'`,
      )
      .bind(`%,${slug},%`)
      .all());
  } catch (err) {
    if (!missingAlsoIn(err)) throw err;
    return { where: "project_slug = ?", args: [slug] };
  }
  const keys = new Set();
  const shownHere = new Set(rows.filter((r) => refList(r.also_in).includes(slug)).map(itemKey));
  for (const r of rows) {
    if (shownHere.has(itemKey(r))) keys.add(itemKey(r));
    const waits = waitKeys(r);
    // another project waits for one of ours: its changes move our ▶
    if (r.project_slug !== slug && waits.some((k) => k.startsWith(slug + ":"))) keys.add(itemKey(r));
    // we (or an item shown here) wait for an item elsewhere: its changes move our ⏸
    if (r.project_slug === slug || shownHere.has(itemKey(r))) for (const k of waits) if (!k.startsWith(slug + ":")) keys.add(k);
  }
  // Items of a shown item's home project that wait for it ("A1" there): their changes move its ▶ here.
  const shared = [...shownHere].map((k) => ({ s: k.slice(0, k.indexOf(":")), r: k.slice(k.indexOf(":") + 1) }));
  if (shared.length) {
    const { results } = await db
      .prepare("SELECT project_slug, kind || seq AS ref, waiting_on FROM items WHERE waiting_on IS NOT NULL AND project_slug IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify([...new Set(shared.map((x) => x.s))]))
      .all();
    for (const r of results) if (waitKeys(r).some((k) => shownHere.has(k))) keys.add(itemKey(r));
  }
  // A removed dependency – or a deleted (or restored) item that had one – is only (or also) left in its event:
  // waiting_on_was (or the deleted item's snapshot). Match it against ours ("slug:A1" from other projects) and against
  // the items shown here ("A1" from their home project), so the version still moves and cotrack_changes reports it.
  const was = `(CASE WHEN json_valid(events.data) THEN ',' || COALESCE(json_extract(events.data, '$.waiting_on_was'),
    CASE WHEN events.action IN ('deleted', 'restored') THEN json_extract(events.data, '$.waiting_on') END) || ',' END)`;
  const where = [
    "events.project_slug = ?",
    "(events.data LIKE '%\"also_in%' AND events.data LIKE ?)",
    "events.project_slug || ':' || events.item_ref IN (SELECT value FROM json_each(?))",
    `(events.data LIKE '%waiting_on%' AND (${was} LIKE ? OR EXISTS (SELECT 1 FROM json_each(?) j
      WHERE events.project_slug = json_extract(j.value, '$.s') AND ${was} LIKE '%,' || json_extract(j.value, '$.r') || ',%')))`,
  ].join(" OR ");
  // JSON lists keep the number of bound values small (D1 allows 100 per query).
  return { where, args: [slug, `%${slug}%`, JSON.stringify([...keys]), `%,${slug}:%`, JSON.stringify(shared)] };
}

// ?after= (newer than, for catching up) and ?before= (older than, for paging back); newest first, at most 500.
function eventRange(q) {
  return {
    after: clampInt(q.get("after"), 0, Number.MAX_SAFE_INTEGER, 0),
    before: clampInt(q.get("before"), 1, Number.MAX_SAFE_INTEGER, null),
    limit: clampInt(q.get("limit"), 1, 500, 100),
  };
}

// The item's current title comes along (null once it is deleted; a "deleted" event keeps it in its data).
export async function listEvents(db, { project = null, after = 0, before = null, limit = 100 } = {}) {
  const where = ["e.id > ?"];
  const args = [after];
  if (before != null) {
    where.push("e.id < ?");
    args.push(before);
  }
  if (project) {
    where.push("e.project_slug = ?");
    args.push(project);
  }
  const { results } = await db
    .prepare(
      `SELECT e.*, (SELECT i.title FROM items i WHERE i.project_slug = e.project_slug AND i.kind || i.seq = e.item_ref) AS title
       FROM events e WHERE ${where.join(" AND ")} ORDER BY e.id DESC LIMIT ?`,
    )
    .bind(...args, limit)
    .all();
  return results.map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : null }));
}

// One item's history, newest first: its own events and those of the items it was converted from (an idea or warning
// that became this action/decision; followed back over several steps). from = those earlier items, nearest first.
// The chain is read from the "converted" events, not from the items table: a source item deleted later keeps its
// events (deleteItem only removes the row), so its history still shows up – then with deleted: true.
export async function itemHistory(db, project, item, { limit = 500 } = {}) {
  const from = [];
  for (let ref = item.ref; from.length < 5; ) {
    const src = await db
      .prepare(
        `SELECT e.item_ref AS ref, i.kind, i.title FROM events e
         LEFT JOIN items i ON i.project_slug = e.project_slug AND i.kind || i.seq = e.item_ref
         WHERE e.project_slug = ? AND e.action = 'converted' AND json_extract(e.data, '$.to') = ?
         ORDER BY e.id DESC LIMIT 1`,
      )
      .bind(project.slug, ref)
      .first();
    if (!src || src.ref === item.ref || from.some((f) => f.ref === src.ref)) break;
    if (!src.kind) {
      // gone: kind from the reference, title from its last snapshot (the "deleted" event holds the whole item)
      const snap = await db
        .prepare(
          `SELECT json_extract(data, '$.title') AS title FROM events WHERE project_slug = ? AND item_ref = ?
           AND json_extract(data, '$.title') IS NOT NULL ORDER BY id DESC LIMIT 1`,
        )
        .bind(project.slug, src.ref)
        .first();
      Object.assign(src, { kind: src.ref.match(/^[A-Z]+/)?.[0] ?? null, title: snap?.title ?? null, deleted: true });
    }
    from.push(src);
    ref = src.ref;
  }
  const refs = [item.ref, ...from.map((f) => f.ref)];
  const { results } = await db
    .prepare(
      `SELECT id, item_ref, action, actor, data, at FROM events
       WHERE project_slug = ? AND item_ref IN (${refs.map(() => "?").join(", ")}) ORDER BY id DESC LIMIT ?`,
    )
    .bind(project.slug, ...refs, limit)
    .all();
  return { ref: item.ref, from, events: results.map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : null })) };
}

/* ----------------------------------------------------------- statistics */

const DAY_MS = 864e5;
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Everything the statistics views show, counted from items and the change log. Days are local to the reader (tz in
// minutes, as Date#getTimezoneOffset). "Responsible" = owner, or the kind's default; only kinds with an owner count.
export async function buildStats(db, { project = null, tz = 0 } = {}) {
  const [itemRes, kinds, evRes] = await Promise.all([
    // all items, not the board's capped list
    db.prepare(`${ITEM_SELECT} WHERE ? IS NULL OR i.project_slug = ?`).bind(project, project).all(),
    listKinds(db, true),
    db
      .prepare(
        `SELECT project_slug, item_ref, action, actor, data, at FROM events
         WHERE ? IS NULL OR project_slug = ? ORDER BY id LIMIT 50000`,
      )
      .bind(project, project)
      .all(),
  ]);
  const items = itemRes.results;
  const events = evRes.results;
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const local = (iso) => new Date(Date.parse(iso) - tz * 60000);
  const dayKey = (iso) => local(iso).toISOString().slice(0, 10);
  const nowIso = now();
  const today = dayKey(nowIso);
  const dayNum = (key) => Date.parse(key + "T00:00:00Z") / DAY_MS;
  const key = (slug, ref) => slug + ":" + ref;
  const byKey = new Map(items.map((i) => [key(i.project_slug, i.ref), i]));
  const isOpen = (i) => OPEN.includes(i.status);
  const ownerOf = (i) => {
    const k = kindBy.get(i.kind);
    return k?.actionable ? i.owner || k.default_owner || "user" : null;
  };

  // days: created / done / dropped per local day and open at the end of each day, replayed from the change log of the
  // items that still exist – so a completion stays on its day even if the item was reopened later
  const tally = new Map(); // dayNum -> counts
  const at = (iso) => {
    const n = dayNum(dayKey(iso));
    if (!tally.has(n)) tally.set(n, { created: 0, done: 0, dropped: 0, done_user: 0, done_ai: 0, reopened: 0, refs: [] });
    return tally.get(n);
  };
  const closedNow = new Map(); // key -> closed in the replay so far
  const close = (i, k, status, iso) => {
    if (closedNow.get(k)) return;
    closedNow.set(k, true);
    const t = at(iso);
    t[status]++;
    if (status !== "done") return;
    const o = ownerOf(i);
    if (o === "user" || o === "ai") t["done_" + o]++;
    t.refs.push(k);
  };
  const seen = new Set();
  for (const e of events) {
    const k = e.item_ref && key(e.project_slug, e.item_ref);
    const i = k && byKey.get(k);
    if (!i) continue;
    if (e.action === "created") {
      if (seen.has(k)) continue;
      seen.add(k);
      at(e.at).created++;
      let st;
      try { st = e.data ? JSON.parse(e.data).status : null; } catch { st = null; }
      if (CLOSED.includes(st)) close(i, k, st, e.at);
    } else if (e.action === "done" || e.action === "converted" || e.action === "dropped") {
      close(i, k, e.action === "dropped" ? "dropped" : "done", e.at);
    } else if (e.action === "reopened" && closedNow.get(k)) {
      closedNow.set(k, false);
      at(e.at).reopened++;
    }
  }
  // items without a creation event (none expected): fall back to their own dates
  for (const i of items) {
    const k = key(i.project_slug, i.ref);
    if (seen.has(k)) continue;
    at(i.created_at).created++;
    if (i.closed_at && CLOSED.includes(i.status)) close(i, k, i.status, i.closed_at);
  }
  const firstDay = tally.size ? Math.min(...tally.keys()) : dayNum(today);
  const start = Math.max(firstDay, dayNum(today) - 400);
  let open = 0;
  for (const [n, t] of tally) if (n < start) open += t.created - t.done - t.dropped + t.reopened;
  const days = [];
  const doneRefs = new Map(); // date -> refs done that day
  for (let n = start; n <= dayNum(today); n++) {
    const t = tally.get(n) || { created: 0, done: 0, dropped: 0, done_user: 0, done_ai: 0, reopened: 0, refs: [] };
    const date = new Date(n * DAY_MS).toISOString().slice(0, 10);
    open += t.created - t.done - t.dropped + t.reopened;
    days.push({ date, created: t.created, done: t.done, dropped: t.dropped, done_user: t.done_user, done_ai: t.done_ai, open });
    if (t.refs.length) doneRefs.set(date, t.refs);
  }

  // open now, oldest first
  const aging = items
    .filter(isOpen)
    .map((i) => ({ project_slug: i.project_slug, ref: i.ref, kind: i.kind, title: i.short || i.title, owner: ownerOf(i),
      status: i.status, days: dayNum(today) - dayNum(dayKey(i.created_at)) }))
    .sort((a, b) => b.days - a.days);

  // lead time in days (created → done; ideas also until dropped), median per kind
  const leadLists = {};
  for (const i of items) {
    if (!i.closed_at || !(i.status === "done" || (i.status === "dropped" && i.kind === "I"))) continue;
    (leadLists[i.kind] ||= []).push(Math.max(0, Date.parse(i.closed_at) - Date.parse(i.created_at)) / DAY_MS);
  }
  const lead = Object.fromEntries(Object.entries(leadLists).map(([k, xs]) => [k, { median: median(xs), n: xs.length }]));
  const allLead = items.filter((i) => i.status === "done" && i.closed_at).map((i) => Math.max(0, Date.parse(i.closed_at) - Date.parse(i.created_at)) / DAY_MS);

  // streaks of days with something done (today may still be empty: then the streak runs up to yesterday)
  let best = 0, run = 0;
  for (const d of days) { run = d.done ? run + 1 : 0; best = Math.max(best, run); }
  let current = 0;
  for (let n = days.length - 1 - (days.at(-1)?.done ? 0 : 1); n >= 0 && days[n].done; n--) current++;

  // records: the whole history; "this week" = the last 7 local days
  const weekStart = dayNum(today) - 6;
  const inWeek = (iso) => iso && dayNum(dayKey(iso)) >= weekStart;
  const bestDay = days.reduce((m, d) => (d.done > (m?.done || 0) ? d : m), null);
  const pick = (i) => i && { project_slug: i.project_slug, ref: i.ref, title: i.short || i.title, status: i.status };
  let fastest = null;
  for (const i of items) {
    if (i.kind !== "D" || i.status !== "done" || i.converted_to || !inWeek(i.closed_at)) continue;
    const min = Math.max(0, Date.parse(i.closed_at) - Date.parse(i.created_at)) / 60000;
    if (!fastest || min < fastest.minutes) fastest = { ...pick(i), minutes: Math.round(min) };
  }
  const changes = new Map();
  const heat = Array.from({ length: 7 }, () => Array(8).fill(0)); // Mon..Sun × 3-hour blocks
  for (const e of events) {
    const t = local(e.at);
    heat[(t.getUTCDay() + 6) % 7][Math.floor(t.getUTCHours() / 3)]++;
    if (e.item_ref && inWeek(e.at)) changes.set(key(e.project_slug, e.item_ref), (changes.get(key(e.project_slug, e.item_ref)) || 0) + 1);
  }
  const [busyKey, busyN] = [...changes].sort((a, b) => b[1] - a[1])[0] || [];
  const busy = busyKey && byKey.get(busyKey) ? { ...pick(byKey.get(busyKey)), changes: busyN } : null;

  // ideas: accepted (converted), of those done, dropped, still open
  const ideas = items.filter((i) => i.kind === "I");
  const accepted = ideas.filter((i) => i.converted_to && i.converted_to !== "pending");
  const ideaStats = {
    total: ideas.length,
    accepted: accepted.length,
    implemented: accepted.filter((i) => byKey.get(key(i.project_slug, i.converted_to))?.status === "done").length,
    dropped: ideas.filter((i) => i.status === "dropped").length,
    open: ideas.filter(isOpen).length,
    recent: accepted.sort((a, b) => (b.closed_at || "").localeCompare(a.closed_at || "")).slice(0, 3)
      .map((i) => ({ project_slug: i.project_slug, ref: i.ref, to: i.converted_to, title: i.short || i.title })),
  };

  // waiting: from the first event that set the reference (else the item's creation) until the blocker or the waiting
  // item closed; still waiting, or resolved within the last 14 days, are listed
  const waitStart = new Map();
  for (const e of events) {
    if (!e.item_ref || !e.data) continue;
    let w;
    try { w = JSON.parse(e.data).waiting_on; } catch { continue; }
    for (const r of String(w || "").split(",").filter(Boolean)) {
      const k = key(e.project_slug, e.item_ref) + ">" + r;
      if (!waitStart.has(k)) waitStart.set(k, e.at);
    }
  }
  const waits = [];
  for (const i of items) {
    for (const r of String(i.waiting_on || "").split(",").filter(Boolean)) {
      const blocker = byKey.get(r.includes(":") ? r : key(i.project_slug, r));
      if (!blocker) continue;
      const from = waitStart.get(key(i.project_slug, i.ref) + ">" + r) || i.created_at;
      const until = [blocker.closed_at, i.closed_at, nowIso].filter(Boolean).sort()[0];
      const still = isOpen(i) && isOpen(blocker);
      waits.push({ project_slug: i.project_slug, ref: i.ref, kind: i.kind, on: r, on_kind: blocker.kind, still,
        days: Math.max(0, (Date.parse(until) - Date.parse(from)) / DAY_MS), freed: still ? null : blocker.closed_at });
    }
  }
  const recentCut = Date.parse(nowIso) - 14 * DAY_MS;

  // effort and benefit (v2.10): matrix of the open actions and ideas, lead time per effort class, benefit done per
  // week, and a rough forecast per owner (open effort against the pace of the last four weeks)
  const sizable = (i) => SIZED_KINDS.includes(i.kind);
  const openSizable = items.filter((i) => isOpen(i) && sizable(i));
  const matrix = openSizable.filter((i) => i.effort && i.benefit).map((i) => ({ project_slug: i.project_slug, ref: i.ref,
    kind: i.kind, title: i.short || i.title, owner: ownerOf(i), effort: i.effort, benefit: i.benefit, estimated: i.sized_by !== "user" }));
  const doneActions = items.filter((i) => i.kind === "A" && i.status === "done" && i.closed_at);
  const byEffort = EFFORTS.map((e) => {
    const xs = doneActions.filter((i) => i.effort === e).map((i) => Math.max(0, Date.parse(i.closed_at) - Date.parse(i.created_at)) / DAY_MS);
    return { effort: e, open: openSizable.filter((i) => i.effort === e).length, median: median(xs), n: xs.length };
  });
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const from = dayNum(today) - 6 - 7 * w, to = from + 6;
    const inside = doneActions.filter((i) => { const n = dayNum(dayKey(i.closed_at)); return n >= from && n <= to; });
    const count = (b) => inside.filter((i) => (i.benefit || null) === b).length;
    weeks.push({ from: new Date(from * DAY_MS).toISOString().slice(0, 10), high: count("high"), medium: count("medium"), low: count("low"), none: count(null) });
  }
  const paceFrom = dayNum(today) - 27;
  const forecast = {};
  for (const owner of ["user", "ai"]) {
    const mine = items.filter((i) => i.kind === "A" && ownerOf(i) === owner);
    const open = mine.filter(isOpen);
    const recent = mine.filter((i) => i.status === "done" && i.closed_at && i.effort && dayNum(dayKey(i.closed_at)) >= paceFrom);
    const hours = (xs) => xs.reduce((s, i) => s + (EFFORT_HOURS[i.effort] || 0), 0);
    const pace = hours(recent) / 4;
    forecast[owner] = { open_hours: hours(open.filter((i) => i.effort)), open_sized: open.filter((i) => i.effort).length,
      open_unsized: open.filter((i) => !i.effort).length, pace_hours_week: pace, basis: recent.length };
  }
  const sizing = {
    matrix,
    unsized: openSizable.filter((i) => !i.effort || !i.benefit).length,
    estimated: openSizable.filter((i) => (i.effort || i.benefit) && i.sized_by !== "user").length,
    by_effort: byEffort,
    weeks,
    forecast,
  };

  return {
    generated_at: nowIso, project, today, tz, items_total: items.length,
    days,
    open: { total: aging.length, by_kind: aging.reduce((m, a) => ((m[a.kind] = (m[a.kind] || 0) + 1), m), {}) },
    aging,
    lead: { overall: median(allLead), by_kind: lead },
    streak: { current, best },
    records: {
      best_day: bestDay && { date: bestDay.date, done: bestDay.done, refs: (doneRefs.get(bestDay.date) || []).slice(0, 5) },
      fastest_decision: fastest,
      most_changed: busy,
      oldest_open: aging[0] || null,
    },
    heat,
    ideas: ideaStats,
    waits: {
      avg_days: waits.length ? waits.reduce((s, w) => s + w.days, 0) / waits.length : null,
      list: waits.filter((w) => w.still || (w.freed && Date.parse(w.freed) >= recentCut))
        .sort((a, b) => b.still - a.still || b.days - a.days).slice(0, 6),
    },
    sizing,
  };
}

/* ------------------------------------------------------------- projects */

export async function listProjects(db, includeArchived) {
  const { results } = await db
    .prepare(
      `SELECT p.*,
         (SELECT COUNT(*) FROM items i WHERE i.project_slug = p.slug AND i.status IN ('open','doing','blocked')) AS open_count
       FROM projects p WHERE p.archived = 0 OR ? = 1 ORDER BY p.updated_at DESC`,
    )
    .bind(includeArchived ? 1 : 0)
    .all();
  return results;
}

// Accepts the slug or the code of a project ("cotrack" or "CT"); case does not matter.
export async function getProject(db, key) {
  const k = String(key ?? "").trim();
  const p = k
    ? await db.prepare("SELECT * FROM projects WHERE slug = ? OR code = ?").bind(k.toLowerCase(), k.toUpperCase()).first()
    : null;
  if (!p) throw new HttpError(404, "project_not_found", k);
  return p;
}

// "CT:A14" -> { qualifier: "CT", ref: "A14" }; "A14" -> { qualifier: null, ref: "A14" }
export function splitRef(ref) {
  const s = String(ref ?? "").trim();
  const m = s.match(QREF_RE);
  return m ? { qualifier: m[1], ref: m[2] } : { qualifier: null, ref: s };
}

/*
 * Across projects (decision D26): internally an item is addressed by its key "slug:A4". waiting_on stores plain refs
 * for the same project ("A2") and keys for other projects ("immobilien:A2"); also_in stores slugs. What people and
 * the AI read is relative to the project in view: "A2" for its own items, "IMM:A2" (code, else slug) for others.
 */
export const refList = (s) => String(s || "").split(",").map((r) => r.trim()).filter(Boolean);
export const itemKey = (it) => `${it.project_slug}:${it.ref}`;
export const waitKeys = (it) => refList(it.waiting_on).map((r) => (r.includes(":") ? r : `${it.project_slug}:${r}`));
export function keyLabel(key, viewSlug, codes) {
  const i = key.indexOf(":");
  const slug = key.slice(0, i), ref = key.slice(i + 1);
  return slug === viewSlug ? ref : `${codes?.get(slug) || slug}:${ref}`;
}
// slug -> what references show for it (the code, else the slug)
export async function projectCodes(db) {
  const { results } = await db.prepare("SELECT slug, code FROM projects").all();
  return new Map(results.map((p) => [p.slug, p.code || p.slug]));
}
const missingAlsoIn = (err) => /(no such column:?\s*(\w+\.)?|has no column named )also_in/i.test(String(err?.message ?? err));

// Codes and slugs share one namespace for lookups, so a code must not equal another project's slug
// (and vice versa); otherwise "CO" could mean two projects.
async function assertCodeFree(db, code, ownSlug) {
  const clash = await db
    .prepare("SELECT slug FROM projects WHERE (code = ? OR slug = ?) AND slug != ?")
    .bind(code, code.toLowerCase(), ownSlug ?? "")
    .first();
  if (clash) throw new HttpError(409, "code_taken", `${code} (${clash.slug})`);
}

// The checks above give friendly errors; the unique index and the namespace triggers in migration 0004 are the
// atomic backstop when two requests race. Translate their failures into the same 409.
async function batchProject(db, stmts, detail) {
  try {
    await db.batch(stmts);
  } catch (err) {
    if (/code_immutable/.test(String(err?.message ?? err))) throw new HttpError(409, "code_immutable", detail);
    if (/code_slug_clash|UNIQUE constraint failed: projects\.code/.test(String(err?.message ?? err))) {
      throw new HttpError(409, "code_taken", detail);
    }
    throw err;
  }
}

function codeCandidates(slug) {
  const parts = slug.toUpperCase().split("-").map((p) => p.replace(/[^A-Z]/g, "")).filter(Boolean);
  const letters = parts.join("");
  const out = [];
  if (parts.length > 1) out.push(parts.map((p) => p[0]).join("").slice(0, 4)); // initials: "test-sandbox" -> TS
  for (const n of [2, 3, 4]) out.push(letters.slice(0, n));
  for (let n = 2; n < 100 && letters.length >= 2; n++) out.push(`${letters.slice(0, 2)}${n}`);
  return [...new Set(out)].filter((c) => CODE_RE.test(c));
}

// First free candidate: initials of the slug parts, then its first 2, 3, 4 letters. Null if none fits.
export async function suggestCode(db, slug, ownSlug = null) {
  const { results } = await db.prepare("SELECT slug, code FROM projects WHERE slug != ?").bind(ownSlug ?? "").all();
  const used = new Set(results.flatMap((r) => [r.slug.toUpperCase(), r.code].filter(Boolean)));
  return codeCandidates(slug).find((c) => !used.has(c)) ?? null;
}

function normCode(v) {
  const code = text(v, "code", 4)?.toUpperCase() ?? null;
  if (code && !CODE_RE.test(code)) throw new HttpError(400, "invalid_field", "code (2-4 characters: two letters, then letters or digits)");
  return code;
}

export async function createProject(db, input, actor) {
  const slug = text(input.slug, "slug", 63, { required: true }).toLowerCase();
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "invalid_field", "slug (a-z, 0-9, -)");
  const name = text(input.name, "name", 120) || slug;
  const repo = text(input.repo, "repo", 200);
  if (repo && !REPO_RE.test(repo)) throw new HttpError(400, "invalid_field", "repo (owner/name)");
  const t = now();
  const exists = await db.prepare("SELECT 1 FROM projects WHERE slug = ?").bind(slug).first();
  if (exists) throw new HttpError(409, "project_exists", slug);
  // The human may choose the code; otherwise one is suggested from the slug.
  let code = normCode(input.code);
  if (code) await assertCodeFree(db, code, slug);
  else code = await suggestCode(db, slug);
  const taken = await db.prepare("SELECT 1 FROM projects WHERE code = ?").bind(slug.toUpperCase()).first();
  if (taken) throw new HttpError(409, "slug_matches_code", slug);
  await batchProject(
    db,
    [
      db
        .prepare("INSERT INTO projects (slug, name, repo, code, archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
        .bind(slug, name, repo, code, t, t),
      eventStmt(db, slug, null, "project_created", actor, { name, repo, code }, t),
    ],
    `${code ?? ""} / ${slug}`,
  );
  return getProject(db, slug);
}

export async function updateProject(db, project, input, actor) {
  const changes = {};
  if ("name" in input) changes.name = text(input.name, "name", 120, { required: true });
  if ("repo" in input) {
    changes.repo = text(input.repo, "repo", 200);
    if (changes.repo && !REPO_RE.test(changes.repo)) throw new HttpError(400, "invalid_field", "repo");
  }
  if ("code" in input) {
    // Set once, never changed: references written down in chats and documents must stay valid.
    const code = normCode(input.code);
    if (!code) throw new HttpError(400, "missing_field", "code");
    if (project.code && project.code !== code) throw new HttpError(409, "code_immutable", project.code);
    if (project.code !== code) {
      await assertCodeFree(db, code, project.slug);
      changes.code = code;
    }
  }
  if ("archived" in input) changes.archived = input.archived ? 1 : 0;
  const cols = Object.keys(changes);
  if (!cols.length) return project;
  const t = now();
  await batchProject(
    db,
    [
      db
        .prepare(`UPDATE projects SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE slug = ?`)
        .bind(...cols.map((c) => changes[c]), t, project.slug),
      eventStmt(db, project.slug, null, "project_updated", actor, changes, t),
    ],
    `${changes.code ?? ""} / ${project.slug}`,
  );
  return getProject(db, project.slug);
}

/* ---------------------------------------------------------------- kinds */

export async function listKinds(db, includeInactive) {
  const { results } = await db
    .prepare("SELECT * FROM kinds WHERE active = 1 OR ? = 1 ORDER BY sort_order, code")
    .bind(includeInactive ? 1 : 0)
    .all();
  return results;
}

async function upsertKind(db, input) {
  const code = text(input.code, "code", 4, { required: true }).toUpperCase();
  if (!KIND_RE.test(code)) throw new HttpError(400, "invalid_field", "code (1-4 letters)");
  const row = {
    code,
    name: text(input.name, "name", 60, { required: true }),
    description: text(input.description, "description", 1000),
    actionable: input.actionable === false || input.actionable === 0 ? 0 : 1,
    default_owner: normOwner(input.default_owner),
    footer_label: text(input.footer_label, "footer_label", 20),
    color: text(input.color, "color", 20),
    sort_order: clampInt(input.sort_order, 0, 999, 50),
    active: input.active === false || input.active === 0 ? 0 : 1,
  };
  const cols = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO kinds (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
       ON CONFLICT(code) DO UPDATE SET ${cols.filter((c) => c !== "code").map((c) => `${c} = excluded.${c}`).join(", ")}`,
    )
    .bind(...cols.map((c) => row[c]))
    .run();
  return db.prepare("SELECT * FROM kinds WHERE code = ?").bind(code).first();
}

/* ---------------------------------------------------------------- items */

function filtersFrom(q) {
  return {
    status: q.get("status") || "open",
    kind: q.get("kind") ? q.get("kind").toUpperCase() : null,
    owner: q.get("owner") ? normOwner(q.get("owner")) : null,
    q: q.get("q") || null,
  };
}

const ITEM_SELECT = `SELECT i.*, i.kind || i.seq AS ref FROM items i LEFT JOIN kinds k ON k.code = i.kind`;

// f.shared (with f.project): also the items of other projects that are shown in this one (also_in, decision D26).
export async function listItems(db, f) {
  if (f.project && f.shared) {
    try {
      return await queryItems(db, f);
    } catch (err) {
      if (!missingAlsoIn(err)) throw err; // migration 0010 not applied yet: home items only
    }
  }
  return queryItems(db, { ...f, shared: false });
}

async function queryItems(db, f) {
  const where = [];
  const args = [];
  if (f.project && f.shared) {
    where.push("(i.project_slug = ? OR ',' || COALESCE(i.also_in, '') || ',' LIKE ?)");
    args.push(f.project, `%,${f.project},%`);
  } else if (f.project) {
    where.push("i.project_slug = ?");
    args.push(f.project);
  }
  if (f.status === "open") where.push("i.status IN ('open','doing','blocked')");
  else if (f.status === "closed") where.push("i.status IN ('done','dropped')");
  else if (STATUSES.includes(f.status)) {
    where.push("i.status = ?");
    args.push(f.status);
  }
  if (f.kind) {
    where.push("i.kind = ?");
    args.push(f.kind);
  }
  if (f.owner) {
    where.push("i.owner = ?");
    args.push(f.owner);
  }
  if (f.q) {
    where.push("(i.title LIKE ? OR i.short LIKE ? OR i.body LIKE ? OR i.source LIKE ?)");
    const like = `%${f.q}%`;
    args.push(like, like, like, like);
  }
  // Within a kind, a project's own items come before those shown from other projects.
  const homeFirst = f.project && f.shared ? "i.project_slug != ?, " : "";
  if (homeFirst) args.push(f.project);
  const sql = `${ITEM_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY COALESCE(k.sort_order, 999), i.kind, ${homeFirst}i.project_slug, i.seq LIMIT 2000`;
  const { results } = await db.prepare(sql).bind(...args).all();
  return results;
}

// Keys ("slug:A4") of the open items that wait for slug:ref – in its own project and in others ("slug:ref" in waiting_on).
export async function successorsOf(db, slug, ref) {
  const { results } = await db
    .prepare(
      `SELECT project_slug, kind || seq AS ref FROM items
       WHERE status IN ('open','doing','blocked')
         AND ((project_slug = ? AND ',' || waiting_on || ',' LIKE ?) OR ',' || waiting_on || ',' LIKE ?)
       ORDER BY project_slug != ?, project_slug, kind, seq`,
    )
    .bind(slug, `%,${ref},%`, `%,${slug}:${ref},%`, slug)
    .all();
  return results.map(itemKey);
}

/**
 * The items of a project as it is seen (decision D26): its own plus those shown in it via also_in. Each item gets
 *   ext_open – keys of blockers outside the list that are still open (or unknown), so ⏸ stays right for them;
 *   ext_next – keys of open items outside the list that wait for it, so ▶ shows them too.
 * The footer, the text lists and the web app read both next to what they work out from the list itself.
 */
export async function projectItems(db, project, filters = {}) {
  const items = await listItems(db, { ...filters, project: project.slug, shared: true });
  await annotateLinks(db, items);
  return items;
}

export async function annotateLinks(db, items) {
  const inList = new Set(items.map(itemKey));
  const outside = [...new Set(items.flatMap(waitKeys).filter((k) => !inList.has(k)))];
  const status = new Map();
  for (let n = 0; n < outside.length; n += 50) {
    const part = outside.slice(n, n + 50);
    const { results } = await db
      .prepare(`SELECT project_slug, kind || seq AS ref, status FROM items WHERE project_slug || ':' || kind || seq IN (${part.map(() => "?").join(",")})`)
      .bind(...part)
      .all();
    for (const r of results) status.set(itemKey(r), r.status);
  }
  // Open items anywhere that wait for something: the few with a qualified reference, plus all of the projects in the list.
  const slugs = [...new Set(items.map((i) => i.project_slug))];
  const { results: waiting } = slugs.length
    ? await db
        .prepare(
          `SELECT project_slug, kind || seq AS ref, waiting_on FROM items
           WHERE status IN ('open','doing','blocked') AND waiting_on IS NOT NULL
             AND (waiting_on LIKE '%:%' OR project_slug IN (${slugs.map(() => "?").join(",")}))`,
        )
        .bind(...slugs)
        .all()
    : { results: [] };
  const next = new Map();
  for (const w of waiting) {
    const wk = itemKey(w);
    if (inList.has(wk)) continue; // the list itself already shows it
    for (const k of waitKeys(w)) if (inList.has(k)) next.set(k, [...(next.get(k) || []), wk]);
  }
  for (const it of items) {
    it.ext_open = waitKeys(it).filter((k) => !inList.has(k) && (!status.has(k) || OPEN.includes(status.get(k))));
    it.ext_next = next.get(itemKey(it)) || [];
  }
  return items;
}

function parseRef(ref) {
  const m = String(ref || "").toUpperCase().match(REF_RE);
  if (!m) throw new HttpError(400, "invalid_ref", ref);
  return { kind: m[1], seq: Number(m[2]) };
}

export async function getItemByRef(db, slug, ref) {
  const { qualifier, ref: plainRef } = splitRef(ref);
  if (qualifier && (await getProject(db, qualifier)).slug !== slug) {
    throw new HttpError(400, "ref_project_mismatch", `${ref} does not belong to ${slug}`);
  }
  const { kind, seq } = parseRef(plainRef);
  const item = await db
    .prepare(`${ITEM_SELECT} WHERE i.project_slug = ? AND i.kind = ? AND i.seq = ?`)
    .bind(slug, kind, seq)
    .first();
  if (!item) throw new HttpError(404, "item_not_found", `${kind}${seq}`);
  return item;
}

async function getKind(db, code) {
  const k = await db.prepare("SELECT * FROM kinds WHERE code = ?").bind(code).first();
  if (!k || !k.active) throw new HttpError(400, "unknown_kind", code);
  return k;
}

// sizedBy, inherit: only for conversions, which keep who set the values (an estimate stays an estimate) and the sessions
// the idea was worked on in.
export async function createItem(db, project, input, actor, { sizedBy = null, inherit = null } = {}) {
  const kind = await getKind(db, String(input.kind || "").toUpperCase());
  const t = now();
  const row = {
    id: crypto.randomUUID(),
    project_slug: project.slug,
    kind: kind.code,
    title: text(input.title, "title", 500, { required: true }),
    short: text(input.short, "short", 40),
    body: text(input.body, "body", 20000),
    // Without an explicit owner, actionable items belong to whoever creates them.
    owner: "owner" in input ? normOwner(input.owner) : (kind.default_owner ?? (kind.actionable ? actor : null)),
    status: normStatus(input.status ?? "open"),
    waiting_on: await normWaiting(db, input.waiting_on, project.slug),
    source: text(input.source, "source", 1000),
    due: normDate(input.due),
    created_by: actor,
    updated_by: actor,
    created_at: t,
    updated_at: t,
  };
  row.closed_at = CLOSED.includes(row.status) ? t : null;
  assertCheckLimit(kind.code, row.body);
  // Only written when given, so the insert also works on a database without migration 0009 as long as nobody sizes.
  const effort = normEffort(input.effort), benefit = normBenefit(input.benefit);
  if (effort || benefit) {
    assertSizable(kind.code);
    Object.assign(row, { effort, benefit, sized_by: sizedBy || sizer(input, actor) });
  }
  // Likewise only when given (migration 0010).
  const alsoIn = await normAlsoIn(db, input.also_in, project.slug);
  if (alsoIn) row.also_in = alsoIn;
  // Where it was created (D35, migration 0011); a conversion keeps where the idea came from.
  const session = normSession(input.session);
  const firstSession = inherit?.first_session ?? session, lastSession = session ?? inherit?.last_session ?? null;
  if ((firstSession || lastSession) && (await sessionColumns(db))) Object.assign(row, { first_session: firstSession, last_session: lastSession });

  const stmts = [];
  let seqSql;
  const seqArgs = [];
  if (input.seq != null) {
    // Explicit number, e.g. when importing "T3" from an existing chat.
    const seq = clampInt(input.seq, 1, 999999, null);
    if (seq == null) throw new HttpError(400, "invalid_field", "seq");
    const used = await db
      .prepare("SELECT 1 FROM events WHERE project_slug = ? AND item_ref = ? LIMIT 1")
      .bind(project.slug, `${kind.code}${seq}`)
      .first();
    if (used) throw new HttpError(409, "ref_already_used", `${kind.code}${seq}`);
    stmts.push(
      db
        .prepare(
          `INSERT INTO counters (project_slug, kind, last_seq) VALUES (?, ?, ?)
           ON CONFLICT(project_slug, kind) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq)`,
        )
        .bind(project.slug, kind.code, seq),
    );
    seqSql = "?";
    seqArgs.push(seq);
  } else {
    stmts.push(
      db
        .prepare(
          `INSERT INTO counters (project_slug, kind, last_seq) VALUES (?, ?, 1)
           ON CONFLICT(project_slug, kind) DO UPDATE SET last_seq = last_seq + 1`,
        )
        .bind(project.slug, kind.code),
    );
    seqSql = "(SELECT last_seq FROM counters WHERE project_slug = ? AND kind = ?)";
    seqArgs.push(project.slug, kind.code);
  }
  const cols = Object.keys(row);
  stmts.push(
    db
      .prepare(`INSERT INTO items (${cols.join(", ")}, seq) VALUES (${cols.map(() => "?").join(", ")}, ${seqSql})`)
      .bind(...cols.map((c) => row[c]), ...seqArgs),
  );
  stmts.push(
    db
      .prepare(
        `INSERT INTO events (project_slug, item_ref, action, actor, data, at)
         SELECT ?, kind || seq, 'created', ?, ?, ? FROM items WHERE id = ?`,
      )
      .bind(project.slug, actor, JSON.stringify({ title: row.title, owner: row.owner, status: row.status,
        ...(row.sized_by ? { effort: row.effort, benefit: row.benefit, sized_by: row.sized_by } : {}),
        ...(row.also_in ? { also_in: row.also_in } : {}), ...(session ? { session } : {}) }), t, row.id),
  );
  stmts.push(touchProject(db, project.slug, t));
  await batchSharing(db, stmts);
  return db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(row.id).first();
}

// expect (optional, e.g. from undo in the web app): { field: value } the item must still hold when the update is written;
// compared in the UPDATE itself, so a change by someone else in between is not overwritten (409 conflict instead).
const EXPECT_COLS = ["title", "short", "body", "owner", "status", "waiting_on", "source", "due", "also_in", "effort", "benefit", "sized_by", "last_session"];
const SESSION_COLS = ["first_session", "last_session"];
function expectPredicate(input, item) {
  const e = input.expect;
  if (e === undefined || e === null) return { sql: "", args: [] };
  if (typeof e !== "object" || Array.isArray(e)) throw new HttpError(400, "invalid_field", "expect");
  const cols = Object.keys(e);
  const bad = cols.find((c) => !EXPECT_COLS.includes(c) || (e[c] !== null && typeof e[c] !== "string"));
  if (bad) throw new HttpError(400, "invalid_field", `expect.${bad}`);
  // also_in before migration 0010: the column does not exist, so only null can match
  const known = cols.filter((c) => item[c] !== undefined);
  if (cols.some((c) => item[c] === undefined && e[c] !== null)) throw new HttpError(409, "conflict", "the item changed meanwhile");
  return { sql: known.map((c) => ` AND ${c} IS ?`).join(""), args: known.map((c) => e[c]) };
}

export async function updateItem(db, project, item, input, actor) {
  const expect = expectPredicate(input, item);
  const ticking = ["check", "uncheck"].some((k) => input[k] !== undefined && input[k] !== null && input[k] !== "");
  // Sub-item texts in order when the request arrived: a retry may only re-apply the selectors if they still mean the same lines.
  const layout = (it) => JSON.stringify(parseChecks(it.body).map((c) => c.text));
  const firstLayout = ticking ? layout(item) : null;
  // Ticking rewrites the body on the server; if it changed in between (another client), read again and retry.
  for (let attempt = 0; ; attempt++) {
    const t = now();
    const changes = {};
    const set = (col, val) => {
      if (val !== item[col]) changes[col] = val;
    };
    let ticks = null;
    if (ticking) {
      ticks = applyChecks(item, input);
      set("body", ticks.body);
    }
    if ("title" in input) set("title", text(input.title, "title", 500, { required: true }));
    if ("short" in input) set("short", text(input.short, "short", 40));
    if ("body" in input) set("body", text(input.body, "body", 20000));
    if ("owner" in input) set("owner", normOwner(input.owner));
    if ("waiting_on" in input) set("waiting_on", await normWaiting(db, input.waiting_on, item.project_slug));
    if ("also_in" in input) {
      const alsoIn = await normAlsoIn(db, input.also_in, item.project_slug);
      if (alsoIn !== (item.also_in ?? null)) changes.also_in = alsoIn; // undefined before migration 0010
    }
    if ("source" in input) set("source", text(input.source, "source", 1000));
    if ("due" in input) set("due", normDate(input.due));
    // The session this change comes from (D35): it becomes the item's last session, and its first while none is known.
    // Empty clears the link (the field in the web app) – the first one too when it is the same link.
    let session;
    if ("session" in input) {
      session = normSession(input.session);
      if ((session || item.last_session) && (await sessionColumns(db))) {
        if (session && session !== item.last_session) changes.last_session = session;
        if (session && !item.first_session) changes.first_session = session;
        if (!session) {
          changes.last_session = null;
          if (item.first_session === item.last_session) changes.first_session = null;
        }
      }
    }
    if ("effort" in input || "benefit" in input) {
      // Sending the values again (even unchanged) records who stands behind them: the human confirms an estimate that way.
      const effort = "effort" in input ? normEffort(input.effort) : item.effort ?? null;
      const benefit = "benefit" in input ? normBenefit(input.benefit) : item.benefit ?? null;
      if (effort || benefit) assertSizable(item.kind);
      set("effort", effort);
      set("benefit", benefit);
      set("sized_by", effort || benefit ? sizer(input, actor) : null);
    }
    if ("status" in input) {
      const st = normStatus(input.status);
      set("status", st);
      if (st !== item.status && CLOSED.includes(st) !== CLOSED.includes(item.status)) {
        set("closed_at", CLOSED.includes(st) ? t : null);
      }
    }
    if ("body" in changes && !ticks) assertCheckLimit(item.kind, changes.body);
    const cols = Object.keys(changes);
    if (!cols.length) return item;

    let action = "updated";
    if (changes.status === "done") action = "done";
    else if (changes.status === "dropped") action = "dropped";
    else if (changes.status && CLOSED.includes(item.status)) action = "reopened";
    // A tick is logged by what was ticked, not with the whole body.
    let data = changes;
    if (ticks) {
      const { body, ...rest } = changes;
      data = { ...rest, ...(ticks.checked.length ? { checked: ticks.checked } : {}), ...(ticks.unchecked.length ? { unchecked: ticks.unchecked } : {}) };
      if (cols.filter((c) => !SESSION_COLS.includes(c)).length === 1) action = "checked";
    }
    // Where it was shown before, so the projects it leaves notice the change as well (see linkedVersion).
    if ("also_in" in changes) data = { ...data, also_in_was: item.also_in ?? null };
    // Likewise for dependencies: a removed link is otherwise gone from the items (see linkedScope).
    if ("waiting_on" in changes) data = { ...data, waiting_on_was: item.waiting_on ?? null };
    // The session is a note on the event ("session"), not a field change – null when the link was removed.
    data = Object.fromEntries(Object.entries(data).filter(([c]) => !SESSION_COLS.includes(c)));
    if (session || "last_session" in changes) data.session = session ?? null;

    const update = db
      .prepare(
        `UPDATE items SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?` +
          (ticks ? " AND body IS ?" : "") + expect.sql,
      )
      .bind(...cols.map((c) => changes[c]), t, actor, item.id, ...(ticks ? [item.body] : []), ...expect.args);
    // The event is only written if the update hit the row (changes() refers to the statement before it).
    const event = db
      .prepare(
        "INSERT INTO events (project_slug, item_ref, action, actor, data, at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
      )
      .bind(project.slug, item.ref, action, actor, JSON.stringify(data), t);
    const [res] = await batchSharing(db, [update, event, touchProject(db, project.slug, t)]);
    const fresh = await db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(item.id).first();
    if (!res.meta.changes && expect.sql) throw new HttpError(409, "conflict", "the item changed meanwhile");
    if (res.meta.changes || !ticks) return fresh;
    if (attempt >= 2 || !fresh || layout(fresh) !== firstLayout) {
      throw new HttpError(409, "conflict", "the checklist changed meanwhile, read it again and retry");
    }
    item = fresh;
  }
}

// also_in needs migration 0010; without it, say so instead of failing with an internal error.
async function batchSharing(db, stmts) {
  try {
    return await db.batch(stmts);
  } catch (err) {
    if (missingAlsoIn(err)) throw new HttpError(503, "also_in_unavailable", "apply migration 0010 first (npm run db:migrate)");
    throw err;
  }
}

async function deleteItem(db, project, item, actor) {
  const t = now();
  const { id, ...snapshot } = item;
  await db.batch([
    db.prepare("DELETE FROM items WHERE id = ?").bind(id),
    eventStmt(db, project.slug, item.ref, "deleted", actor, snapshot, t),
    touchProject(db, project.slug, t),
  ]);
  return item.ref;
}

// Brings a deleted item back under its own reference, from the snapshot in its "deleted" event. Only while that event is
// the item's latest one (nothing was restored or created under the reference since); refs are never reused, so the
// reference is still free. Items that waited on it keep their waiting_on, so the links come back by themselves.
const RESTORE_COLS = ["kind", "seq", "title", "short", "body", "owner", "status", "waiting_on", "source", "due", "converted_to",
  "created_by", "created_at", "closed_at", "effort", "benefit", "sized_by", "also_in", "first_session", "last_session"];
export async function restoreItem(db, project, ref, actor) {
  const { qualifier, ref: plainRef } = splitRef(ref);
  if (qualifier && (await getProject(db, qualifier)).slug !== project.slug) {
    throw new HttpError(400, "ref_project_mismatch", `${ref} does not belong to ${project.slug}`);
  }
  const { kind, seq } = parseRef(plainRef);
  const key = `${kind}${seq}`;
  const exists = await db
    .prepare("SELECT 1 FROM items WHERE project_slug = ? AND kind = ? AND seq = ?")
    .bind(project.slug, kind, seq)
    .first();
  if (exists) throw new HttpError(409, "item_exists", key);
  const last = await db
    .prepare("SELECT action, data FROM events WHERE project_slug = ? AND item_ref = ? ORDER BY id DESC LIMIT 1")
    .bind(project.slug, key)
    .first();
  if (!last || last.action !== "deleted" || !last.data) throw new HttpError(404, "item_not_found", key);
  const snap = JSON.parse(last.data);
  const t = now();
  const row = { id: crypto.randomUUID(), project_slug: project.slug, updated_by: actor, updated_at: t };
  for (const c of RESTORE_COLS) if (snap[c] !== undefined) row[c] = snap[c];
  Object.assign(row, { kind, seq }); // the reference wins over the snapshot
  if (!row.title || !row.created_by || !row.created_at) throw new HttpError(409, "snapshot_incomplete", key);
  const cols = Object.keys(row);
  await batchSharing(db, [
    db.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map((c) => row[c])),
    eventStmt(db, project.slug, key, "restored", actor,
      { title: row.title, status: row.status, ...(row.waiting_on ? { waiting_on: row.waiting_on } : {}) }, t),
    touchProject(db, project.slug, t),
  ]);
  return getItemByRef(db, project.slug, key);
}

// Idea accepted -> becomes a task/to-do with a NEW ref; the idea is closed and points to it.
export async function convertItem(db, project, item, input, actor) {
  if (item.converted_to) throw new HttpError(409, "already_converted", item.converted_to);
  const session = normSession(input.session); // checked before the claim below, which a failure would leave behind
  // Claim the source item atomically so concurrent or double-clicked conversions cannot both succeed.
  const claim = await db
    .prepare("UPDATE items SET converted_to = 'pending' WHERE id = ? AND converted_to IS NULL")
    .bind(item.id)
    .run();
  if (!claim.meta.changes) throw new HttpError(409, "already_converted");
  let target;
  try {
    target = await createItem(db, project, conversionInput(item, input), actor, { sizedBy: item.sized_by, inherit: item });
  } catch (err) {
    await db
      .prepare("UPDATE items SET converted_to = NULL WHERE id = ? AND converted_to = 'pending'")
      .bind(item.id)
      .run();
    throw err;
  }
  const t = now();
  // The idea was last worked on where it was accepted (D35).
  const sessionSql = session && (await sessionColumns(db)) ? ", last_session = ?, first_session = COALESCE(first_session, ?)" : "";
  await db.batch([
    db
      .prepare(
        `UPDATE items SET status = 'done', converted_to = ?, closed_at = ?, updated_at = ?, updated_by = ?${sessionSql} WHERE id = ?`,
      )
      .bind(target.ref, t, t, actor, ...(sessionSql ? [session, session] : []), item.id),
    eventStmt(db, project.slug, item.ref, "converted", actor, { to: target.ref, ...(session ? { session } : {}) }, t),
  ]);
  return { from: await getItemByRef(db, project.slug, item.ref), to: target };
}

function conversionInput(item, input) {
  return {
    kind: input.kind,
    title: input.title ?? item.title,
    short: input.short ?? item.short,
    body: input.body ?? item.body,
    source: item.source,
    waiting_on: item.waiting_on,
    also_in: item.also_in ?? null,
    session: input.session,
    // Effort and benefit travel to an action; a decision inherits its benefit instead.
    ...(SIZED_KINDS.includes(String(input.kind || "").toUpperCase()) ? { effort: item.effort, benefit: item.benefit } : {}),
    ...("owner" in input ? { owner: input.owner } : {}),
  };
}

/* --------------------------------------------------------------- output */

function shortLabel(item) {
  if (item.short) return item.short;
  const words = item.title.split(/\s+/);
  return words.slice(0, 3).join(" ") + (words.length > 3 ? " …" : "");
}

// True when a body holds more than its checklist – shown as 📝 in the text lists, so an AI knows to fetch the details.
export function hasDetails(body) {
  return !!body && body.split("\n").some((l) => l.trim() && !CHECK_LINE_RE.test(l));
}

// Checklist lines of a body: [{ line, done, text }] (line = index in body.split("\n")).
export function parseChecks(body) {
  if (!body) return [];
  const out = [];
  body.split("\n").forEach((l, line) => {
    const m = l.match(CHECK_LINE_RE);
    if (m) out.push({ line, done: m[2] !== " ", text: m[4].trim() });
  });
  return out;
}

// "2/4" for a task with a checklist, otherwise null.
export function checkProgress(item) {
  if (!item || item.kind !== CHECK_KIND) return null;
  const checks = parseChecks(item.body);
  return checks.length ? `${checks.filter((c) => c.done).length}/${checks.length}` : null;
}

function assertCheckLimit(kind, body) {
  if (kind === CHECK_KIND && parseChecks(body).length > MAX_CHECKS) {
    throw new HttpError(400, "too_many_checks", `max ${MAX_CHECKS} sub-items; split independent steps into own items`);
  }
}

// check / uncheck selectors: 2, "2", "2,3", [2, 3] or (part of) the text of one sub-item.
function checkTargets(checks, sel, field) {
  if (sel === undefined || sel === null || sel === "") return [];
  const list = Array.isArray(sel) ? sel : /^\s*\d+(\s*,\s*\d+)*\s*$/.test(String(sel)) ? String(sel).split(",") : [sel];
  return list.map((s) => {
    const str = String(s).trim();
    if (/^\d+$/.test(str)) {
      const n = Number(str);
      if (n < 1 || n > checks.length) throw new HttpError(400, "check_not_found", `${field}: ${str} (1-${checks.length})`);
      return checks[n - 1];
    }
    const needle = str.toLowerCase();
    if (!needle) throw new HttpError(400, "invalid_field", field);
    for (const test of [(t) => t === needle, (t) => t.startsWith(needle), (t) => t.includes(needle)]) {
      const hits = checks.filter((c) => test(c.text.toLowerCase()));
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) throw new HttpError(400, "check_ambiguous", `${field}: ${str}`);
    }
    throw new HttpError(400, "check_not_found", `${field}: ${str}`);
  });
}

// Applies check/uncheck to a body. Returns the new body and which sub-items actually changed.
function applyChecks(item, input) {
  if (item.kind !== CHECK_KIND) throw new HttpError(400, "checks_only_for_tasks", item.ref);
  if ("body" in input) throw new HttpError(400, "invalid_field", "check/uncheck cannot be combined with body");
  const checks = parseChecks(item.body);
  if (!checks.length) throw new HttpError(400, "no_checks", `${item.ref} has no "- [ ]" lines in its body`);
  const on = checkTargets(checks, input.check, "check");
  const off = checkTargets(checks, input.uncheck, "uncheck");
  if (on.some((c) => off.includes(c))) throw new HttpError(400, "invalid_field", "same sub-item in check and uncheck");
  const lines = item.body.split("\n");
  const checked = [], unchecked = [];
  for (const [list, done, log] of [[on, true, checked], [off, false, unchecked]]) {
    for (const c of new Set(list)) {
      if (c.done === done) continue;
      lines[c.line] = lines[c.line].replace(CHECK_LINE_RE, (_, a, _x, b, t) => `${a}${done ? "x" : " "}${b}${t}`);
      log.push(c.text);
    }
  }
  return { body: lines.join("\n"), checked, unchecked };
}

/**
 * Builds the one-line summary used at the end of chat answers, e.g.
 * "👤 D1 ▶A3 Lizenz · 🤖 A3 Konzept (+2) · 💡 I1 MCP · ⚠️ W1 Auth · neu: A3 · erledigt: A1"
 * Actionable kinds are grouped by owner (you first), others by kind.
 */
// key ("slug:A4") -> keys of OPEN items that wait for it (the reverse of waiting_on; nothing extra is stored), plus
// ext_next: waiting items from outside the list (projectItems).
export function successorMap(items) {
  const map = new Map();
  const add = (k, w) => {
    if (!map.has(k)) map.set(k, []);
    if (!map.get(k).includes(w)) map.get(k).push(w);
  };
  for (const it of items) {
    if (OPEN.includes(it.status)) for (const k of waitKeys(it)) add(k, itemKey(it));
  }
  for (const it of items) for (const w of it.ext_next || []) add(itemKey(it), w);
  return map;
}

export function buildFooter(
  items,
  kinds,
  {
    max = 8, since = null, deltaOnly = false, layout = FOOTER_LAYOUT_DEFAULT, lang = "de", labels = FOOTER_OWNER_LABELS,
    viewSlug = items[0]?.project_slug, codes = null, hide = null, changed = null,
  } = {},
) {
  // since: an ISO time (compared with created_at / closed_at) – or, when footerFor got a version number, `changed`:
  // the keys created or closed by events after that version (sinceVersion, changedSince).
  // hide: keys shown in another block of a multi-project footer – left out here, but still counted for ⏸ and ▶.
  // References are relative to the project in view: "A2" for its own items, "IMM:A2" for items of other projects (D26).
  const lbl = (key) => keyLabel(key, viewSlug, codes);
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const groups = new Map();
  for (const it of items) {
    if (!OPEN.includes(it.status) || hide?.has(itemKey(it))) continue;
    const k = kindBy.get(it.kind);
    let key, label, weight;
    if (!k || k.actionable) {
      const owner = it.owner || "user";
      key = `o:${owner}`;
      label = groupMark(labels[owner] || FOOTER_OWNER_LABELS[owner] || owner);
      weight = owner === "user" ? 0 : owner === "ai" ? 1 : 2;
    } else {
      key = `k:${k.code}`;
      label = k.footer_label || groupMark(k.name);
      weight = 10 + k.sort_order;
    }
    if (!groups.has(key)) groups.set(key, { label, weight, items: [] });
    groups.get(key).items.push(it);
  }
  const ordered = [...groups.values()].sort((a, b) => a.weight - b.weight);
  // Round-robin so every group gets at least one visible entry before any gets a second.
  const shown = ordered.map(() => 0);
  let budget = max;
  let progress = true;
  while (budget > 0 && progress) {
    progress = false;
    ordered.forEach((g, i) => {
      if (budget > 0 && shown[i] < g.items.length) {
        shown[i]++;
        budget--;
        progress = true;
      }
    });
  }
  // Dependencies: the blocking item carries "▶A2,A4" (order is visible at a glance). The waiting item only
  // keeps "⏸D1" when its blocker is open or unknown but not itself shown in the line; resolved blockers show nothing.
  const succ = successorMap(items);
  const status = new Map(items.map((i) => [itemKey(i), i.status]));
  const shownKeys = new Set(ordered.flatMap((g, i) => g.items.slice(0, shown[i]).map(itemKey)));
  // Blockers outside the loaded items: with projectItems' ext_open only the open ones; without it, unknown keeps the marker.
  const stillOpen = (it, k) => (status.has(k) ? OPEN.includes(status.get(k)) : !Array.isArray(it.ext_open) || it.ext_open.includes(k));
  const parts = ordered
    .map((g, i) => {
      if (!shown[i]) return null;
      const entries = g.items.slice(0, shown[i]).map((it) => {
        const next = succ.get(itemKey(it)) || [];
        const waits = waitKeys(it).filter((k) => stillOpen(it, k) && !shownKeys.has(k));
        const marks = [next.length ? `▶${next.map(lbl).join(",")}` : "", waits.length ? `⏸${waits.map(lbl).join(",")}` : ""].filter(Boolean);
        const progress = checkProgress(it);
        return `${lbl(itemKey(it))}${marks.length ? " " + marks.join(" ") : ""} ${shortLabel(it)}${progress ? " " + progress : ""}`;
      });
      const hidden = g.items.length - shown[i];
      return `${g.label} ${entries.join(" · ")}${hidden ? ` (+${hidden})` : ""}`;
    })
    .filter(Boolean);
  const delta = [];
  if (since || changed) {
    const own = items.filter((i) => !hide?.has(itemKey(i)));
    const isNew = changed ? (i) => changed.created.has(itemKey(i)) : (i) => i.created_at >= since;
    // created after the version and done by now counts too (an item added as done has no "done" event)
    const isClosed = changed
      ? (i) => changed.closed.has(itemKey(i)) || changed.created.has(itemKey(i))
      : (i) => i.closed_at && i.closed_at >= since;
    const created = own.filter(isNew).map((i) => lbl(itemKey(i)));
    const done = own.filter((i) => i.status === "done" && isClosed(i)).map((i) => lbl(itemKey(i)));
    const dl = FOOTER_DELTA_LABELS[lang] || FOOTER_DELTA_LABELS.de;
    if (created.length) delta.push(`${dl.created}: ${created.join(", ")}`);
    if (done.length) delta.push(`${dl.done}: ${done.join(", ")}`);
  }
  // deltaOnly = the short line "neu: … · erledigt: …" (empty when nothing changed), always a single line.
  if (deltaOnly) return delta.join(" · ");
  // multi: one line per group, then the "neu/erledigt" line; single: everything in one line.
  if (layout === "multi") return [...parts, ...(delta.length ? [delta.join(" · ")] : [])].join("\n");
  return [...parts, ...delta].join(" · ");
}

export function normLang(v) {
  return String(v ?? "").toLowerCase().startsWith("en") ? "en" : "de";
}

// A `lang` given in a request, or null when there is none: then the instance setting `language` applies.
export function optLang(v) {
  return v === undefined || v === null || String(v).trim() === "" ? null : normLang(v);
}

// The language for API text answers: `lang` in the query, otherwise the instance setting.
async function langFor(db, q) {
  return optLang(q.get("lang")) || (await getSettings(db)).language;
}

// Language for pages a browser opens without the web app (OAuth consent page, app manifest), from Accept-Language –
// the same rule as the web app: the first German (de, gsw) or English entry by preference decides, anything else is English.
export function preferredLang(header) {
  const tags = String(header || "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const qp = params.map((x) => x.trim()).find((x) => x.startsWith("q="));
      const qv = qp ? Number(qp.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase().split(/[-_]/)[0], q: Number.isFinite(qv) ? qv : 0, i };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of tags) {
    if (tag === "de" || tag === "gsw") return "de";
    if (tag === "en") return "en";
  }
  return "en";
}

// "single" | "multi", or null when not given (or unknown): then the web app setting applies.
export function normLayout(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["single", "line", "einzeilig"].includes(s)) return "single";
  if (["multi", "lines", "mehrzeilig"].includes(s)) return "multi";
  return null;
}

// Layout and group markers for buildFooter: a layout given in the request wins, otherwise the setting.
export function footerStyle(settings, layout = null) {
  return {
    layout: layout || settings.footer_layout,
    labels: { user: settings.footer_label_user, ai: settings.footer_label_ai },
  };
}

/* -------------------------------------------------------------- settings */

const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS);
const isMissingTable = (err) => /no such table/i.test(String(err?.message ?? err));

// { settings, defaults, stored, available }. `stored` lists the keys set explicitly (the web app shows "Auto" for a
// language that was never chosen). `available` is false while migration 0006 is not applied yet – everything
// keeps working with the built-in defaults, only saving is not possible.
export async function readSettings(db) {
  const settings = { ...SETTINGS_DEFAULTS };
  let rows = [];
  let available = true;
  try {
    ({ results: rows } = await db.prepare("SELECT key, value FROM settings").all());
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    available = false;
  }
  const stored = [];
  for (const r of rows) {
    if (!SETTING_KEYS.includes(r.key)) continue;
    settings[r.key] = r.value;
    stored.push(r.key);
  }
  return { settings, defaults: SETTINGS_DEFAULTS, stored, available };
}

export async function getSettings(db) {
  return (await readSettings(db)).settings;
}

// null = back to the built-in default (the row is deleted).
function normSetting(key, v) {
  if (v === null || v === undefined || v === "") return null;
  if (key === "footer_layout") {
    const layout = normLayout(v);
    if (!layout) throw new HttpError(400, "invalid_field", "footer_layout (multi|single)");
    return layout;
  }
  if (key === "language") {
    const lang = String(v).trim().toLowerCase();
    if (!LANGS.includes(lang)) throw new HttpError(400, "invalid_field", `language (${LANGS.join("|")})`);
    return lang;
  }
  // Group markers ("👤", "Du", …): short and on one line; the footer adds a ":" after text markers itself (groupMark).
  const s = text(v, key, 16)?.replace(/:+$/, "").trim();
  if (!s) return null;
  if (/[\r\n\t·]/.test(s)) throw new HttpError(400, "invalid_field", `${key} (one line, without "·")`);
  return s;
}

async function updateSettings(db, input, actor) {
  const unknown = Object.keys(input).filter((k) => !SETTING_KEYS.includes(k));
  if (unknown.length) throw new HttpError(400, "unknown_setting", unknown.join(", "));
  const t = now();
  const stmts = SETTING_KEYS.filter((key) => key in input).map((key) => {
    const value = normSetting(key, input[key]);
    return value === null
      ? db.prepare("DELETE FROM settings WHERE key = ?").bind(key)
      : db
          .prepare(
            `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          )
          .bind(key, value, t, actor);
  });
  if (!stmts.length) return;
  try {
    await db.batch(stmts);
  } catch (err) {
    if (isMissingTable(err)) throw new HttpError(503, "settings_unavailable", "apply migration 0006 first (npm run db:migrate)");
    throw err;
  }
}

/**
 * Footer for several projects (decided 2026-11-04, D4): one line per project, prefixed with its code
 * (or slug), e.g. "CT ▸ 👤 D1 … · 🤖 A2 …". Projects without anything to show are left out,
 * so with `deltaOnly` only projects with changes appear.
 */
export function buildMultiFooter(entries, kinds, opts = {}) {
  return entries
    .map(({ project, items, hide = null }) => {
      const line = buildFooter(items, kinds, { ...opts, viewSlug: project.slug, hide });
      if (!line) return null;
      // Multi layout: the project label gets a line of its own (also for a single group, so blocks look alike);
      // single layout and the short "neu/erledigt" line carry it as a prefix.
      const label = project.code || project.slug;
      return opts.layout === "multi" && !opts.deltaOnly ? `${label} ▸\n${line}` : `${label} ▸ ${line}`;
    })
    .filter(Boolean)
    .join("\n");
}

// `since` for the footer: a version number ("Stand" from cotrack_status, i.e. an event id – digits only) or an ISO time.
// Returns the number, or null for an ISO time / nothing. The version is exact; an ISO time depends on the AI knowing the
// clock, which it often does not (then it falls back to the start of the day and the short line shows too much).
function sinceVersion(since) {
  const s = String(since ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

// Keys ("slug:REF") of the given items created or closed (done, converted) by events after `version`.
async function changedSince(db, version, items) {
  const changed = { created: new Set(), closed: new Set() };
  const slugs = [...new Set(items.map((i) => i.project_slug))];
  if (!slugs.length) return changed;
  const { results } = await db
    .prepare(
      `SELECT project_slug, item_ref, action FROM events
       WHERE id > ? AND item_ref IS NOT NULL AND action IN ('created', 'done', 'converted')
         AND project_slug IN (SELECT value FROM json_each(?))`,
    )
    .bind(version, JSON.stringify(slugs))
    .all();
  for (const e of results) (e.action === "created" ? changed.created : changed.closed).add(`${e.project_slug}:${e.item_ref}`);
  return changed;
}

// Footer for one or more projects given by slug or code; a single project has no project label.
// since: a version number (see sinceVersion) or an ISO time.
// layout: "multi" | "single" from the request, or null for the web app setting.
// lang: "de" | "en" from the request, or null for the instance setting `language`.
export async function footerFor(db, keys, { since = null, delta = false, max = 8, layout = null, lang = null } = {}) {
  const projects = [];
  for (const key of keys) {
    const p = await getProject(db, key);
    if (!projects.some((x) => x.slug === p.slug)) projects.push(p);
  }
  const [kinds, settings, codes, ...lists] = await Promise.all([
    listKinds(db, true),
    getSettings(db),
    projectCodes(db),
    ...projects.map((p) => projectItems(db, p, { status: "all" })),
  ]);
  const version = sinceVersion(since);
  const changed = version === null ? null : await changedSince(db, version, lists.flat());
  const opts = {
    since: version === null ? since : null, changed, deltaOnly: delta, max, lang: lang || settings.language, codes, ...footerStyle(settings, layout),
  };
  if (projects.length === 1) return buildFooter(lists[0], kinds, { ...opts, viewSlug: projects[0].slug });
  // An item shown in several of the requested projects appears once (D26): in its home project's block, or – if that
  // project is not requested – in the first requested block that shows it. Hidden items still count for ⏸ and ▶.
  const asked = new Set(projects.map((p) => p.slug));
  const placed = new Set();
  const entries = projects.map((project, i) => {
    const hide = new Set();
    for (const it of lists[i]) {
      if (it.project_slug === project.slug) continue;
      const k = itemKey(it);
      if (asked.has(it.project_slug) || placed.has(k)) hide.add(k);
      else placed.add(k);
    }
    return { project, items: lists[i], hide };
  });
  return buildMultiFooter(entries, kinds, opts);
}

/**
 * Compact one-line-per-item listing for AI assistants (few tokens), e.g.
 * "A2 MCP-Server bauen ⏸D1 [in Arbeit] @Maria" or "D1 Lizenz wählen 📝 ▶A2,A4" (▶ = items waiting for it).
 * Bodies are left out; 📝 marks an item with a description (beyond its checklist) – fetch the item for details.
 */
export function itemsAsText(items, kinds, { withProject = false, lang = "de", viewSlug = items[0]?.project_slug, codes = null } = {}) {
  const T = TEXT[lang] || TEXT.de;
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const succ = successorMap(items);
  const lines = items.map((it) => {
    const k = kindBy.get(it.kind);
    // Cross-project list: references relative to each item's own project; otherwise to the project in view (D26).
    const lbl = (key) => keyLabel(key, withProject ? it.project_slug : viewSlug, codes);
    const parts = [withProject ? `${it.project_slug}/${it.ref}` : lbl(itemKey(it)), it.title];
    if (hasDetails(it.body)) parts.push("📝");
    const progress = checkProgress(it);
    if (progress) parts.push(`☑${progress}`);
    const size = sizeText(it, lang);
    if (size) parts.push(size);
    if (it.waiting_on) parts.push(`⏸${waitKeys(it).map(lbl).join(",")}`);
    const next = succ.get(itemKey(it));
    if (next && !withProject) parts.push(`▶${next.map(lbl).join(",")}`);
    // ⇄ = also shown in these projects (on the item's home side; elsewhere its qualified reference says it all)
    if (it.also_in && (withProject || it.project_slug === viewSlug)) {
      parts.push(`⇄${refList(it.also_in).map((s) => codes?.get(s) || s).join(",")}`);
    }
    if (it.status !== "open") parts.push(`[${T.statuses[it.status]}]`);
    if (it.owner && (!k || it.owner !== k.default_owner)) parts.push(`@${T.owners[it.owner] || it.owner}`);
    if (it.converted_to) parts.push(`→${it.converted_to}`);
    if (it.due) parts.push(`📅${it.due}`);
    return parts.join(" ");
  });
  return lines.length ? lines.join("\n") + "\n" : T.none + "\n";
}

// "⏱S·★hoch" – a trailing "?" marks an estimate (set by the AI, not yet confirmed by the human).
export function sizeText(it, lang = "de") {
  if (!it.effort && !it.benefit) return "";
  const T = TEXT[lang] || TEXT.de;
  const parts = [it.effort ? `⏱${it.effort}` : "", it.benefit ? `★${T.benefits[it.benefit] || it.benefit}` : ""].filter(Boolean);
  return parts.join("·") + (it.sized_by === "user" ? "" : "?");
}

export function buildStatusMarkdown(project, items, kinds, origin, lang = "de", codes = null) {
  const T = TEXT[lang] || TEXT.de;
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const open = items.filter((i) => OPEN.includes(i.status));
  const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const lines = [
    T.statusHeading,
    "",
    `_${T.statusAsOf}: ${now().slice(0, 16).replace("T", " ")} UTC · Live: ${origin}/#${project.slug}_`,
    "",
  ];
  if (!open.length) {
    lines.push(T.statusEmpty);
    return lines.join("\n") + "\n";
  }
  lines.push(`| ${T.statusColumns.join(" | ")} |`, "|---|---|---|---|---|---|");
  for (const it of open) {
    const k = kindBy.get(it.kind);
    const status = T.statuses[it.status] + (it.waiting_on ? ` ⏸${waitKeys(it).map((k) => keyLabel(k, project.slug, codes)).join(" ⏸")}` : "");
    lines.push(
      `| ${it.ref} | ${cell(it.title)} | ${cell(k ? kindName(k, lang) : it.kind)} | ${cell(T.owners[it.owner] || it.owner || "")} | ${cell(it.source)} | ${status} |`,
    );
  }
  return lines.join("\n") + "\n";
}

/* -------------------------------------------------------------- helpers */

function eventStmt(db, slug, ref, action, actor, data, at) {
  return db
    .prepare("INSERT INTO events (project_slug, item_ref, action, actor, data, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(slug, ref, action, actor, data ? JSON.stringify(data) : null, at);
}

function touchProject(db, slug, t) {
  return db.prepare("UPDATE projects SET updated_at = ? WHERE slug = ?").bind(t, slug);
}

function now() {
  return new Date().toISOString();
}

function text(v, field, max, { required = false } = {}) {
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, "missing_field", field);
    return null;
  }
  if (typeof v !== "string") throw new HttpError(400, "invalid_field", field);
  const s = v.trim();
  if (!s) {
    if (required) throw new HttpError(400, "missing_field", field);
    return null;
  }
  if (s.length > max) throw new HttpError(400, "field_too_long", `${field} (max ${max})`);
  return s;
}

function normOwner(v) {
  const s = text(v, "owner", 40);
  if (!s) return null;
  return OWNER_ALIASES[s.toLowerCase()] || s;
}

function normStatus(v) {
  const s = String(v || "").toLowerCase();
  if (!STATUSES.includes(s)) throw new HttpError(400, "invalid_field", `status (${STATUSES.join("|")})`);
  return s;
}

// waiting_on: "A2" (same project) or, across projects, "IMM:A2" / "immobilien:A2" – stored as "immobilien:A2"
// (the slug never changes; codes are only for reading). A qualifier naming the item's own project is dropped.
async function normWaiting(db, v, ownSlug) {
  if (v === undefined || v === null || v === "") return null;
  const list = (Array.isArray(v) ? v : String(v).split(/[\s,;]+/))
    .map((r) => String(r).trim().replace(/^⏸/, ""))
    .filter(Boolean);
  const out = [];
  for (const raw of list) {
    const { qualifier, ref } = splitRef(raw);
    const r = ref.toUpperCase();
    if (!REF_RE.test(r)) throw new HttpError(400, "invalid_field", `waiting_on (${raw})`);
    const slug = qualifier ? await projectSlugFor(db, qualifier, "waiting_on") : ownSlug;
    out.push(slug === ownSlug ? r : `${slug}:${r}`);
  }
  return out.length ? [...new Set(out)].join(",") : null;
}

// also_in: further projects that show the item (decision D26), as slugs or codes; its own project is left out.
const MAX_ALSO_IN = 5;
async function normAlsoIn(db, v, ownSlug) {
  if (v === undefined || v === null || v === "") return null;
  const list = (Array.isArray(v) ? v : String(v).split(/[\s,;]+/)).map((k) => String(k).trim()).filter(Boolean);
  const out = [];
  for (const k of list) {
    const slug = await projectSlugFor(db, k, "also_in");
    if (slug !== ownSlug && !out.includes(slug)) out.push(slug);
  }
  if (out.length > MAX_ALSO_IN) throw new HttpError(400, "invalid_field", `also_in (at most ${MAX_ALSO_IN} projects)`);
  return out.length ? out.join(",") : null;
}

async function projectSlugFor(db, key, field) {
  try {
    return (await getProject(db, key)).slug;
  } catch (err) {
    if (isHttpError(err) && err.status === 404) throw new HttpError(400, "invalid_field", `${field} (${key}: unknown project)`);
    throw err;
  }
}

function normDate(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v)) throw new HttpError(400, "invalid_field", "due (YYYY-MM-DD)");
  return v;
}

// The session a change comes from (decision D35): the address of the chat or coding session, https only (the web app links it).
const SESSION_MAX = 500;
function normSession(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new HttpError(400, "invalid_field", "session");
  const s = v.trim();
  if (!s) return null;
  let ok = s.length <= SESSION_MAX && /^https:\/\/[^\s"<>]+$/i.test(s);
  try { ok = ok && new URL(s).protocol === "https:"; } catch { ok = false; }
  if (!ok) throw new HttpError(400, "invalid_field", `session (an https address, max ${SESSION_MAX})`);
  return s;
}

// The session columns need migration 0011. AIs send a session with nearly every change, so without the migration it is
// left out of the item (the event still records it) instead of failing the write. Once there, remembered per isolate.
let sessionColumnsReady = false;
async function sessionColumns(db) {
  if (!sessionColumnsReady) {
    sessionColumnsReady = !!(await db.prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = 'last_session'").first());
  }
  return sessionColumnsReady;
}

function normEffort(v) {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (!EFFORTS.includes(s)) throw new HttpError(400, "invalid_field", `effort (${EFFORTS.join("|")})`);
  return s;
}

function normBenefit(v) {
  if (v === undefined || v === null || v === "") return null;
  const s = BENEFIT_ALIASES[String(v).trim().toLowerCase()];
  if (!s) throw new HttpError(400, "invalid_field", `benefit (${BENEFITS.join("|")})`);
  return s;
}

// Who stands behind effort and benefit: the actor, or the human when the AI passes `confirmed: true` because the user named or
// confirmed the values in the conversation (the change log still shows the AI as the one who wrote it).
// The user token may also name who stood behind the values (undo in the web app puts back an AI estimate as an estimate).
const sizer = (input, actor) =>
  actor === "user" && ["user", "ai"].includes(input.sized_by) ? input.sized_by : input.confirmed === true ? "user" : actor;

function assertSizable(kind) {
  if (!SIZED_KINDS.includes(kind)) {
    throw new HttpError(400, "invalid_field", `effort/benefit only for ${SIZED_KINDS.join(" and ")} (decisions inherit the benefit of what waits for them)`);
  }
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

async function readJson(req) {
  const body = await req.text();
  if (body.length > 65536) throw new HttpError(413, "payload_too_large");
  if (!body) return {};
  let v;
  try {
    v = JSON.parse(body);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "invalid_json");
  return v;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function plain(body, type = "text/plain; charset=utf-8") {
  return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
}

function page(html) {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      // A private instance: keep the sign-in page out of search engines.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
