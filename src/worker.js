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
const OWNER_LABELS = { user: "Du", ai: "KI" };
// Footer group labels.
// Language-independent since v2.6: 👤 = yours, 🤖 = the AI's.
const FOOTER_OWNER_LABELS = { user: "👤", ai: "🤖" };
// Footer wording per language (`lang=de|en`, default de): only the "new / done" short line.
const FOOTER_DELTA_LABELS = { de: { created: "neu", done: "erledigt" }, en: { created: "new", done: "done" } };
// Footer layout (decided 2026-11-06, trial phase): "multi" = one line per group (👤 / 🤖 / 💡 / ⚠️),
// "single" = everything in one line. Built-in default only: since v2.7 the human picks the default in the
// web app (setting `footer_layout`), and a `layout` parameter in a request wins over both.
const FOOTER_LAYOUT_DEFAULT = "multi";
// Instance settings (table `settings`, migration 0006; web app ☰ → Chat-Fußzeile → Anpassen). A missing row – or a database
// without the table – means these built-in defaults.
const SETTINGS_DEFAULTS = Object.freeze({
  footer_layout: FOOTER_LAYOUT_DEFAULT,
  footer_label_user: FOOTER_OWNER_LABELS.user,
  footer_label_ai: FOOTER_OWNER_LABELS.ai,
});
const OWNER_ALIASES = { user: "user", du: "user", me: "user", ich: "user", human: "user", ai: "ai", ki: "ai" };
// Sub-items (methodology v2.8, decided in D16): a checklist "- [ ] step" / "- [x] step" in the body of a task (A).
// No extra table and no references of their own; the server only counts them ("2/4") and can tick one (check/uncheck).
const CHECK_KIND = "A";
const MAX_CHECKS = 8; // hard limit; the methodology asks for at most 5
const CHECK_LINE_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*\S)\s*$/;
const STATUS_LABELS = { open: "offen", doing: "in Arbeit", blocked: "blockiert", done: "erledigt", dropped: "verworfen" };

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
        const pwa = pwaResponse(url.pathname);
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
        if (!actor) return json({ error: "unauthorized", hint: "Send 'Authorization: Bearer <token>'" }, 401);
        return await route(request, env.DB, url, actor);
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, detail: err.detail }, err.status);
      console.error(err);
      return json({ error: "internal_error" }, 500);
    }
  },
};

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

async function route(req, db, url, actor) {
  const seg = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method;
  const q = url.searchParams;

  if (seg.length === 1 && seg[0] === "me" && method === "GET") return json({ actor });

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
      lang: normLang(q.get("lang")),
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
    if (q.get("format") === "text") return plain(itemsAsText(items, await listKinds(db, true), { withProject: true }));
    return json({ items });
  }

  if (seg[0] === "projects") {
    if (seg.length === 1) {
      if (method === "GET") return json({ projects: await listProjects(db, q.get("archived") === "1") });
      if (method === "POST") return json({ project: await createProject(db, await readJson(req), actor) }, 201);
    }
    const project = await getProject(db, seg[1]);
    if (seg.length === 2) {
      if (method === "GET") return json({ project });
      if (method === "PATCH") return json({ project: await updateProject(db, project, await readJson(req), actor) });
    }
    const sub = seg[2];
    if (sub === "items") {
      if (seg.length === 3) {
        if (method === "GET") {
          const items = await listItems(db, { ...filtersFrom(q), project: project.slug });
          if (q.get("format") === "text") return plain(itemsAsText(items, await listKinds(db, true)));
          return json({ items });
        }
        if (method === "POST") return json({ item: await createItem(db, project, await readJson(req), actor) }, 201);
      }
      const item = await getItemByRef(db, project.slug, seg[3]);
      if (seg.length === 4) {
        if (method === "GET") return json({ item });
        if (method === "PATCH") return json({ item: await updateItem(db, project, item, await readJson(req), actor) });
        if (method === "DELETE") return json({ deleted: await deleteItem(db, project, item, actor) });
      }
      if (seg.length === 5 && seg[4] === "convert" && method === "POST") {
        return json(await convertItem(db, project, item, await readJson(req), actor), 201);
      }
    }
    if (seg.length === 3 && method === "GET") {
      if (sub === "version") {
        // global: newest event of any project, so the web app notices new or archived projects too.
        const row = await db
          .prepare(
            "SELECT COALESCE((SELECT MAX(id) FROM events WHERE project_slug = ?), 0) AS v, COALESCE((SELECT MAX(id) FROM events), 0) AS g",
          )
          .bind(project.slug)
          .first();
        return json({ version: row.v, global: row.g });
      }
      if (sub === "events") return json({ events: await listEvents(db, { project: project.slug, ...eventRange(q) }) });
      if (sub === "footer") {
        const textLine = await footerFor(db, [project.slug], {
          max: clampInt(q.get("max"), 1, 30, 8),
          since: q.get("since") || null,
          delta: q.get("delta") === "1",
          layout: normLayout(q.get("layout")),
          lang: normLang(q.get("lang")),
        });
        if (q.get("format") === "text") return plain(textLine);
        return json({ footer: textLine });
      }
      if (sub === "status.md") {
        const [items, kinds] = await Promise.all([
          listItems(db, { project: project.slug, status: "all" }),
          listKinds(db, true),
        ]);
        return plain(buildStatusMarkdown(project, items, kinds, url.origin), "text/markdown; charset=utf-8");
      }
    }
  }
  throw new HttpError(404, "not_found");
}

