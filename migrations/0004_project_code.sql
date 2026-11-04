-- Project code (decided 2026-11-04, D3): a short, unique, immutable label such as "CT" for qualified
-- references like "CT:A14" when one conversation touches several projects.
-- The slug stays the identity; the code is chosen by the human (2-4 chars) or suggested from the slug.
-- Existing projects keep NULL until a code is set (once, via PATCH /api/projects/:slug or the web app).
ALTER TABLE projects ADD COLUMN code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS projects_code ON projects(code) WHERE code IS NOT NULL;
