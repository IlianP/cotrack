/**
 * cotrack – live tracking of open points (to-dos, tasks, ideas, warnings)
 * shared between a human and their AI assistants.
 *
 * Cloudflare Worker + D1, no build step. See README.md for the API.
 */
import UI_HTML from "./ui.html";

const STATUSES = ["open", "doing", "blocked", "done", "dropped"];
const OPEN = ["open", "doing", "blocked"];
const CLOSED = ["done", "dropped"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const KIND_RE = /^[A-Z]{1,4}$/;
const REF_RE = /^([A-Z]{1,4})(\d{1,6})$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OWNER_LABELS = { user: "Du", ai: "KI" };
const OWNER_ALIASES = { user: "user", du: "user", me: "user", ich: "user", human: "user", ai: "ai", ki: "ai" };
const STATUS_LABELS = { open: "offen", doing: "in Arbeit", blocked: "blockiert", done: "erledigt", dropped: "verworfen" };

class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.detail = detail;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return page(UI_HTML);
      }
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
  if (!m) return null;
  // Each token maps to an actor, so every change is attributed automatically.
  const candidates = [["user", env.TOKEN_USER], ["ai", env.TOKEN_AI]];
  for (const [actor, secret] of candidates) {
    if (secret && (await safeEqual(m[1], secret))) return actor;
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

  if (seg.length === 1 && seg[0] === "version" && method === "GET") {
    const row = await db.prepare("SELECT COALESCE(MAX(id), 0) AS v FROM events").first();
    return json({ version: row.v });
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
        const row = await db
          .prepare("SELECT COALESCE(MAX(id), 0) AS v FROM events WHERE project_slug = ?")
          .bind(project.slug)
          .first();
        return json({ version: row.v });
      }
      if (sub === "events") {
        const after = Number(q.get("after") || 0);
        const limit = Math.min(Number(q.get("limit") || 100), 500);
        const { results } = await db
          .prepare("SELECT * FROM events WHERE project_slug = ? AND id > ? ORDER BY id DESC LIMIT ?")
          .bind(project.slug, after, limit)
          .all();
        return json({ events: results.map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : null })) });
      }
      if (sub === "footer" || sub === "status.md") {
        const [items, kinds] = await Promise.all([
          listItems(db, { project: project.slug, status: "all" }),
          listKinds(db, true),
        ]);
        if (sub === "footer") {
          const textLine = buildFooter(items, kinds, {
            max: clampInt(q.get("max"), 1, 30, 8),
            since: q.get("since") || null,
          });
          if (q.get("format") === "text") return plain(textLine);
          return json({ footer: textLine });
        }
        return plain(buildStatusMarkdown(project, items, kinds, url.origin), "text/markdown; charset=utf-8");
      }
    }
  }
  throw new HttpError(404, "not_found");
}

/* ------------------------------------------------------------- projects */

