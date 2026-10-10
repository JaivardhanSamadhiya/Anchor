-- Anchor's hosted boundary: Supabase Auth identifies the resident; Postgres RLS
-- and private Storage policies authorize every row/object. No browser service
-- key is required. Run this migration once in Supabase's SQL editor or CLI.
begin;

-- Keep validation in the database so requests made outside the website cannot
-- upload practice examples, prototype fields, excessive nesting, or giant JSON.
create or replace function public.anchor_bounded_json(p_value jsonb, p_depth integer default 0)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  item record;
  child jsonb;
  kind text := jsonb_typeof(p_value);
begin
  if p_depth > 18 or p_value is null then return false; end if;
  if kind in ('null', 'boolean', 'number') then return true; end if;
  if kind = 'string' then return char_length(p_value #>> '{}') <= 500000; end if;
  if kind = 'array' then
    if jsonb_array_length(p_value) > 2000 then return false; end if;
    for child in select value from jsonb_array_elements(p_value) loop
      if not public.anchor_bounded_json(child, p_depth + 1) then return false; end if;
    end loop;
    return true;
  end if;
  if kind <> 'object' or (select count(*) from jsonb_object_keys(p_value)) > 150 then return false; end if;
  for item in select key, value from jsonb_each(p_value) loop
    if item.key in ('__proto__', 'constructor', 'prototype', 'demo') or char_length(item.key) > 100
       or (item.key = 'isDemo' and item.value = 'true'::jsonb)
       or not public.anchor_bounded_json(item.value, p_depth + 1) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.anchor_valid_workspace(p_state jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  personal jsonb;
  notice jsonb;
  event jsonb;
  ids text[] := array[]::text[];
  file_id text;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(p_state) key where key not in ('version', 'lang', 'county', 'personal')) then return false; end if;
  if p_state->'version' is distinct from '1'::jsonb or coalesce(p_state->>'lang', '') not in ('en', 'es')
     or coalesce(p_state->>'county', '') not in ('santa-clara', 'san-mateo') then return false; end if;
  personal := p_state->'personal';
  if jsonb_typeof(personal) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(personal) key where key not in ('notices', 'events')) then return false; end if;
  if jsonb_typeof(personal->'notices') is distinct from 'array' or jsonb_typeof(personal->'events') is distinct from 'array' then return false; end if;
  if jsonb_array_length(personal->'notices') > 100 or jsonb_array_length(personal->'events') > 2000 then return false; end if;
  for notice in select value from jsonb_array_elements(personal->'notices') loop
    if jsonb_typeof(notice) is distinct from 'object' or jsonb_typeof(notice->'id') is distinct from 'string'
       or jsonb_typeof(notice->'sourceText') is distinct from 'string' or jsonb_typeof(notice->'title') is distinct from 'string'
       or jsonb_typeof(notice->'deadlines') is distinct from 'array' or jsonb_typeof(notice->'requests') is distinct from 'array'
       or jsonb_typeof(notice->'warnings') is distinct from 'array' then return false; end if;
    if char_length(notice->>'id') not between 1 and 200 or (notice->>'id') = any(ids)
       or char_length(notice->>'sourceText') > 500000 or char_length(notice->>'title') > 500
       or jsonb_array_length(notice->'deadlines') > 200 or jsonb_array_length(notice->'requests') > 200
       or jsonb_array_length(notice->'warnings') > 200 then return false; end if;
    ids := array_append(ids, notice->>'id');
    file_id := notice->>'originalAttachmentId';
    if file_id is not null and file_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  end loop;
  for event in select value from jsonb_array_elements(personal->'events') loop
    if jsonb_typeof(event) is distinct from 'object' or jsonb_typeof(event->'id') is distinct from 'string'
       or jsonb_typeof(event->'kind') is distinct from 'string' or jsonb_typeof(event->'title') is distinct from 'string'
       or jsonb_typeof(event->'date') is distinct from 'string' then return false; end if;
    if char_length(event->>'id') not between 1 and 200 or char_length(event->>'kind') > 50
       or char_length(event->>'title') > 2000 or char_length(event->>'date') > 50 then return false; end if;
    file_id := event->>'attachmentId';
    if file_id is not null and file_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  end loop;
  return public.anchor_bounded_json(p_state) and octet_length(p_state::text) <= 1500000;
