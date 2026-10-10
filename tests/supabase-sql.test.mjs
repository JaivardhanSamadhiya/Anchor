import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const A = 'e54b4d7e-a66a-4c04-ad72-10b23c8d4cc0';
const B = '37d11f44-57df-4a6d-bde5-df977714bcb3';
const FILE = '60c95d0a-6d4a-4ac6-9b2b-393306332fc0';
const FILE2 = '5c1e9940-d079-4ceb-94b1-c53f7a814feb';
const empty = () => ({ version: 1, lang: 'en', county: 'santa-clara', personal: { notices: [], events: [] } });
const migration = await readFile(new URL('../supabase/migrations/202610100001_anchor_accounts.sql', import.meta.url), 'utf8');

// Real Postgres runs the production migration. Only Supabase's supplied Auth
// and Storage schemas are stubbed; policies, locks, grants, and RPCs are real.
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb, unique(bucket_id, name));
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name, '/')
    $$;
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(migration);
  return db;
}
async function caller(db, id, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}
async function admin(db) { await db.exec('reset role'); }
async function rpc(db, name, values) {
  const placeholders = values.map((_, i) => '$' + (i + 1)).join(',');
  const result = await db.query(`select public.${name}(${placeholders}) as result`, values);
  return result.rows[0].result;
}
async function save(db, id, state, revision) {
  return rpc(db, 'anchor_save_workspace', [id, JSON.stringify(state), revision]);
}

