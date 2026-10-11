/**
 * Deploy only Anchor's public-program assistant and its idempotent quota SQL.
 * SUPABASE_ACCESS_TOKEN is a server-side Management API credential, not an
 * anon/publishable/service-role key. Never log it or provider response bodies.
 */
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_REF = 'rufgpepnoxpbpwmfhwzq';
const CLI_VERSION = '2.120.0';
const repository = fileURLToPath(new URL('../', import.meta.url));
class DeploymentError extends Error {}

export async function deployAssistant({
  token = process.env.SUPABASE_ACCESS_TOKEN,
  send = fetch,
  run = runCli,
  report = console.log,
} = {}) {
  if (!token || token.length < 20 || /^(?:sb_publishable_|sb_secret_|eyJ)/.test(token))
    throw new DeploymentError(
      'Add the Supabase personal access token as the repository Actions secret SUPABASE_ACCESS_TOKEN.',
    );
  const version = (await run(['--version'], token)).trim().replace(/^v/, '');
  if (version !== CLI_VERSION)
    throw new DeploymentError(`Install the pinned Supabase CLI ${CLI_VERSION} before deployment.`);
  const query = await readFile(
    new URL('../supabase/migrations/202610100002_anchor_assistant_quota.sql', import.meta.url),
    'utf8',
  );
  const migration = await send(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, read_only: false }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!migration.ok) {
    await migration.body?.cancel();
    throw new DeploymentError(
      `Assistant quota deployment was rejected (HTTP ${migration.status}). Check the token's project and database-write permission.`,
    );
  }
  await migration.body?.cancel();
  report('Assistant quota migration applied.');
  await run(
    [
      'functions',
      'deploy',
      'anchor-assistant',
      '--project-ref',
      PROJECT_REF,
      '--no-verify-jwt',
      '--use-api',
    ],
    token,
  );
  report('Anchor assistant function deployed. It verifies each caller through Supabase Auth.');
  report(
    'Gemini uses the existing GEMINI_API_KEY Edge Function secret. Verify a Gemini response badge in Anchor after signing in.',
  );
}

function runCli(args, token) {
  return new Promise((resolveRun, reject) => {
    // Argument arrays prevent shell interpolation; credentials live only in
    // the process environment. CLI output is captured rather than echoed.
    const child = spawn('supabase', args, {
      cwd: repository,
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      size = 0;
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) child.kill();
      else output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) child.kill();
    });
    child.on('error', () =>
      reject(
        new DeploymentError('Supabase CLI could not start. Install the pinned CLI and retry.'),
      ),
    );
    child.on('close', (code) =>
      code === 0 && size <= 65536
        ? resolveRun(output)
        : reject(
            new DeploymentError(
              `Supabase CLI deployment failed (exit ${code ?? 'interrupted'}). Check project access and function configuration in Supabase.`,
            ),
          ),
    );
  });
}

// Importable for dry-run transport tests; executable only when called directly.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await deployAssistant();
  } catch (error) {
    // Network/provider failures can contain request metadata. Print only our
    // controlled errors; do not print stacks, tokens, SQL rows, or response text.
    console.error(
      error instanceof DeploymentError
        ? error.message
        : 'Assistant deployment could not finish. Check network access and Supabase project permissions, then retry.',
    );
    process.exitCode = 1;
  }
}
