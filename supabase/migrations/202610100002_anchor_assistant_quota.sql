-- Durable per-account cloud assistant quota. Only counters/timestamps are
-- stored; questions, model answers, notices, and profile data are not recorded.
begin;

create table if not exists public.anchor_assistant_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started_at timestamptz not null default clock_timestamp(),
  minute_count integer not null default 0 check (minute_count >= 0),
  hour_started_at timestamptz not null default clock_timestamp(),
  hour_count integer not null default 0 check (hour_count >= 0)
);
alter table public.anchor_assistant_quotas enable row level security;
revoke all on public.anchor_assistant_quotas from public, anon, authenticated;

create or replace function public.anchor_assistant_consume_quota()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  moment timestamptz := clock_timestamp();
  usage public.anchor_assistant_quotas%rowtype;
  wait_seconds integer := 0;
begin
  if caller is null then raise exception 'authentication_required'; end if;
  insert into public.anchor_assistant_quotas(user_id, minute_started_at, hour_started_at)
    values (caller, moment, moment) on conflict (user_id) do nothing;
  -- Row locks serialize simultaneous calls from every Edge Function instance.
  select * into usage from public.anchor_assistant_quotas where user_id = caller for update;
  if moment >= usage.minute_started_at + interval '1 minute' then
    usage.minute_started_at := moment;
    usage.minute_count := 0;
  end if;
  if moment >= usage.hour_started_at + interval '1 hour' then
    usage.hour_started_at := moment;
    usage.hour_count := 0;
  end if;
  if usage.minute_count >= 8 then
    wait_seconds := greatest(wait_seconds, ceil(extract(epoch from usage.minute_started_at + interval '1 minute' - moment))::integer);
  end if;
  if usage.hour_count >= 40 then
    wait_seconds := greatest(wait_seconds, ceil(extract(epoch from usage.hour_started_at + interval '1 hour' - moment))::integer);
  end if;
  if wait_seconds > 0 then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', wait_seconds);
  end if;
  update public.anchor_assistant_quotas set
    minute_started_at = usage.minute_started_at,
    minute_count = usage.minute_count + 1,
    hour_started_at = usage.hour_started_at,
    hour_count = usage.hour_count + 1
    where user_id = caller;
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end $$;
revoke all on function public.anchor_assistant_consume_quota() from public, anon;
grant execute on function public.anchor_assistant_consume_quota() to authenticated;
comment on function public.anchor_assistant_consume_quota() is 'Atomic cloud assistant request limit: eight per minute and forty per hour for the authenticated account.';

commit;
