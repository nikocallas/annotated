-- annotated — reset seeded annotation view counts to 0
--
-- Earlier migrations (0004_personas_and_seed.sql) populated public.annotations
-- with hard-coded view_count values like 8421, 5310, 4760. Those numbers were
-- demo decoration — they never reflected real reader behavior. Real view
-- counts are now collected by POST /api/annotations/:id/view, fired only
-- when a user opens an annotation detail page.
--
-- This migration resets every seeded annotation (id like 'seed-ann-niko-%')
-- back to 0 so the "Most Viewed" sort and the right-rail "Most viewed clip"
-- panel reflect actual reader engagement.
--
-- Idempotent: rerunning this migration only ever sets seeded rows to 0; it
-- does not touch annotations with non-seeded ids, and it never decrements
-- counts on rows already at 0.

update public.annotations
set view_count = 0
where id like 'seed-ann-niko-%'
  and view_count <> 0;
