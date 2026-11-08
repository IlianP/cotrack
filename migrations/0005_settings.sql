-- Instance settings (methodology v2.7, 2026-11-08): defaults the human chooses in the web app (☰ → Einstellungen),
-- e.g. the footer layout and the group markers for "yours" / "the AI's". They shape what the server returns to
-- every AI client (API and MCP); a parameter in a single request (e.g. layout=single) still wins.
-- One row per key; a missing row means the built-in default in src/worker.js (SETTINGS_DEFAULTS).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,   -- footer_layout | footer_label_user | footer_label_ai
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL       -- always 'user': only the human's token may change settings
);
