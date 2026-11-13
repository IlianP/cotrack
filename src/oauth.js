/**
 * OAuth 2.1 for the MCP server (decided 2026-11-08, D11) – without a library, like the rest of cotrack.
 *
 * Why: claude.ai and ChatGPT cannot send an Authorization header from their connector dialogs, so until now
 * the AI token had to sit in the URL (/mcp/<token>, removed since). With OAuth the connector URL is just /mcp; on connecting,
 * the client opens a cotrack consent page once, the human confirms with their user token, and the client
 * receives short-lived tokens. No secret appears in the URL.
 *
 * The flow, as the MCP specification (2025-06-18) asks for it:
 *   1. POST /mcp without a token → 401 with "WWW-Authenticate: Bearer resource_metadata=…"
 *   2. GET  /.well-known/oauth-protected-resource[/mcp]   → which authorization server protects /mcp (RFC 9728)
 *   3. GET  /.well-known/oauth-authorization-server       → where to register, authorize and get tokens (RFC 8414)
 *   4. POST /register                                     → the client registers itself (RFC 7591)
 *   5. GET  /authorize  → consent page; POST /authorize   → after the user token: redirect with a code (PKCE S256)
 *   6. POST /token      → code → access token (1 h) + refresh token (30 days, rotated on every use)
 *   7. POST /mcp with "Authorization: Bearer cto_…"       → actor "ai"
 *   (POST /revoke ends a connection, RFC 7009.)
 *
 * Only the human can authorize (TOKEN_USER); tokens issued here always act as "ai", so changes made through a
 * connector are attributed to the AI as before. Secrets are stored as SHA-256 hashes only (migrations/0005_oauth.sql).
 */
import { tokenActor, preferredLang } from "./worker.js";

const SCOPE = "mcp";
const CODE_TTL = 120; // seconds
const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 24 * 3600;
const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"];
const PKCE_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
// The only request parameters carried through the consent page. Anything else (e.g. "decision" or "token" smuggled
// into the authorization URL) is dropped, so a client cannot pre-fill the user's choice.
const AUTHORIZE_PARAMS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
};

// The consent page speaks the browser's language (Accept-Language, same rule as the web app: German or English).
// Only the page is translated; error codes and descriptions for the client stay English, as OAuth expects.
const PAGE_TEXT = {
  de: {
    title: "cotrack verbinden",
    someApp: "Eine App",
    intro: (name) =>
      `<strong>${name}</strong> möchte auf deine offenen Punkte in cotrack zugreifen – lesen und ändern.
Änderungen über diese Verbindung werden als <strong>KI</strong> protokolliert.`,
    redirect: "Weiterleitung danach zu:",
    tokenLabel: "Dein Nutzer-Token (derselbe wie in der Web-App)",
    wrongToken: "Der Token stimmt nicht. Nur der Nutzer-Token ist hier gültig, nicht der KI-Token.",
    allow: "Zugriff erlauben",
    deny: "Ablehnen",
    notYou: "Nicht du hast die Verbindung gestartet? Dann ablehnen.",
    fatal: {
      invalid_request: "Ungültige Anfrage.",
      unknown_client: "Unbekannter Client. Bitte die Verbindung in der App neu einrichten.",
      unregistered_redirect: "Die Weiterleitungsadresse ist für diesen Client nicht registriert.",
    },
  },
  en: {
    title: "Connect cotrack",
    someApp: "An app",
    intro: (name) =>
      `<strong>${name}</strong> wants to access your open points in cotrack – to read and change them.
Changes made through this connection are logged as <strong>AI</strong>.`,
    redirect: "Afterwards you are sent back to:",
    tokenLabel: "Your user token (the same as in the web app)",
    wrongToken: "That token is not correct. Only the user token works here, not the AI token.",
    allow: "Allow access",
    deny: "Deny",
    notYou: "You did not start this connection? Then deny it.",
    fatal: {
      invalid_request: "Invalid request.",
      unknown_client: "Unknown client. Please set up the connection in the app again.",
      unregistered_redirect: "The redirect address is not registered for this client.",
    },
  },
};

