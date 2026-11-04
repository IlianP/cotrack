/**
 * cotrack MCP server – lets Claude, ChatGPT & co. use cotrack as a tool.
 *
 * MCP ("Model Context Protocol") is JSON-RPC 2.0 over HTTP. The AI client sends
 * requests like {"method": "tools/list"} or {"method": "tools/call", ...} to one
 * URL; we answer with JSON. This file implements the stateless "Streamable HTTP"
 * transport without any library, so every step is visible:
 *
 *   1. initialize      – client and server agree on a protocol version
 *   2. tools/list      – the server describes its tools (name, purpose, parameters)
 *   3. tools/call      – the AI calls a tool; the answer is short text
 *
 * Answers are deliberately compact text (not JSON) so they cost few tokens.
 */
import {
  httpError,
  isHttpError,
  tokenActor,
  listProjects,
  getProject,
  listKinds,
  listItems,
  successorsOf,
  getItemByRef,
  createItem,
  updateItem,
  convertItem,
  buildFooter,
  itemsAsText,
} from "./worker.js";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const OWNER_LABELS = { user: "Du", ai: "KI" };

const INSTRUCTIONS = `cotrack führt die offenen Punkte eines Projekts, gemeinsam für Mensch und KI.
Kategorien: A Aufgabe (owner "user" = Du oder "ai" = KI), D Entscheidung (trifft der Mensch), I Idee (💡), W Warnung/Risiko (⚠).
Kennungen wie A4 oder D2 werden nie neu vergeben. Abhängigkeiten: waiting_on, z. B. "D2". Anzeige: "D2 ▶A4" = D2 kommt zuerst,
A4 folgt (in der Fußzeile bei Paaren nur so); "A4 ⏸D2" = A4 wartet auf D2 (nur wenn D2 nicht in der Zeile steht).
Arbeitsweise: Zu Beginn einer Session cotrack_status aufrufen. Neue Punkte sofort mit cotrack_add anlegen, Erledigtes mit
cotrack_update (status "done") abschließen. Zugesagte Ideen mit cotrack_convert in A oder D umwandeln. Fußzeile sparsam: Ändern sich in einer
Antwort Punkte, nur die Kurzzeile „neu: … · erledigt: …“ zeigen; die volle Fußzeile (cotrack_footer) nur auf Nachfrage („Stand?“),
am Ende größerer Arbeiten oder etwa alle vier Antworten. Für spätere Sessions reicht cotrack_changes mit der zuletzt gesehenen Stand-Nummer.`;

const projectParam = { type: "string", description: "Projekt-Kürzel, z. B. \"cotrack\" (siehe cotrack_projects)" };
const refParam = { type: "string", description: "Kennung, z. B. \"A4\"" };
const STATUS = ["open", "doing", "blocked", "done", "dropped"];

