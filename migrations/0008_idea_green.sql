-- Ideas are green instead of purple (#7c3aed → #16a34a, decided 2026-11-13): green is the colour of the category this app
-- is made for. Only the stored default is changed; a colour someone customized via /api/kinds stays as it is.
UPDATE kinds SET color = '#16a34a' WHERE code = 'I' AND color = '#7c3aed';