/** Handles the OAuth endpoints; returns null for any other path. */
export async function handleOAuth(request, env, url) {
  const path = url.pathname;
  const route =
    path === "/.well-known/oauth-protected-resource" || path.startsWith("/.well-known/oauth-protected-resource/")
      ? "prm"
      : path === "/.well-known/oauth-authorization-server" || path.startsWith("/.well-known/oauth-authorization-server/")
        ? "asm"
        : { "/register": "register", "/authorize": "authorize", "/token": "token", "/revoke": "revoke" }[path];
  if (!route) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const origin = url.origin;
  try {
    if (route === "prm" && request.method === "GET") return metadata(protectedResourceMetadata(origin));
    if (route === "asm" && request.method === "GET") return metadata(authorizationServerMetadata(origin));
    if (route === "register" && request.method === "POST") return await register(request, env.DB);
    const lang = preferredLang(request.headers.get("accept-language"));
    if (route === "authorize" && request.method === "GET") return await authorizeGet(env.DB, url, lang);
    if (route === "authorize" && request.method === "POST") return await authorizePost(request, env, origin, lang);
    if (route === "token" && request.method === "POST") return await token(request, env.DB, origin);
    if (route === "revoke" && request.method === "POST") return await revoke(request, env.DB);
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  } catch (err) {
    console.error(err);
    // Also reached when migration 0005 has not been applied yet: OAuth is then unavailable, the static tokens keep working.
    return oauthError("server_error", "OAuth is not available right now", 500);
  }
}

/** Actor for an OAuth access token on /mcp, or null. Never throws (e.g. before migration 0005 is applied). */
export async function oauthActor(db, token) {
  if (!token || !token.startsWith("cto_")) return null;
  try {
    const row = await db
      .prepare("SELECT actor, expires_at FROM oauth_tokens WHERE hash = ? AND kind = 'access'")
      .bind(await sha256hex(token))
      .first();
    return row && row.expires_at > nowSec() ? row.actor : null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** WWW-Authenticate header for a 401 on /mcp: tells the client where to start the OAuth flow. */
export function wwwAuthenticate(origin, invalidToken = false) {
  const meta = `${origin}/.well-known/oauth-protected-resource/mcp`;
  return `Bearer resource_metadata="${meta}"${invalidToken ? ', error="invalid_token"' : ""}`;
}

/* ------------------------------------------------------------ metadata */

function protectedResourceMetadata(origin) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "cotrack",
  };
}