const TOOLS = [
  {
    name: "cotrack_projects",
    title: "Projekte auflisten",
    description: "Listet alle Projekte mit Anzahl offener Punkte.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cotrack_status",
    title: "Stand eines Projekts",
    description:
      "Kompakter Stand für den Session-Start: Fußzeile, alle offenen Punkte (eine Zeile pro Punkt) und die aktuelle Stand-Nummer für cotrack_changes.",
    inputSchema: { type: "object", properties: { project: projectParam }, required: ["project"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cotrack_list",
    title: "Punkte filtern",
    description: "Listet Punkte eines Projekts gefiltert, eine Zeile pro Punkt (ohne Beschreibungen).",
    inputSchema: {
      type: "object",
      properties: {
        project: projectParam,
        status: { type: "string", enum: ["open", "closed", "all", ...STATUS], description: "Standard: open" },
        kind: { type: "string", description: "A, D, I oder W" },
        owner: { type: "string", description: "user oder ai" },
        q: { type: "string", description: "Suchtext" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cotrack_get",
    title: "Punkt im Detail",
    description: "Zeigt einen Punkt mit Beschreibung, Quelle und Verlauf-Metadaten.",
    inputSchema: { type: "object", properties: { project: projectParam, ref: refParam }, required: ["project", "ref"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cotrack_add",
    title: "Punkt anlegen",
    description: "Legt einen neuen Punkt an und gibt seine Kennung zurück.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectParam,
        kind: { type: "string", enum: ["A", "D", "I", "W"] },
        title: { type: "string", description: "Klarer Titel, ein Satz" },
        short: { type: "string", description: "1–3 Wörter für die Fußzeile" },
        owner: { type: "string", enum: ["user", "ai"], description: "Nur für A/D: wer zuständig ist" },
        body: { type: "string", description: "Optionale Beschreibung" },
        waiting_on: { type: "string", description: "Kennungen, auf die gewartet wird, z. B. \"D2, A1\"" },
        source: { type: "string", description: "Link oder Datei, aus der der Punkt stammt" },
      },
      required: ["project", "kind", "title"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "cotrack_update",
    title: "Punkt ändern oder abschließen",
    description:
      "Ändert Felder eines Punkts. Abschließen mit status \"done\", verwerfen mit \"dropped\". Leerer String löscht ein Feld.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectParam,
        ref: refParam,
        status: { type: "string", enum: STATUS },
        title: { type: "string" },
        short: { type: "string" },
        owner: { type: "string", description: "user oder ai" },
        body: { type: "string" },
        waiting_on: { type: "string" },
        source: { type: "string" },
      },
      required: ["project", "ref"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "cotrack_convert",
    title: "Idee zusagen",
    description: "Wandelt eine Idee (I) in eine Aufgabe (A) oder Entscheidung (D) mit neuer Kennung um; die Idee wird geschlossen.",
    inputSchema: {
      type: "object",
      properties: {
        project: projectParam,
        ref: refParam,
        kind: { type: "string", enum: ["A", "D"] },
        owner: { type: "string", enum: ["user", "ai"] },
      },
      required: ["project", "ref", "kind"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "cotrack_footer",
    title: "Fußzeile",
    description: "Nur die Fußzeile für das Ende einer Antwort (eine Zeile). Mit since (ISO-Zeit) auch „neu“ und „erledigt“.",
    inputSchema: {
      type: "object",
      properties: { project: projectParam, since: { type: "string", description: "ISO-Zeitpunkt, z. B. Session-Beginn" } },
      required: ["project"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cotrack_changes",
    title: "Änderungen seit Stand X",
    description:
      "Nur die Änderungen seit einer Stand-Nummer (aus cotrack_status oder einem früheren Aufruf) – spart Tokens in Folge-Sessions.",
    inputSchema: {
      type: "object",
      properties: { project: projectParam, after: { type: "integer", description: "Zuletzt gesehene Stand-Nummer" } },
      required: ["project", "after"],
    },
    annotations: { readOnlyHint: true },
  },
];

/* ------------------------------------------------------------ tool logic */

const optional = (args, keys) =>
  Object.fromEntries(keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k] === "" ? null : args[k]]));

async function latestEvent(db, slug) {
  const row = await db.prepare("SELECT COALESCE(MAX(id), 0) AS v FROM events WHERE project_slug = ?").bind(slug).first();
  return row.v;
}

async function callTool(name, args, db, actor) {
  switch (name) {
    case "cotrack_projects": {
      const projects = await listProjects(db, false);
      if (!projects.length) return "(keine Projekte)";
      return projects.map((p) => `${p.slug} – ${p.name}${p.repo ? ` (${p.repo})` : ""}: ${p.open_count} offen`).join("\n");
    }
    case "cotrack_status": {
      const project = await getProject(db, args.project);
      // Read the cursor BEFORE the items: a write in between is then replayed by
      // cotrack_changes instead of being skipped.
      const stand = await latestEvent(db, project.slug);
      const [items, kinds] = await Promise.all([
        listItems(db, { project: project.slug, status: "open" }),
        listKinds(db, true),
      ]);
      return `Fußzeile: ${buildFooter(items, kinds) || "(nichts offen)"}\nStand: ${stand}\n\n${itemsAsText(items, kinds)}`;
    }
    case "cotrack_list": {
      const project = await getProject(db, args.project);
      const items = await listItems(db, {
        project: project.slug,
        status: args.status || "open",
        kind: args.kind ? String(args.kind).toUpperCase() : null,
        owner: args.owner || null,
        q: args.q || null,
      });
      return itemsAsText(items, await listKinds(db, true));
    }
    case "cotrack_get": {
      const it = await getItemByRef(db, (await getProject(db, args.project)).slug, args.ref);
      const lines = [
        `${it.ref} ${it.title}`,
        `Status: ${it.status}${it.waiting_on ? ` · wartet auf ${it.waiting_on}` : ""}${it.owner ? ` · ${OWNER_LABELS[it.owner] || it.owner}` : ""}`,
      ];
      if (it.short) lines.push(`Kurz: ${it.short}`);
      if (it.body) lines.push(`Beschreibung: ${it.body}`);
      const next = await successorsOf(db, it.project_slug, it.ref);
      if (next.length) lines.push(`Danach folgt: ▶${next.join(",")}`);
      if (it.source) lines.push(`Quelle: ${it.source}`);
      if (it.converted_to) lines.push(`Umgewandelt in: ${it.converted_to}`);
      lines.push(`Angelegt ${it.created_at} (${it.created_by}), geändert ${it.updated_at} (${it.updated_by})`);
      return lines.join("\n");
    }
    case "cotrack_add": {
      const project = await getProject(db, args.project);
      const input = { kind: args.kind, title: args.title, ...optional(args, ["short", "owner", "body", "waiting_on", "source"]) };
      const it = await createItem(db, project, input, actor);
      return `${it.ref} angelegt: ${it.title}`;
    }
    case "cotrack_update": {
      const project = await getProject(db, args.project);
      const item = await getItemByRef(db, project.slug, args.ref);
      const fields = optional(args, ["status", "title", "short", "owner", "body", "waiting_on", "source"]);
      const it = await updateItem(db, project, item, fields, actor);
      return `${it.ref} aktualisiert (${it.status}): ${it.title}`;
    }
    case "cotrack_convert": {
      const project = await getProject(db, args.project);
      const item = await getItemByRef(db, project.slug, args.ref);
      const r = await convertItem(db, project, item, optional(args, ["kind", "owner"]), actor);
      return `${r.from.ref} → ${r.to.ref}: ${r.to.title}`;
    }
    case "cotrack_footer": {
      const project = await getProject(db, args.project);
      const [items, kinds] = await Promise.all([listItems(db, { project: project.slug, status: "all" }), listKinds(db, true)]);
      return buildFooter(items, kinds, { since: args.since || null }) || "(nichts offen)";
    }
    case "cotrack_changes": {
      const project = await getProject(db, args.project);
      const after = Number(args.after) || 0;
      const { results } = await db
        .prepare("SELECT id, item_ref, action, actor, data FROM events WHERE project_slug = ? AND id > ? ORDER BY id LIMIT 200")
        .bind(project.slug, after)
        .all();
      if (!results.length) return `Keine Änderungen seit Stand ${after}.`;
      const lines = results.map((e) => {
        return `${e.item_ref || "Projekt"} ${e.action} (${OWNER_LABELS[e.actor] || e.actor})${describeChange(e)}`;
      });
      return `${lines.join("\n")}\nStand: ${results[results.length - 1].id}`;
    }
    default:
      throw httpError(404, "unknown_tool", name);
  }
}

// Compact but complete: every changed field of an event, long texts shortened.
const CHANGE_FIELDS = ["title", "status", "owner", "short", "waiting_on", "source", "due", "body", "to", "name", "repo"];
function describeChange(e) {
  if (!e.data) return "";
  const d = JSON.parse(e.data);
  if (e.action === "deleted") return d.title ? `: ${d.title}` : "";
  const parts = CHANGE_FIELDS.filter((k) => k in d).map((k) => {
    let v = d[k] === null ? "–" : String(d[k]);
    if (v.length > 80) v = v.slice(0, 77) + "…";
    return k === "title" ? v : `${k}=${v}`;
  });
  return parts.length ? `: ${parts.join(" · ")}` : "";
}

/* ---------------------------------------------------------- JSON-RPC */

async function handleMessage(msg, db, actor) {
  const { id, method, params = {} } = msg || {};
  const isNotification = id === undefined || id === null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return fail(-32600, "Invalid Request");
  if (isNotification) return null; // e.g. notifications/initialized – nothing to answer

  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "cotrack", title: "cotrack – offene Punkte", version: "0.2.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      try {
        const text = await callTool(params.name, params.arguments || {}, db, actor);
        return reply({ content: [{ type: "text", text }] });
      } catch (err) {
        // Tool errors go back to the AI as readable text so it can correct itself.
        const message = isHttpError(err) ? `${err.message}${err.detail ? `: ${err.detail}` : ""}` : "internal_error";
        if (!isHttpError(err)) console.error(err);
        return reply({ content: [{ type: "text", text: `Fehler: ${message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
};

/**
 * Entry point for /mcp and /mcp/<token>.
 * The token can come from the Authorization header (Claude Code, scripts) or from the URL path
 * (web apps like claude.ai and ChatGPT, whose connector dialogs cannot send custom headers).
 */
export async function handleMcp(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const pathToken = url.pathname.split("/")[2];
  const header = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)\s*$/i);
  const token = header ? header[1] : pathToken ? decodeURIComponent(pathToken) : null;
  const actor = token ? await tokenActor(token, env) : null;
  if (!actor) return rpcResponse({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }, 401);
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });

  let body;
  try {
    body = await request.json();
  } catch {
    return rpcResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(body)) {
    const answers = (await Promise.all(body.map((m) => handleMessage(m, env.DB, actor)))).filter(Boolean);
    return answers.length ? rpcResponse(answers) : new Response(null, { status: 202, headers: CORS });
  }
  const answer = await handleMessage(body, env.DB, actor);
  return answer ? rpcResponse(answer) : new Response(null, { status: 202, headers: CORS });
}

function rpcResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}