async function listProjects(db, includeArchived) {
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

async function getProject(db, slug) {
  const p = await db.prepare("SELECT * FROM projects WHERE slug = ?").bind(slug).first();
  if (!p) throw new HttpError(404, "project_not_found", slug);
  return p;
}

async function createProject(db, input, actor) {
  const slug = text(input.slug, "slug", 63, { required: true }).toLowerCase();
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "invalid_field", "slug (a-z, 0-9, -)");
  const name = text(input.name, "name", 120) || slug;
  const repo = text(input.repo, "repo", 200);
  if (repo && !REPO_RE.test(repo)) throw new HttpError(400, "invalid_field", "repo (owner/name)");
  const t = now();
  const exists = await db.prepare("SELECT 1 FROM projects WHERE slug = ?").bind(slug).first();
  if (exists) throw new HttpError(409, "project_exists", slug);
  await db.batch([
    db
      .prepare("INSERT INTO projects (slug, name, repo, archived, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
      .bind(slug, name, repo, t, t),
    eventStmt(db, slug, null, "project_created", actor, { name, repo }, t),
  ]);
  return getProject(db, slug);
}

async function updateProject(db, project, input, actor) {
  const changes = {};
  if ("name" in input) changes.name = text(input.name, "name", 120, { required: true });
  if ("repo" in input) {
    changes.repo = text(input.repo, "repo", 200);
    if (changes.repo && !REPO_RE.test(changes.repo)) throw new HttpError(400, "invalid_field", "repo");
  }
  if ("archived" in input) changes.archived = input.archived ? 1 : 0;
  const cols = Object.keys(changes);
  if (!cols.length) return project;
  const t = now();
  await db.batch([
    db
      .prepare(`UPDATE projects SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE slug = ?`)
      .bind(...cols.map((c) => changes[c]), t, project.slug),
    eventStmt(db, project.slug, null, "project_updated", actor, changes, t),
  ]);
  return getProject(db, project.slug);
}

/* ---------------------------------------------------------------- kinds */

async function listKinds(db, includeInactive) {
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

async function listItems(db, f) {
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

function parseRef(ref) {
  const m = String(ref || "").toUpperCase().match(REF_RE);
  if (!m) throw new HttpError(400, "invalid_ref", ref);
  return { kind: m[1], seq: Number(m[2]) };
}

async function getItemByRef(db, slug, ref) {
  const { kind, seq } = parseRef(ref);
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

async function createItem(db, project, input, actor) {
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

async function updateItem(db, project, item, input, actor) {
  const t = now();
  const changes = {};
  const set = (col, val) => {
    if (val !== item[col]) changes[col] = val;
  };
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
  const cols = Object.keys(changes);
  if (!cols.length) return item;

  let action = "updated";
  if (changes.status === "done") action = "done";
  else if (changes.status === "dropped") action = "dropped";
  else if (changes.status && CLOSED.includes(item.status)) action = "reopened";

  await db.batch([
    db
      .prepare(`UPDATE items SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`)
      .bind(...cols.map((c) => changes[c]), t, actor, item.id),
    eventStmt(db, project.slug, item.ref, action, actor, changes, t),
    touchProject(db, project.slug, t),
  ]);
  return db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).bind(item.id).first();
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
async function convertItem(db, project, item, input, actor) {
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

/**
 * Builds the one-line summary used at the end of chat answers, e.g.
 * "Du: T1 Repo-Name · KI: A3 Konzept (+2) · 💡 I1 MCP · ⚠ W1 Auth · neu: A3 · erledigt: T2"
 * Actionable kinds are grouped by owner (you first), others by kind.
 */
export function buildFooter(items, kinds, { max = 8, since = null } = {}) {
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const groups = new Map();
  for (const it of items) {
    if (!OPEN.includes(it.status)) continue;
    const k = kindBy.get(it.kind);
    let key, label, weight;
    if (!k || k.actionable) {
      const owner = it.owner || "user";
      key = `o:${owner}`;
      label = `${OWNER_LABELS[owner] || owner}:`;
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
  const parts = ordered
    .map((g, i) => {
      if (!shown[i]) return null;
      const entries = g.items.slice(0, shown[i]).map((it) => {
        const wait = it.waiting_on ? " " + it.waiting_on.split(",").map((r) => `⏸${r}`).join(" ") : "";
        return `${it.ref}${wait} ${shortLabel(it)}`;
      });
      const hidden = g.items.length - shown[i];
      return `${g.label} ${entries.join(" · ")}${hidden ? ` (+${hidden})` : ""}`;
    })
    .filter(Boolean);
  if (since) {
    const created = items.filter((i) => i.created_at >= since).map((i) => i.ref);
    const done = items.filter((i) => i.status === "done" && i.closed_at && i.closed_at >= since).map((i) => i.ref);
    if (created.length) parts.push(`neu: ${created.join(", ")}`);
    if (done.length) parts.push(`erledigt: ${done.join(", ")}`);
  }
  return parts.join(" · ");
}

/**
 * Compact one-line-per-item listing for AI assistants (few tokens), e.g.
 * "T4 entscheiden: Kategorien ⏸A3" or "A2 MCP-Server bauen [in Arbeit] @Maria".
 * Bodies are left out; fetch a single item for details.
 */
export function itemsAsText(items, kinds, { withProject = false } = {}) {
  const kindBy = new Map(kinds.map((k) => [k.code, k]));
  const lines = items.map((it) => {
    const k = kindBy.get(it.kind);
    const parts = [withProject ? `${it.project_slug}/${it.ref}` : it.ref, it.title];
    if (it.waiting_on) parts.push(it.waiting_on.split(",").map((r) => `⏸${r}`).join(" "));
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