end $$;

-- References may appear in richer notice/evidence fields. Recurse through JSON
-- rather than only checking a top-level array, keeping future features safe.
create or replace function public.anchor_file_references(p_value jsonb)
returns setof uuid language plpgsql immutable set search_path = pg_catalog, public as $$
declare item record; child jsonb; file_id text;
begin
  if p_value is null then return; end if;
  if jsonb_typeof(p_value) = 'object' then
    for item in select key, value from jsonb_each(p_value) loop
      if item.key in ('attachmentId', 'originalAttachmentId') and item.value <> 'null'::jsonb then
        file_id := item.value #>> '{}';
        if jsonb_typeof(item.value) <> 'string' or file_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then raise exception 'invalid_attachment' using errcode = '23514'; end if;
        return next file_id::uuid;
      elsif jsonb_typeof(item.value) in ('object', 'array') then
        return query select * from public.anchor_file_references(item.value);
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for child in select value from jsonb_array_elements(p_value) loop
      return query select * from public.anchor_file_references(child);
    end loop;
  end if;
  return;
end $$;

create table public.anchor_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb,
  revision bigint not null default 0 check (revision >= 0 and revision <= 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint anchor_workspace_shape check (state is null or public.anchor_valid_workspace(state))
);

create table public.anchor_attachments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 180 and name !~ '[\\/[:cntrl:]]'),
  type text not null check (type in ('application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff')),
  size bigint not null check (size between 1 and 20971520),
  path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleting')),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint anchor_owner_path check (
    split_part(path, '/', 1) = user_id::text and split_part(path, '/', 2) = id::text
    and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  )
);
create index anchor_attachments_owner_status on public.anchor_attachments(user_id, status);

alter table public.anchor_workspaces enable row level security;
alter table public.anchor_workspaces force row level security;
alter table public.anchor_attachments enable row level security;
alter table public.anchor_attachments force row level security;

create policy anchor_workspace_read on public.anchor_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);
create policy anchor_attachment_read on public.anchor_attachments
  for select to authenticated using ((select auth.uid()) = user_id);
-- All writes pass through checked RPCs. RLS alone cannot guarantee revision
-- checks, immutable evidence, upload quotas, or atomic clear operations.
revoke all on public.anchor_workspaces, public.anchor_attachments from public, anon, authenticated;
grant select on public.anchor_workspaces, public.anchor_attachments to authenticated;