test('Supabase Postgres migration enforces ownership, revisions, validation, and private evidence lifecycle', async (t) => {
  const db = await database();
  t.after(() => db.close());
  let path;
  let revision = 0;

  await t.test('anonymous roles have no workspace or RPC access', async () => {
    await caller(db, null, 'anon');
    await assert.rejects(db.query('select * from public.anchor_workspaces'), /permission denied/);
    await assert.rejects(save(db, A, empty(), 0), /permission denied/);
    await caller(db, null);
    await assert.rejects(save(db, A, empty(), 0), /authentication_required/);
  });

  await t.test('database validation rejects samples, unsafe fields, missing facts, and unbounded values', async () => {
    await admin(db);
    const notice = { id: 'n1', title: 'Review', sourceText: 'source', deadlines: [], requests: [], warnings: [] };
    for (const state of [
      { ...empty(), demo: {} },
      { ...empty(), county: 'other' },
      { ...empty(), personal: { notices: [{ ...notice, isDemo: true }], events: [] } },
      { ...empty(), personal: { notices: [{ ...notice, sourceText: 'x'.repeat(500001) }], events: [] } },
      { ...empty(), personal: { notices: [notice, notice], events: [] } },
      JSON.parse('{"version":1,"lang":"en","county":"santa-clara","personal":{"notices":[],"events":[],"__proto__":{}}}'),
    ]) {
      const result = await db.query('select public.anchor_valid_workspace($1::jsonb) as valid', [JSON.stringify(state)]);
      assert.equal(result.rows[0].valid, false);
    }
    await caller(db, A);
    await assert.rejects(save(db, A, { ...empty(), version: 2 }, 0), /invalid_workspace/);
    await assert.rejects(save(db, A, empty(), -1), /invalid_revision/);
  });

  await t.test('first save and later saves compare the expected revision atomically', async () => {
    await caller(db, A);
    assert.deepEqual(await save(db, A, empty(), 0), { revision: 1 });
    assert.deepEqual(await save(db, A, { ...empty(), lang: 'es' }, 0), { conflict: true, revision: 1 });
    const result = await save(db, A, { ...empty(), lang: 'es' }, 1);
    revision = result.revision;
    assert.equal(revision, 2);
    await assert.rejects(db.query('update public.anchor_workspaces set revision = 100'), /permission denied/);
  });

  await t.test('another resident cannot read, write, or spoof the first account', async () => {
    await caller(db, B);
    assert.equal((await db.query('select * from public.anchor_workspaces')).rows.length, 0);
    await assert.rejects(save(db, A, empty(), revision), /account_changed/);
    assert.deepEqual(await save(db, B, empty(), 0), { revision: 1 });
    await caller(db, A);
    assert.deepEqual((await db.query('select user_id from public.anchor_workspaces')).rows.map((row) => row.user_id), [A]);
  });

  await t.test('private storage requires a reserved owner path and verified metadata', async () => {
    await caller(db, A);
    const reservation = await rpc(db, 'anchor_reserve_attachment', [A, FILE, 'proof.txt', 'text/plain', 5]);
    path = reservation.path;
    assert.ok(path.startsWith(A + '/' + FILE + '/'));
    assert.equal(reservation.status, 'pending');
    await assert.rejects(rpc(db, 'anchor_commit_attachment', [A, FILE, path]), /attachment_not_ready/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values ('anchor-documents',$1,$2::jsonb)", [B + '/' + FILE + '/' + FILE2, '{"size":5,"mimetype":"text/plain"}']), /row.level.security/);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values ('anchor-documents',$1,$2::jsonb)", [path, '{"size":6,"mimetype":"text/plain"}']);
    await assert.rejects(rpc(db, 'anchor_commit_attachment', [A, FILE, path]), /invalid_attachment/);
    await db.query('update storage.objects set metadata=$1::jsonb where name=$2', ['{"size":5,"mimetype":"text/plain"}', path]);
    const committed = await rpc(db, 'anchor_commit_attachment', [A, FILE, path]);
    assert.equal(committed.size, 5);
    const retry = await rpc(db, 'anchor_reserve_attachment', [A, FILE, 'proof.txt', 'text/plain', 5]);
    assert.equal(retry.status, 'ready');
    const update = await db.query('update storage.objects set metadata=$1::jsonb where name=$2 returning name', ['{"size":99,"mimetype":"text/plain"}', path]);
    assert.equal(update.rows.length, 0, 'A ready receipt cannot be overwritten through Storage');
    await assert.rejects(rpc(db, 'anchor_reserve_attachment', [A, FILE, 'different.txt', 'text/plain', 5]), /attachment_immutable/);
  });

  await t.test('files and attachment references cannot cross account boundaries', async () => {
    await caller(db, B);
    assert.equal((await db.query('select * from public.anchor_attachments')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects where name=$1', [path])).rows.length, 0);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [path])).rows.length, 0);
    const referenced = empty();
    referenced.personal.events.push({ id: 'e1', kind: 'receipt', title: 'Proof', date: '2026-10-10', attachmentId: FILE });
    await assert.rejects(save(db, B, referenced, 1), /attachment_not_ready/);
    await caller(db, A);
    const result = await save(db, A, referenced, revision);
    revision = result.revision;
    await assert.rejects(rpc(db, 'anchor_begin_attachment_delete', [A, FILE]), /attachment_referenced/);
  });

  await t.test('clear keeps a revision tombstone and removes only the marked evidence', async () => {
    await caller(db, A);
    const cleared = await rpc(db, 'anchor_clear_workspace', [A]);
    assert.equal(cleared.revision, revision + 1);
    assert.deepEqual(cleared.files, [{ id: FILE, path }]);
    assert.equal((await db.query('select state from public.anchor_workspaces')).rows[0].state, null);
    assert.deepEqual(await save(db, A, empty(), 0), { conflict: true, revision: cleared.revision });
    await assert.rejects(rpc(db, 'anchor_finish_attachment_delete', [A, FILE, path]), /attachment_not_ready/);
    await db.query('delete from storage.objects where name=$1', [path]);
    assert.deepEqual(await rpc(db, 'anchor_finish_attachment_delete', [A, FILE, path]), { deleted: true });
    assert.equal((await db.query('select * from public.anchor_attachments')).rows.length, 0);
    const newFile = await rpc(db, 'anchor_reserve_attachment', [A, FILE, 'proof.txt', 'text/plain', 5]);
    assert.notEqual(newFile.path, path);
    await rpc(db, 'anchor_finish_attachment_delete', [A, FILE, path]);
    assert.equal((await db.query('select path from public.anchor_attachments')).rows[0].path, newFile.path);
    revision = cleared.revision;
  });

  await t.test('quota and MIME/size bounds are enforced even outside the browser', async () => {
    await caller(db, A);
    await assert.rejects(rpc(db, 'anchor_reserve_attachment', [A, FILE2, 'script.html', 'text/html', 5]), /invalid_attachment/);
    await assert.rejects(rpc(db, 'anchor_reserve_attachment', [A, FILE2, 'huge.pdf', 'application/pdf', 20971521]), /invalid_attachment/);
    await assert.rejects(rpc(db, 'anchor_reserve_attachment', [A, FILE2, '../proof.txt', 'text/plain', 5]), /invalid_attachment/);
    await admin(db);
    await db.query(`insert into public.anchor_attachments(user_id,id,name,type,size,path)
      select $1::uuid, id, 'proof.txt', 'text/plain', 1, $1 || '/' || id::text || '/' || gen_random_uuid()::text
      from (select gen_random_uuid() id from generate_series(1,199)) files`, [A]);
    await caller(db, A);
    await assert.rejects(rpc(db, 'anchor_reserve_attachment', [A, FILE2, 'proof.txt', 'text/plain', 5]), /file_limit/);
  });

  await t.test('bucket remains private and bounded', async () => {
    await admin(db);
    const bucket = (await db.query("select * from storage.buckets where id='anchor-documents'")).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 20971520);
    assert.ok(!bucket.allowed_mime_types.includes('text/html'));
  });
});
