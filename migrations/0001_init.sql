-- cotrack: initial schema
-- Items carry a reference like "T3" = kind "T" + per-project sequence 3.
-- Sequences live in `counters` and are never reused, even after a delete.

CREATE TABLE IF NOT EXISTS projects (
  slug        TEXT PRIMARY KEY,                -- e.g. "cotrack"
  name        TEXT NOT NULL,
  repo        TEXT,                            -- optional GitHub "owner/repo"
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Configurable categories ("kinds"). The default set mirrors the
-- T/A/I/W method; more kinds can be added without code changes.
CREATE TABLE IF NOT EXISTS kinds (
  code          TEXT PRIMARY KEY,              -- 1-4 uppercase letters
  name          TEXT NOT NULL,
  description   TEXT,
  actionable    INTEGER NOT NULL DEFAULT 1,    -- 1 = someone has to do it (grouped by owner in the footer)
  default_owner TEXT,                          -- 'user' | 'ai' | NULL
  footer_label  TEXT,                          -- label for non-actionable kinds, e.g. "Ideen:" or "⚠"
  color         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 50,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS counters (
  project_slug TEXT NOT NULL,
  kind         TEXT NOT NULL,
  last_seq     INTEGER NOT NULL,
  PRIMARY KEY (project_slug, kind)
);

CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  title        TEXT NOT NULL,
  short        TEXT,                           -- 1-3 word label for the footer line
  body         TEXT,
  owner        TEXT,                           -- 'user' | 'ai' | free text
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','doing','blocked','done','dropped')),
  waiting_on   TEXT,                           -- comma separated refs, e.g. "T2,A1"
  source       TEXT,                           -- link or file the item came from
  due          TEXT,                           -- YYYY-MM-DD
  converted_to TEXT,                           -- e.g. idea I1 became A4
  created_by   TEXT NOT NULL,
  updated_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  closed_at    TEXT,
  UNIQUE (project_slug, kind, seq)
);
CREATE INDEX IF NOT EXISTS items_project_status ON items(project_slug, status);
CREATE INDEX IF NOT EXISTS items_owner_status ON items(owner, status);

-- Append-only change log: audit trail + cheap "live" polling via MAX(id).
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  item_ref     TEXT,
  action       TEXT NOT NULL,
  actor        TEXT NOT NULL,
  data         TEXT,
  at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_project ON events(project_slug, id);
CREATE INDEX IF NOT EXISTS events_ref ON events(project_slug, item_ref);

INSERT OR IGNORE INTO kinds (code, name, description, actionable, default_owner, footer_label, color, sort_order) VALUES
  ('T', 'To-do (Du)',  'Nur der Mensch kann es tun: entscheiden, freigeben, Zugänge, Tests auf eigenen Geräten. Entscheidungen beginnen mit „entscheiden:“.', 1, 'user', NULL, '#d97706', 10),
  ('A', 'Aufgabe (KI)', 'Kann die KI selbst erledigen.', 1, 'ai', NULL, '#2563eb', 20),
  ('I', 'Idee', 'Vorschlag, noch nicht beschlossen. Bei Zusage wird daraus A oder T, bei Absage wird sie entfernt.', 0, NULL, 'Ideen:', '#7c3aed', 30),
  ('W', 'Warnung', 'Risiko oder Problem. Bleibt, bis es erledigt oder ausdrücklich akzeptiert ist.', 0, NULL, '⚠', '#dc2626', 40);
