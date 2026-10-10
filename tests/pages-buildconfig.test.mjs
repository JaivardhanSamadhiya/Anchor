import test from 'node:test';
import assert from 'node:assert/strict';
import { publicConfiguration } from '../scripts/build-pages.mjs';

const publicInputs = {
  PUBLIC_SUPABASE_URL: 'https://fictional-project.supabase.co',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fictional_public_identifier_only',
  PUBLIC_GOOGLE_CLIENT_ID: '12345-fictional.apps.googleusercontent.com',
  PUBLIC_BASE_PATH: '/Anchor/',
};

test('Pages can build without account inputs and only permits explicit public fields', () => {
  assert.deepEqual(publicConfiguration({ SUPABASE_SERVICE_ROLE_KEY: 'never-read', GOOGLE_CLIENT_SECRET: 'never-read' }), {
    supabaseUrl: '', supabasePublishableKey: '', googleClientId: '', basePath: '/Anchor/',
  });
  assert.deepEqual(Object.keys(publicConfiguration(publicInputs)).sort(), ['basePath', 'googleClientId', 'supabasePublishableKey', 'supabaseUrl']);
});

test('privileged Supabase keys never pass into the static build', () => {
  const serviceRole = [Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from('{"role":"service_role"}').toString('base64url'), 'fictional-signature'].join('.');
  for (const key of ['sb_secret_fictional_do_not_publish', serviceRole, 'unknown-key']) {
    assert.throws(() => publicConfiguration({ ...publicInputs, PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }), /publishable|anon/);
  }
  const anon = [Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from('{"role":"anon"}').toString('base64url'), 'fictional-signature'].join('.');
  assert.equal(publicConfiguration({ ...publicInputs, PUBLIC_SUPABASE_PUBLISHABLE_KEY: anon }).supabasePublishableKey, anon);
});

test('remote origins cannot inject credentials, path, query or insecure transport into CSP', () => {
  for (const url of ['http://example.com', 'https://name:password@example.com', 'https://example.com/private',
    'https://example.com/?key=value', 'https://example.com/#fragment', 'https://example.com;script-src',
    'https://example.com..invalid/', 'javascript:alert(1)', 'invalid']) {
    assert.throws(() => publicConfiguration({ ...publicInputs, PUBLIC_SUPABASE_URL: url }), /origin/);
  }
  assert.equal(publicConfiguration({ ...publicInputs, PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }).supabaseUrl, 'http://127.0.0.1:54321');
});

test('incomplete backend config and malformed repository base paths fail before emitting files', () => {
  assert.throws(() => publicConfiguration({ PUBLIC_SUPABASE_URL: publicInputs.PUBLIC_SUPABASE_URL }), /both/);
  assert.throws(() => publicConfiguration({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicInputs.PUBLIC_SUPABASE_PUBLISHABLE_KEY }), /both/);
  for (const path of ['Anchor/', '/Anchor', '/../../private/', '//example.com/', '/Anchor/?token=1', '/Anchor/#plan']) {
    assert.throws(() => publicConfiguration({ ...publicInputs, PUBLIC_BASE_PATH: path }), /BASE_PATH/);
  }
  assert.equal(publicConfiguration({ ...publicInputs, PUBLIC_BASE_PATH: '/' }).basePath, '/');
  assert.throws(() => publicConfiguration({ ...publicInputs, PUBLIC_GOOGLE_CLIENT_ID: 'a-client-secret' }), /client ID/);
});
