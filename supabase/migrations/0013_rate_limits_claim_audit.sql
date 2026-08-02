-- Annotated — distributed abuse controls and claim audit trail
-- Rollback: revoke/drop consume_rate_limit and moderate_claim, then drop the
-- two additive tables. Claim rows and core product data are unaffected.

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null check (request_count > 0),
  reset_at timestamptz not null,
  touched_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_buckets_reset on public.rate_limit_buckets(reset_at);
alter table public.rate_limit_buckets enable row level security;
alter table public.rate_limit_buckets force row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table(allowed boolean, current_count integer, reset_at_epoch bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket public.rate_limit_buckets%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if length(p_bucket_key) < 8 or p_max_requests < 1 or p_max_requests > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limit_buckets as existing (
    bucket_key, request_count, reset_at, touched_at
  ) values (
    p_bucket_key, 1, v_now + make_interval(secs => p_window_seconds), v_now
  )
  on conflict (bucket_key) do update set
    request_count = case
      when existing.reset_at <= v_now then 1
      else existing.request_count + 1
    end,
    reset_at = case
      when existing.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else existing.reset_at
    end,
    touched_at = v_now
  returning * into bucket;

  -- The key is stable per endpoint and hashed client, so cardinality is
  -- bounded by active clients. Opportunistically clear long-expired clients.
  if random() < 0.02 then
    delete from public.rate_limit_buckets
    where reset_at < v_now - interval '1 day';
  end if;

  return query select
    bucket.request_count <= p_max_requests,
    bucket.request_count,
    extract(epoch from bucket.reset_at)::bigint;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- The legacy schema called a newly filed claim "pending" while the current
-- product contract and audit event call that state "received". Normalize the
-- existing semantic equivalent before tightening the allowed state machine.
alter table public.claims drop constraint if exists claims_status_check;
update public.claims set status = 'received' where status = 'pending';
alter table public.claims alter column status set default 'received';
alter table public.claims add constraint claims_status_check
  check (status in ('received', 'reviewing', 'resolved', 'rejected'));

create table if not exists public.claim_events (
  id bigint generated always as identity primary key,
  claim_id text not null references public.claims(id) on delete cascade,
  event_type text not null check (event_type in ('received', 'notifications_dispatched', 'reviewing', 'resolved', 'rejected')),
  actor_user_id text references public.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_claim_events_claim_created on public.claim_events(claim_id, created_at);
alter table public.claim_events enable row level security;
alter table public.claim_events force row level security;
revoke all on public.claim_events from public, anon, authenticated;

create or replace function public.record_claim_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.claim_events (claim_id, event_type)
  values (new.id, 'received');
  return new;
end;
$$;

revoke all on function public.record_claim_received() from public, anon, authenticated;

drop trigger if exists claims_record_received on public.claims;
create trigger claims_record_received
after insert on public.claims
for each row execute function public.record_claim_received();

create or replace function public.moderate_claim(
  target_claim_id text,
  next_status text,
  moderator_user_id text,
  moderation_note text
)
returns setof public.claims
language plpgsql
security definer
set search_path = ''
as $$
begin
  if next_status not in ('reviewing', 'resolved', 'rejected') then
    raise exception 'invalid claim status';
  end if;
  if moderation_note is null or char_length(trim(moderation_note)) < 1
     or char_length(moderation_note) > 4000 then
    raise exception 'moderation note is required';
  end if;

  update public.claims set status = next_status where id = target_claim_id;
  if not found then raise exception 'claim not found'; end if;

  insert into public.claim_events (claim_id, event_type, actor_user_id, note)
  values (target_claim_id, next_status, moderator_user_id, moderation_note);

  return query select * from public.claims where id = target_claim_id;
end;
$$;

revoke all on function public.moderate_claim(text, text, text, text) from public, anon, authenticated;
grant execute on function public.moderate_claim(text, text, text, text) to service_role;
