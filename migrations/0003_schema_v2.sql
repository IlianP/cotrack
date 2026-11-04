-- Methodology v2 (decided 2026-11-04): the letter says WHAT it is, the footer group (Du/KI) says WHO.
--   A = Aufgabe (owner: user or ai) · D = Entscheidung · I = Idee (💡) · W = Warnung (⚠)
-- Numbering stays per category. "T" is kept for existing items but no longer offered.
INSERT OR IGNORE INTO kinds (code, name, description, actionable, default_owner, footer_label, color, sort_order)
VALUES ('D', 'Entscheidung', 'Muss vom Menschen entschieden werden; die KI bereitet Optionen vor. Beim Abschließen das Ergebnis festhalten.', 1, 'user', NULL, '#d97706', 10);
UPDATE kinds SET name = 'Aufgabe',
  description = 'Etwas, das getan werden muss – von dir (Du) oder der KI. Wechselt die Zuständigkeit, bleibt die Kennung.',
  default_owner = NULL, color = '#2563eb', sort_order = 20
  WHERE code = 'A';
UPDATE kinds SET description = 'Vorschlag, noch nicht beschlossen. Bei Zusage wird daraus A oder D.' WHERE code = 'I';
UPDATE kinds SET description = 'Risiko oder Hinweis, der beobachtet oder bewusst akzeptiert werden muss. Eingetretene Probleme werden direkt zu A oder D.' WHERE code = 'W';
UPDATE kinds SET active = 0, name = 'To-do (alt)', color = '#9ca3af', sort_order = 90 WHERE code = 'T';