function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    revocation_endpoint: `${origin}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: AUTH_METHODS,
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

/* -------------------------------------------- dynamic client registration */

async function register(request, db) {
  let body;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "JSON body expected");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return oauthError("invalid_client_metadata", "JSON object expected");

  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every(validRedirectUri)) {
    return oauthError("invalid_redirect_uri", "redirect_uris: 1-10 https URLs (http only for localhost), without fragment");
  }
  // RFC 7591 would default to client_secret_basic; MCP clients are usually public clients with PKCE.
  const method = body.token_endpoint_auth_method ?? "none";
  if (!AUTH_METHODS.includes(method)) return oauthError("invalid_client_metadata", "unsupported token_endpoint_auth_method");
  if (body.grant_types !== undefined && !(Array.isArray(body.grant_types) && body.grant_types.every((g) => ["authorization_code", "refresh_token"].includes(g)))) {
    return oauthError("invalid_client_metadata", "grant_types: authorization_code, refresh_token");
  }
  if (body.response_types !== undefined && !(Array.isArray(body.response_types) && body.response_types.every((r) => r === "code"))) {
    return oauthError("invalid_client_metadata", "response_types: code");
  }
  const name = typeof body.client_name === "string" ? body.client_name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) : null;

  const clientId = randomToken("ctc_");
  const secret = method === "none" ? null : randomToken("cts_");
  const t = nowSec();
  await db
    .prepare("INSERT INTO oauth_clients (client_id, secret_hash, auth_method, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(clientId, secret ? await sha256hex(secret) : null, method, name || null, JSON.stringify(uris), t)
    .run();
  return oauthJson(
    {
      client_id: clientId,
      client_id_issued_at: t,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: name || undefined,
      redirect_uris: uris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPE,
    },
    201,
  );
}

// https anywhere; plain http only for loopback addresses (native apps, local tools). No fragments, no other schemes.
function validRedirectUri(u) {
  if (typeof u !== "string" || u.length > 2000) return false;
  let p;
  try {
    p = new URL(u);
  } catch {
    return false;
  }
  if (p.hash || u.includes("#")) return false;
  if (p.protocol === "https:") return true;
  return p.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(p.hostname);
}

/* ------------------------------------------------------------- authorize */

async function authorizeGet(db, url, lang) {
  const p = pickAuthorizeParams((key) => url.searchParams.get(key));
  const check = await checkAuthorizeRequest(db, p, url.origin);
  if (check.fatal) return consentPage({ fatal: check.fatal, lang }, 400);
  if (check.error) return redirectTo(check.redirectUri, { ...check.error, state: p.state, iss: url.origin });
  return consentPage({ params: p, client: check.client, redirectUri: check.redirectUri, lang });
}

async function authorizePost(request, env, origin, lang) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return consentPage({ fatal: "invalid_request", lang }, 400);
  }
  const p = pickAuthorizeParams((key) => form.get(key));
  const check = await checkAuthorizeRequest(env.DB, p, origin);
  if (check.fatal) return consentPage({ fatal: check.fatal, lang }, 400);
  if (check.error) return redirectTo(check.redirectUri, { ...check.error, state: p.state, iss: origin });

  // Exactly one decision, and it must be "allow"; anything else counts as a refusal.
  const decisions = form.getAll("decision");
  if (decisions.length !== 1 || decisions[0] !== "allow") {
    return redirectTo(check.redirectUri, { error: "access_denied", error_description: "The user denied access.", state: p.state, iss: origin });
  }
  // Only the human may connect a client: the AI token is deliberately not accepted here.
  const userToken = form.get("token");
  if (typeof userToken !== "string" || (await tokenActor(userToken.trim(), env)) !== "user") {
    return consentPage({ params: p, client: check.client, redirectUri: check.redirectUri, wrongToken: true, lang }, 401);
  }

  const code = randomToken("ctk_");
  await env.DB
    .prepare(
      "INSERT INTO oauth_codes (hash, client_id, redirect_uri, code_challenge, scope, resource, actor, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'ai', ?)",
    )
    .bind(await sha256hex(code), check.client.client_id, check.redirectUri, p.code_challenge, SCOPE, check.resource, nowSec() + CODE_TTL)
    .run();
  return redirectTo(check.redirectUri, { code, state: p.state, iss: origin });
}

function pickAuthorizeParams(get) {
  const p = {};
  for (const key of AUTHORIZE_PARAMS) {
    const v = get(key);
    if (typeof v === "string" && v !== "") p[key] = v;
  }
  return p;
}

/**
 * Validates an authorization request. Problems with client or redirect URI are shown on the page ("fatal", a key of
 * PAGE_TEXT.*.fatal) and never redirected, so cotrack cannot be abused as an open redirector; everything else goes back
 * to the client as an error.
 */
async function checkAuthorizeRequest(db, p, origin) {
  const client = p.client_id ? await getClient(db, p.client_id) : null;
  if (!client) return { fatal: "unknown_client" };
  const registered = JSON.parse(client.redirect_uris);
  const redirectUri = p.redirect_uri ?? (registered.length === 1 ? registered[0] : null);
  if (!redirectUri || !registered.includes(redirectUri)) return { fatal: "unregistered_redirect" };

  if (p.response_type !== "code") return { redirectUri, error: { error: "unsupported_response_type" } };
  if (p.code_challenge_method !== "S256" || !PKCE_RE.test(p.code_challenge || "")) {
    return { redirectUri, error: { error: "invalid_request", error_description: "PKCE with S256 is required" } };
  }
  let resource = `${origin}/mcp`;
  if (p.resource) {
    let r;
    try {
      r = new URL(p.resource);
    } catch {
      r = null;
    }
    if (!r || r.origin !== origin) return { redirectUri, error: { error: "invalid_target", error_description: "unknown resource" } };
    resource = p.resource;
  }
  return { client, redirectUri, resource };
}

function consentPage({ params, client, redirectUri, wrongToken = false, fatal = null, lang = "en" }, status = 200) {
  const T = PAGE_TEXT[lang] || PAGE_TEXT.en;
  let body;
  if (fatal) {
    body = `<h1>${esc(T.title)}</h1><p class="err">${esc(T.fatal[fatal] || T.fatal.invalid_request)}</p>`;
  } else {
    const hidden = Object.entries(params)
      .filter(([k]) => AUTHORIZE_PARAMS.includes(k) && k !== "redirect_uri")
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
      .join("");
    const name = client.client_name || T.someApp;
    // The client name is chosen by whoever registered the client: always escaped, like every other value here.
    body = `<h1>${esc(T.title)}</h1>
