-- OAuth 2.1 for the MCP server (decided 2026-11-08, D11): claude.ai, ChatGPT & co. connect to /mcp and sign in
-- once on a cotrack consent page instead of carrying the AI token in the URL. Implemented in src/oauth.js.
-- Secrets (client secrets, codes, tokens) are stored only as SHA-256 hashes. Times are Unix seconds.

-- Clients register themselves (Dynamic Client Registration, RFC 7591).
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id     TEXT PRIMARY KEY,                -- "ctc_…"
  secret_hash   TEXT,                            -- NULL for public clients (token_endpoint_auth_method "none")
  auth_method   TEXT NOT NULL,                   -- none | client_secret_post | client_secret_basic
  client_name   TEXT,
  redirect_uris TEXT NOT NULL,                   -- JSON array, matched exactly
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

-- Authorization codes: single use, valid for two minutes, bound to client, redirect URI and PKCE challenge.
CREATE TABLE IF NOT EXISTS oauth_codes (
  hash           TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,                  -- S256
  scope          TEXT NOT NULL,
  resource       TEXT NOT NULL,
  actor          TEXT NOT NULL,                  -- always "ai": changes made through a connector are attributed to the AI
  expires_at     INTEGER NOT NULL
);

-- Access tokens (1 hour) and refresh tokens (30 days, rotated on every use). One grant = one connection.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  hash        TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                     -- access | refresh
  grant_id    TEXT NOT NULL,
  client_id   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  scope       TEXT NOT NULL,
  resource    TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_tokens_grant ON oauth_tokens(grant_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_expiry ON oauth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS oauth_codes_expiry ON oauth_codes(expires_at);
