-- Ideas are shown with a light bulb in the footer line instead of "Ideen:".
UPDATE kinds SET footer_label = '💡' WHERE code = 'I' AND footer_label = 'Ideen:';
