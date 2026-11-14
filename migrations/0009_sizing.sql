-- Effort and benefit (decision D21, methodology v2.10): optional, coarse, only for actions (A) and ideas (I).
--   effort  = time of whoever is responsible: XS ≤ 5 min · S ≤ 30 min · M ≤ 2 h · L ≤ 1 day · XL more
--   benefit = how much it moves the project goal: low · medium · high
--   sized_by = who set the values last: 'ai' = an estimate, 'user' = confirmed by the human
-- Decisions get no values of their own: they inherit the benefit of the items waiting for them (computed, not stored).
ALTER TABLE items ADD COLUMN effort TEXT CHECK (effort IN ('XS', 'S', 'M', 'L', 'XL'));
ALTER TABLE items ADD COLUMN benefit TEXT CHECK (benefit IN ('low', 'medium', 'high'));
ALTER TABLE items ADD COLUMN sized_by TEXT;
