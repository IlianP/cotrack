-- Project code (decided 2026-11-04, D3): a short, unique, immutable label such as "CT" for qualified
-- references like "CT:A14" when one conversation touches several projects.
-- The slug stays the identity; the code is chosen by the human (2-4 chars) or suggested from the slug.
-- Existing projects keep NULL until a code is set (once, via PATCH /api/projects/:slug or the web app).
ALTER TABLE projects ADD COLUMN code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS projects_code ON projects(code) WHERE code IS NOT NULL;

-- Slugs and codes share one lookup namespace (a project can be addressed as "cotrack" or "CT"), so a code
-- must never equal another project's slug. The worker checks this for friendly errors; these triggers make
-- it atomic, so concurrent requests cannot both pass the check.
CREATE TRIGGER IF NOT EXISTS projects_namespace_insert BEFORE INSERT ON projects
BEGIN
  SELECT RAISE(ABORT, 'code_slug_clash')
  WHERE EXISTS (SELECT 1 FROM projects WHERE code = upper(NEW.slug))
     OR (NEW.code IS NOT NULL AND EXISTS (SELECT 1 FROM projects WHERE slug = lower(NEW.code)));
END;

CREATE TRIGGER IF NOT EXISTS projects_namespace_update BEFORE UPDATE OF code ON projects
WHEN NEW.code IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'code_slug_clash')
  WHERE EXISTS (SELECT 1 FROM projects WHERE slug = lower(NEW.code) AND slug != NEW.slug);
END;