/* --------------------------------------------------------------- events */

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
      const blocker = byKey.get(key(i.project_slug, r));
      if (!blocker) continue;
      const from = waitStart.get(key(i.project_slug, i.ref) + ">" + r) || i.created_at;
      const until = [blocker.closed_at, i.closed_at, nowIso].filter(Boolean).sort()[0];
      const still = isOpen(i) && isOpen(blocker);
      waits.push({ project_slug: i.project_slug, ref: i.ref, kind: i.kind, on: r, on_kind: blocker.kind, still,
        days: Math.max(0, (Date.parse(until) - Date.parse(from)) / DAY_MS), freed: still ? null : blocker.closed_at });
    }
  }
  const recentCut = Date.parse(nowIso) - 14 * DAY_MS;
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

export async function listItems(db, f) {
  const where = [];
  const args = [];
  if (f.project) {
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
    where.push("(i.title LIKE ? OR i.short LIKE ? OR i.body LIKE ?)");
    const like = `%${f.q}%`;
    args.push(like, like, like);
  }
  const sql = `${ITEM_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY COALESCE(k.sort_order, 999), i.kind, i.project_slug, i.seq LIMIT 2000`;
  const { results } = await db.prepare(sql).bind(...args).all();
  return results;
}

export async function successorsOf(db, slug, ref) {
  const { results } = await db
    .prepare(
      `SELECT kind || seq AS ref FROM items
       WHERE project_slug = ? AND status IN ('open','doing','blocked') AND ',' || waiting_on || ',' LIKE ?
       ORDER BY kind, seq`,
    )
    .bind(slug, `%,${ref},%`)
    .all();
  return results.map((r) => r.ref);
}

function parseRef(ref) {
  const m = String(ref || "").toUpperCase().match(REF_RE);
  if (!m) throw new HttpError(400, "invalid_ref", ref);
  return { kind: m[1], seq: Number(m[2]) };
}

export async function getItemByRef(db, slug, ref) {
  const { qualifier, ref: plainRef } = splitRef(ref);
  if (qualifier && (await getProject(db, qualifier)).slug !== slug) {
    throw new HttpError(400, "ref_project_mismatch", `${ref} gehört nicht zu ${slug}`);
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

export async function createItem(db, project, input, actor) {
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
    waiting_on: normRefs(input.waiting_on),
    source: text(input.source, "source", 1000),
    due: normDate(input.due),
    created_by: actor,
    updated_by: actor,
    created_at: t,
    updated_at: t,
  };
  row.closed_at = CLOSED.includes(row.status) ? t : null;
  assertCheckLimit(kind.code, row.body);

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
      .bind(project.slug, actor, JSON.stringify({ title: row.title, owner: row.owner, status: row.status }), t, row.id),
  );
  stmts.push(touchProject(db, project.slug, t));
  await db.batch(stmts);
  return db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(row.id).first();
}

export async function updateItem(db, project, item, input, actor) {
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
    if ("waiting_on" in input) set("waiting_on", normRefs(input.waiting_on));
    if ("source" in input) set("source", text(input.source, "source", 1000));
    if ("due" in input) set("due", normDate(input.due));
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
      if (cols.length === 1) action = "checked";
    }

    const update = db
      .prepare(
        `UPDATE items SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?` +
          (ticks ? " AND body IS ?" : ""),
      )
      .bind(...cols.map((c) => changes[c]), t, actor, item.id, ...(ticks ? [item.body] : []));
    // The event is only written if the update hit the row (changes() refers to the statement before it).
    const event = db
      .prepare(
        "INSERT INTO events (project_slug, item_ref, action, actor, data, at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
      )
      .bind(project.slug, item.ref, action, actor, JSON.stringify(data), t);
    const [res] = await db.batch([update, event, touchProject(db, project.slug, t)]);
    const fresh = await db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(item.id).first();
    if (res.meta.changes || !ticks) return fresh;
    if (attempt >= 2 || !fresh || layout(fresh) !== firstLayout) {
      throw new HttpError(409, "conflict", "the checklist changed meanwhile, read it again and retry");
    }
    item = fresh;
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