-- Every RPC pins the account observed by the caller to the bearer identity.
-- If another tab switches the SDK session before dispatch, the RPC rejects it.
create or replace function public.anchor_require_account(p_account_id uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare resident uuid := auth.uid();
begin
  if resident is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_account_id is distinct from resident then raise exception 'account_changed' using errcode = '42501'; end if;
  return resident;
end $$;

create or replace function public.anchor_save_workspace(p_account_id uuid, p_state jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare resident uuid; current_revision bigint; file_id uuid;
begin
  resident := public.anchor_require_account(p_account_id);
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 9007199254740990
    then raise exception 'invalid_revision' using errcode = '23514'; end if;
  if not public.anchor_valid_workspace(p_state) then raise exception 'invalid_workspace' using errcode = '23514'; end if;
  -- Create-once then lock serializes first saves as well as existing rows.
  insert into public.anchor_workspaces(user_id) values (resident) on conflict do nothing;
  select revision into current_revision from public.anchor_workspaces where user_id = resident for update;
  if current_revision <> p_expected_revision then
    return jsonb_build_object('conflict', true, 'revision', current_revision);
  end if;
  for file_id in select distinct * from public.anchor_file_references(p_state->'personal') loop
    if not exists(select 1 from public.anchor_attachments where user_id = resident and id = file_id and status = 'ready')
      then raise exception 'attachment_not_ready' using errcode = '23514'; end if;
  end loop;
  update public.anchor_workspaces set state = p_state, revision = revision + 1, updated_at = now() where user_id = resident;
  return jsonb_build_object('revision', current_revision + 1);
end $$;

create or replace function public.anchor_reserve_attachment(p_account_id uuid, p_id uuid, p_name text, p_type text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare resident uuid; file public.anchor_attachments%rowtype; object_path text;
begin
  resident := public.anchor_require_account(p_account_id);
  if p_id is null or p_name is null or char_length(p_name) not between 1 and 180 or p_name ~ '[\\/[:cntrl:]]'
     or p_type is null or p_type not in ('application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff')
     or p_size is null or p_size not between 1 and 20971520 then raise exception 'invalid_attachment' using errcode = '23514'; end if;
  insert into public.anchor_workspaces(user_id) values (resident) on conflict do nothing;
  perform 1 from public.anchor_workspaces where user_id = resident for update;
  select * into file from public.anchor_attachments where user_id = resident and id = p_id for update;
  if found then
    -- Evidence IDs are immutable. A retry may finish its original pending upload;
    -- another device cannot silently replace a receipt already used by a plan.
    if file.status = 'deleting' or file.name <> p_name or file.type <> p_type or file.size <> p_size
      then raise exception 'attachment_immutable' using errcode = '23514'; end if;
    return jsonb_build_object('id', file.id, 'path', file.path, 'status', file.status);
  end if;
  if (select count(*) from public.anchor_attachments where user_id = resident) >= 200
    then raise exception 'file_limit' using errcode = '23514'; end if;
  object_path := resident::text || '/' || p_id::text || '/' || gen_random_uuid()::text;
  insert into public.anchor_attachments(user_id, id, name, type, size, path)
    values (resident, p_id, p_name, p_type, p_size, object_path);
  return jsonb_build_object('id', p_id, 'path', object_path, 'status', 'pending');
end $$;

create or replace function public.anchor_commit_attachment(p_account_id uuid, p_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare resident uuid; file public.anchor_attachments%rowtype; object_metadata jsonb;
begin
  resident := public.anchor_require_account(p_account_id);
  perform 1 from public.anchor_workspaces where user_id = resident for update;
  select * into file from public.anchor_attachments where user_id = resident and id = p_id and path = p_path for update;
  if not found or file.status = 'deleting' then raise exception 'file_not_found' using errcode = '23514'; end if;
  select metadata into object_metadata from storage.objects where bucket_id = 'anchor-documents' and name = file.path;
  if object_metadata is null or coalesce(object_metadata->>'size', '') !~ '^[0-9]+$'
    then raise exception 'attachment_not_ready' using errcode = '23514'; end if;
  if (object_metadata->>'size')::bigint <> file.size or object_metadata->>'mimetype' is distinct from file.type
    then raise exception 'invalid_attachment' using errcode = '23514'; end if;
  update public.anchor_attachments set status = 'ready' where user_id = resident and id = p_id;
  return jsonb_build_object('id', file.id, 'name', file.name, 'type', file.type, 'size', file.size);
end $$;

create or replace function public.anchor_begin_attachment_delete(p_account_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare resident uuid; file public.anchor_attachments%rowtype; workspace jsonb;
begin
  resident := public.anchor_require_account(p_account_id);
  select state into workspace from public.anchor_workspaces where user_id = resident for update;
  if exists(select 1 from public.anchor_file_references(workspace->'personal') id where id = p_id)
    then raise exception 'attachment_referenced' using errcode = '23514'; end if;
  select * into file from public.anchor_attachments where user_id = resident and id = p_id for update;
  if not found then raise exception 'file_not_found' using errcode = '23514'; end if;
  update public.anchor_attachments set status = 'deleting' where user_id = resident and id = p_id;
  return jsonb_build_object('id', file.id, 'path', file.path);
end $$;

create or replace function public.anchor_finish_attachment_delete(p_account_id uuid, p_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare resident uuid;
begin
  resident := public.anchor_require_account(p_account_id);
  perform 1 from public.anchor_workspaces where user_id = resident for update;
  -- Check the owner row first so an arbitrary path cannot become an oracle
  -- for another resident's private object existence.
  perform 1 from public.anchor_attachments where user_id = resident and id = p_id and path = p_path and status = 'deleting' for update;
  if not found then return jsonb_build_object('deleted', true); end if;
  if exists(select 1 from storage.objects where bucket_id = 'anchor-documents' and name = p_path)
    then raise exception 'attachment_not_ready' using errcode = '23514'; end if;
  -- Exact path prevents delayed cleanup from deleting a new attachment that
  -- happens to reuse an ID after another device cleared the old workspace.
  delete from public.anchor_attachments where user_id = resident and id = p_id and path = p_path and status = 'deleting';
  return jsonb_build_object('deleted', true);
end $$;

create or replace function public.anchor_clear_workspace(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare resident uuid; new_revision bigint; files jsonb;
begin
  resident := public.anchor_require_account(p_account_id);
  insert into public.anchor_workspaces(user_id) values (resident) on conflict do nothing;
  perform 1 from public.anchor_workspaces where user_id = resident for update;
  update public.anchor_workspaces set state = null, revision = revision + 1, updated_at = now()
    where user_id = resident returning revision into new_revision;
  update public.anchor_attachments set status = 'deleting' where user_id = resident;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path)), '[]'::jsonb) into files
    from public.anchor_attachments where user_id = resident;
  -- Keep a null-state tombstone. Resetting revision to zero would let stale
  -- devices overwrite a workspace created after a deletion (an ABA conflict).
  return jsonb_build_object('revision', new_revision, 'files', files);
end $$;

-- Private bucket: the website downloads through the authenticated Storage SDK.
-- No public URLs are generated. Supabase's API owns storage.objects mutations.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('anchor-documents', 'anchor-documents', false, 20971520,
  array['application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy anchor_document_read on storage.objects for select to authenticated
using (bucket_id = 'anchor-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.anchor_attachments file where file.user_id = (select auth.uid()) and file.path = storage.objects.name and file.status in ('pending', 'ready', 'deleting')));
create policy anchor_document_insert on storage.objects for insert to authenticated
with check (bucket_id = 'anchor-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.anchor_attachments file where file.user_id = (select auth.uid()) and file.path = storage.objects.name and file.status = 'pending'));
create policy anchor_document_update on storage.objects for update to authenticated
using (bucket_id = 'anchor-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.anchor_attachments file where file.user_id = (select auth.uid()) and file.path = storage.objects.name and file.status = 'pending'))
with check (bucket_id = 'anchor-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.anchor_attachments file where file.user_id = (select auth.uid()) and file.path = storage.objects.name and file.status = 'pending'));
create policy anchor_document_delete on storage.objects for delete to authenticated
using (bucket_id = 'anchor-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.anchor_attachments file where file.user_id = (select auth.uid()) and file.path = storage.objects.name and file.status = 'deleting'));

-- Explicit execute grants: Postgres normally gives PUBLIC function execution.
revoke all on function public.anchor_bounded_json(jsonb, integer) from public, anon, authenticated;
revoke all on function public.anchor_valid_workspace(jsonb) from public, anon, authenticated;
revoke all on function public.anchor_file_references(jsonb) from public, anon, authenticated;
revoke all on function public.anchor_require_account(uuid) from public, anon, authenticated;
revoke all on function public.anchor_save_workspace(uuid, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.anchor_reserve_attachment(uuid, uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.anchor_commit_attachment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.anchor_begin_attachment_delete(uuid, uuid) from public, anon, authenticated;
revoke all on function public.anchor_finish_attachment_delete(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.anchor_clear_workspace(uuid) from public, anon, authenticated;
grant execute on function public.anchor_save_workspace(uuid, jsonb, bigint) to authenticated;
grant execute on function public.anchor_reserve_attachment(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function public.anchor_commit_attachment(uuid, uuid, text) to authenticated;
grant execute on function public.anchor_begin_attachment_delete(uuid, uuid) to authenticated;
grant execute on function public.anchor_finish_attachment_delete(uuid, uuid, text) to authenticated;
grant execute on function public.anchor_clear_workspace(uuid) to authenticated;
commit;
