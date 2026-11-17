-- Items that concern several projects (decision D26): an item keeps exactly one home project and its reference there;
-- also_in lists further projects (slugs, comma separated, e.g. "immobilien") where it is shown as well, under its
-- qualified reference ("FIN:W3"). NULL = shown only in its home project. Nothing is copied, so there is one status.
-- waiting_on needs no new column: across projects it holds "slug:A2" next to plain refs ("A2" = same project).
ALTER TABLE items ADD COLUMN also_in TEXT;