// Idea accepted -> becomes a task/to-do with a NEW ref; the idea is closed and points to it.
export async function convertItem(db, project, item, input, actor) {
  if (item.converted_to) throw new HttpError(409, "already_converted", item.converted_to);
  // Claim the source item atomically so concurrent or double-clicked conversions cannot both succeed.
  const claim = await db
    .prepare("UPDATE items SET converted_to = 'pending' WHERE id = ? AND converted_to IS NULL")
    .bind(item.id)
    .run();
  if (!claim.meta.changes) throw new HttpError(409, "already_converted");
  let target;
  try {
    target = await createItem(db, project, conversionInput(item, input), actor);
  } catch (err) {
    await db
      .prepare("UPDATE items SET converted_to = NULL WHERE id = ? AND converted_to = 'pending'")
      .bind(item.id)
      .run();
    throw err;
  }
  const t = now();
  await db.batch([
    db
      .prepare(
        "UPDATE items SET status = 'done', converted_to = ?, closed_at = ?, updated_at = ?, updated_by = ? WHERE id = ?",
      )
      .bind(target.ref, t, t, actor, item.id),
    eventStmt(db, project.slug, item.ref, "converted", actor, { to: target.ref }, t),
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
    ...("owner" in input ? { owner: input.owner } : {}),
  };
}

/* --------------------------------------------------------------- output */

function shortLabel(item) {
  if (item.short) return item.short;
  const words = item.title.split(/\s+/);
  return words.slice(0, 3).join(" ") + (words.length > 3 ? " …" : "");
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
 * "👤: D1 ▶A3 Lizenz · 🤖: A3 Konzept (+2) · 💡 I1 MCP · ⚠️ W1 Auth · neu: A3 · erledigt: A1"
 * Actionable kinds are grouped by owner (you first), others by kind.
 */
// ref -> refs of OPEN items that wait for it (the reverse of waiting_on; nothing extra is stored).
export function successorMap(items) {
  const map = new Map();
  for (const it of items) {
    if (!OPEN.includes(it.status) || !it.waiting_on) continue;
    for (const r of it.waiting_on.split(",")) {
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(it.ref);
    }
  }
  return map;
}

export function buildFooter(
  items,
  kinds,
  { max = 8, since = null, deltaOnly = false, layout = FOOTER_LAYOUT_DEFAULT, lang = "de", labels = FOOTER_OWNER_LABELS } = {},
) {
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const groups = new Map();
  for (const it of items) {
    if (!OPEN.includes(it.status)) continue;
    const k = kindBy.get(it.kind);
    let key, label, weight;
    if (!k || k.actionable) {
      const owner = it.owner || "user";
      key = `o:${owner}`;
      label = `${labels[owner] || FOOTER_OWNER_LABELS[owner] || owner}:`;
      weight = owner === "user" ? 0 : owner === "ai" ? 1 : 2;
    } else {
      key = `k:${k.code}`;
      label = k.footer_label || `${k.name}:`;
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
  const status = new Map(items.map((i) => [i.ref, i.status]));
  const shownRefs = new Set(ordered.flatMap((g, i) => g.items.slice(0, shown[i]).map((it) => it.ref)));
  const parts = ordered
    .map((g, i) => {
      if (!shown[i]) return null;
      const entries = g.items.slice(0, shown[i]).map((it) => {
        const next = succ.get(it.ref) || [];
        const waits = (it.waiting_on ? it.waiting_on.split(",") : []).filter(
          // Unknown blockers (not in the loaded items) keep their marker; only known-closed ones are dropped.
          (r) => (!status.has(r) || OPEN.includes(status.get(r))) && !shownRefs.has(r),
        );
        const marks = [next.length ? `▶${next.join(",")}` : "", waits.length ? `⏸${waits.join(",")}` : ""].filter(Boolean);
        const progress = checkProgress(it);
        return `${it.ref}${marks.length ? " " + marks.join(" ") : ""} ${shortLabel(it)}${progress ? " " + progress : ""}`;
      });
      const hidden = g.items.length - shown[i];
      return `${g.label} ${entries.join(" · ")}${hidden ? ` (+${hidden})` : ""}`;
    })
    .filter(Boolean);
  const delta = [];
  if (since) {
    const created = items.filter((i) => i.created_at >= since).map((i) => i.ref);
    const done = items.filter((i) => i.status === "done" && i.closed_at && i.closed_at >= since).map((i) => i.ref);
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

// { settings, defaults, available }. `available` is false while migration 0006 is not applied yet – everything
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
  for (const r of rows) if (SETTING_KEYS.includes(r.key)) settings[r.key] = r.value;
  return { settings, defaults: SETTINGS_DEFAULTS, available };
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
  // Group markers ("👤", "Du", …): short and on one line; the footer adds the ":" itself.
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
 * (or slug), e.g. "CT ▸ 👤: D1 … · 🤖: A2 …". Projects without anything to show are left out,
 * so with `deltaOnly` only projects with changes appear.
 */
export function buildMultiFooter(entries, kinds, opts = {}) {
  return entries
    .map(({ project, items }) => {
      const line = buildFooter(items, kinds, opts);
      if (!line) return null;
      // Multi layout: the project label gets a line of its own (also for a single group, so blocks look alike);
      // single layout and the short "neu/erledigt" line carry it as a prefix.
      const label = project.code || project.slug;
      return opts.layout === "multi" && !opts.deltaOnly ? `${label} ▸\n${line}` : `${label} ▸ ${line}`;
    })
    .filter(Boolean)
    .join("\n");
}

// Footer for one or more projects given by slug or code; a single project has no project label.
// layout: "multi" | "single" from the request, or null for the web app setting.
export async function footerFor(db, keys, { since = null, delta = false, max = 8, layout = null, lang = "de" } = {}) {
  const projects = [];
  for (const key of keys) {
    const p = await getProject(db, key);
    if (!projects.some((x) => x.slug === p.slug)) projects.push(p);
  }
  const [kinds, settings, ...lists] = await Promise.all([
    listKinds(db, true),
    getSettings(db),
    ...projects.map((p) => listItems(db, { project: p.slug, status: "all" })),
  ]);
  const opts = { since, deltaOnly: delta, max, lang, ...footerStyle(settings, layout) };
  if (projects.length === 1) return buildFooter(lists[0], kinds, opts);
  return buildMultiFooter(projects.map((project, i) => ({ project, items: lists[i] })), kinds, opts);
}

/**
 * Compact one-line-per-item listing for AI assistants (few tokens), e.g.
 * "A2 MCP-Server bauen ⏸D1 [in Arbeit] @Maria" or "D1 Lizenz wählen ▶A2,A4" (▶ = items waiting for it).
 * Bodies are left out; fetch a single item for details.
 */
export function itemsAsText(items, kinds, { withProject = false } = {}) {
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const succ = successorMap(items);
  const lines = items.map((it) => {
    const k = kindBy.get(it.kind);
    const parts = [withProject ? `${it.project_slug}/${it.ref}` : it.ref, it.title];
    const progress = checkProgress(it);
    if (progress) parts.push(`☑${progress}`);
    if (it.waiting_on) parts.push(`⏸${it.waiting_on}`);
    const next = succ.get(it.ref);
    if (next && !withProject) parts.push(`▶${next.join(",")}`);
    if (it.status !== "open") parts.push(`[${STATUS_LABELS[it.status]}]`);
    if (it.owner && (!k || it.owner !== k.default_owner)) parts.push(`@${OWNER_LABELS[it.owner] || it.owner}`);
    if (it.converted_to) parts.push(`→${it.converted_to}`);
    if (it.due) parts.push(`📅${it.due}`);
    return parts.join(" ");
  });
  return lines.length ? lines.join("\n") + "\n" : "(keine)\n";
}

export function buildStatusMarkdown(project, items, kinds, origin) {
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const open = items.filter((i) => OPEN.includes(i.status));
  const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const lines = [
    "## Offene Punkte",
    "",
    `_Stand: ${now().slice(0, 16).replace("T", " ")} UTC · Live: ${origin}/#${project.slug}_`,
    "",
  ];
  if (!open.length) {
    lines.push("Keine offenen Punkte.");
    return lines.join("\n") + "\n";
  }
  lines.push("| Kennung | Stichwort | Art | Verantwortlich | Quelle | Status |", "|---|---|---|---|---|---|");
  for (const it of open) {
    const k = kindBy.get(it.kind);
    const status = STATUS_LABELS[it.status] + (it.waiting_on ? ` ⏸${it.waiting_on.split(",").join(" ⏸")}` : "");
    lines.push(
      `| ${it.ref} | ${cell(it.title)} | ${cell(k?.name || it.kind)} | ${cell(OWNER_LABELS[it.owner] || it.owner || "")} | ${cell(it.source)} | ${status} |`,
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

function normRefs(v) {
  if (v === undefined || v === null || v === "") return null;
  const list = (Array.isArray(v) ? v : String(v).split(/[\s,;]+/))
    .map((r) => String(r).trim().replace(/^⏸/, "").toUpperCase())
    .filter(Boolean);
  for (const r of list) if (!REF_RE.test(r)) throw new HttpError(400, "invalid_field", `waiting_on (${r})`);
  return list.length ? [...new Set(list)].join(",") : null;
}

function normDate(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v)) throw new HttpError(400, "invalid_field", "due (YYYY-MM-DD)");
  return v;
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
    },
  });
}
