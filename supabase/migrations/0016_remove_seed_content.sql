-- Remove launch-era seed content before the bounty resubmission.
--
-- The seed feed contained placeholder posts that quote real journalists and
-- public figures in articles that were never verified to exist, plus seed
-- YouTube posts whose clip_media_url pointed at the product demo video. For a
-- product built around source fidelity, every post on the public feed must be
-- a real capture made with the extension.
--
-- Foreign keys cascade from users and annotations to comments, votes,
-- bookmarks, follows and claims, so deleting the seed rows removes their
-- dependents. media_uploads.annotation_id is SET NULL and is handled by the
-- existing nightly orphan cleanup.

begin;

delete from public.annotations where id like 'seed-%';
delete from public.users where id like 'seed-user-%';

commit;