<p>${T.intro(esc(name))}</p>
<p class="muted">${esc(T.redirect)} ${esc(new URL(redirectUri).host)}</p>
<form method="post" action="/authorize">
${hidden}<input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
<label for="token">${esc(T.tokenLabel)}</label>
<input id="token" name="token" type="password" autocomplete="current-password" required autofocus>
${wrongToken ? `<p class="err">${esc(T.wrongToken)}</p>` : ""}
<div class="row"><button type="submit" name="decision" value="allow">${esc(T.allow)}</button>
<button type="submit" name="decision" value="deny" formnovalidate class="sec">${esc(T.deny)}</button></div>
</form>
<p class="muted">${esc(T.notYou)}</p>`;
  }
  const html = `<!doctype html><html lang="${lang === "de" ? "de" : "en"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(T.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1d2127;--card:#fff;--muted:#5f6670;--acc:#2f6fde;--err:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e8eaed;--card:#1d2127;--muted:#9aa1ab;--acc:#6b9cf5;--err:#f97066}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;display:flex;justify-content:center;padding:32px 16px}
main{background:var(--card);max-width:440px;width:100%;padding:24px;border-radius:12px;box-shadow:0 1px 3px #0002}
h1{font-size:1.3rem;margin:0 0 12px}label{display:block;margin:16px 0 6px;font-weight:600}
input[type=password]{width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid var(--muted);border-radius:8px;background:transparent;color:inherit}
.row{display:flex;gap:8px;margin-top:16px}button{flex:1;padding:10px;font:inherit;border:0;border-radius:8px;background:var(--acc);color:#fff;cursor:pointer}
button.sec{background:transparent;color:var(--fg);border:1px solid var(--muted)}.muted{color:var(--muted);font-size:.9rem}.err{color:var(--err)}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-language": lang === "de" ? "de" : "en",
      vary: "accept-language",
      // No form-action: browsers apply it to the redirect after the POST, which goes to the client's own URL.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

/* ----------------------------------------------------------------- token */

async function token(request, db, origin) {
  const p = await readParams(request);
  const auth = await authenticateClient(request, db, p);
  if (auth.error) return auth.error;
  const client = auth.client;
  const t = nowSec();

  if (p.grant_type === "authorization_code") {
    if (!p.code || !PKCE_RE.test(p.code_verifier || "")) return oauthError("invalid_request", "code and code_verifier are required");
    // Deleting first makes the code single-use even under concurrent requests.
    const row = await db.prepare("DELETE FROM oauth_codes WHERE hash = ? RETURNING *").bind(await sha256hex(p.code)).first();
    if (!row || row.expires_at <= t || row.client_id !== client.client_id) return oauthError("invalid_grant", "code is invalid or expired");
    if (p.redirect_uri !== undefined && p.redirect_uri !== row.redirect_uri) return oauthError("invalid_grant", "redirect_uri does not match");
    if ((await sha256b64url(p.code_verifier)) !== row.code_challenge) return oauthError("invalid_grant", "PKCE verification failed");
    return issueTokens(db, { clientId: client.client_id, actor: row.actor, resource: row.resource, grantId: randomToken("g_") });
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError("invalid_request", "refresh_token is required");
    // Rotation: every refresh token works once; using it ends the old access token of the same connection.
    const row = await db
      .prepare("DELETE FROM oauth_tokens WHERE hash = ? AND kind = 'refresh' RETURNING *")
      .bind(await sha256hex(p.refresh_token))
      .first();
    if (!row || row.expires_at <= t || row.client_id !== client.client_id) return oauthError("invalid_grant", "refresh_token is invalid or expired");
    await db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ?").bind(row.grant_id).run();
    return issueTokens(db, { clientId: client.client_id, actor: row.actor, resource: row.resource, grantId: row.grant_id });
  }

  return oauthError("unsupported_grant_type", "authorization_code or refresh_token");
}

async function issueTokens(db, { clientId, actor, resource, grantId }) {
  const t = nowSec();
  const access = randomToken("cto_");
  const refresh = randomToken("ctr_");
  const insert = db.prepare(
    "INSERT INTO oauth_tokens (hash, kind, grant_id, client_id, actor, scope, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  await db.batch([
    insert.bind(await sha256hex(access), "access", grantId, clientId, actor, SCOPE, resource, t + ACCESS_TTL, t),
    insert.bind(await sha256hex(refresh), "refresh", grantId, clientId, actor, SCOPE, resource, t + REFRESH_TTL, t),
    db.prepare("UPDATE oauth_clients SET last_used_at = ? WHERE client_id = ?").bind(t, clientId),
    // Housekeeping: expired codes and tokens are of no use to anyone.
    db.prepare("DELETE FROM oauth_tokens WHERE expires_at <= ?").bind(t),
    db.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").bind(t),
  ]);
  return oauthJson({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: SCOPE });
}

/* ---------------------------------------------------------------- revoke */

async function revoke(request, db) {
  const p = await readParams(request);
  const auth = await authenticateClient(request, db, p);
  if (auth.error) return auth.error;
  if (p.token) {
    const row = await db
      .prepare("SELECT grant_id FROM oauth_tokens WHERE hash = ? AND client_id = ?")
      .bind(await sha256hex(p.token), auth.client.client_id)
      .first();
    // Revoking either token of a connection ends the whole connection.
    if (row) await db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ?").bind(row.grant_id).run();
  }
  // RFC 7009: unknown tokens are not an error.
  return new Response(null, { status: 200, headers: { "cache-control": "no-store", ...CORS } });
}

/* --------------------------------------------------------------- helpers */

// Client authentication at /token and /revoke: public clients send only client_id; confidential clients
// prove themselves with the secret from registration (in the body or via HTTP Basic).
async function authenticateClient(request, db, p) {
  let clientId = p.client_id;
  let secret = p.client_secret;
  let viaBasic = false;
  const basic = (request.headers.get("authorization") || "").match(/^Basic\s+(\S+)\s*$/i);
  if (basic) {
    try {
      const [id, ...rest] = atob(basic[1]).split(":");
      clientId = decodeURIComponent(id);
      secret = decodeURIComponent(rest.join(":"));
      viaBasic = true;
    } catch {
      return { error: oauthError("invalid_client", "malformed Basic credentials", 401) };
    }
  }
  const client = clientId ? await getClient(db, clientId) : null;
  if (!client) return { error: oauthError("invalid_client", "unknown client", 401) };
  if (client.auth_method !== "none") {
    const ok =
      typeof secret === "string" &&
      secret !== "" &&
      (client.auth_method === "client_secret_basic" ? viaBasic : true) &&
      (await hashEqual(await sha256hex(secret), client.secret_hash));
    if (!ok) return { error: oauthError("invalid_client", "client authentication failed", 401) };
  }
  return { client };
}

async function getClient(db, clientId) {
  if (typeof clientId !== "string" || clientId.length > 100) return null;
  return db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").bind(clientId).first();
}

// Token endpoint parameters: form-encoded per spec; JSON is accepted as well for lenient clients.
async function readParams(request) {
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("application/json")) {
      const v = await request.json();
      return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) : {};
    }
    const form = await request.formData();
    const out = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function redirectTo(uri, params) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: u.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

function metadata(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", ...CORS },
  });
}

function oauthJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache", ...CORS },
  });
}

function oauthError(error, description, status = 400) {
  return oauthJson({ error, error_description: description }, status);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(prefix) {
  return prefix + b64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(str) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
}

async function sha256hex(str) {
  return [...(await sha256(str))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256b64url(str) {
  return b64url(await sha256(str));
}

async function hashEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  const enc = new TextEncoder();
  return crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));
}
