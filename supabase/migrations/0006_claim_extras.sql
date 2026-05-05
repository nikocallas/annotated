-- annotated — claim flow upgrades
-- Adds structured fields needed by the new File-a-Claim flow:
--   * reason_category   – machine-readable bucket the user chose from a dropdown
--   * details           – optional free-text the user added on top of the bucket
--   * claimant_user_id  – set when the filer is signed in
-- The existing `reason` column is repurposed to hold a human-readable summary
-- (category label + details combined) so the rest of the API and admin tools
-- keep working unchanged.

alter table public.claims
  add column if not exists reason_category text,
  add column if not exists details text,
  add column if not exists claimant_user_id text references public.users(id) on delete set null;

create index if not exists idx_claims_claimant_user on public.claims(claimant_user_id);

-- Loosen the reason length check to allow short auto-generated summaries
-- (the dropdown label alone can be < 10 chars, e.g. "Other").
alter table public.claims drop constraint if exists claims_reason_check;
alter table public.claims add constraint claims_reason_length
  check (char_length(reason) between 1 and 4000);
