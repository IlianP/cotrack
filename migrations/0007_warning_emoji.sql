-- Warnings use the emoji form "⚠️" (U+26A0 + U+FE0F) like the other footer markers 👤 🤖 💡 (decided 2026-11-09).
-- Only the stored default is changed; a label someone customized via /api/kinds stays as it is.
-- Numbered 0007 because 0006 is reserved by the settings migration in PR #11.
UPDATE kinds SET footer_label = '⚠️' WHERE code = 'W' AND footer_label = '⚠';
