import { spawnSync } from 'node:child_process';

// Wrangler provisions DB/BUCKET on the first deployment and writes their IDs
// into its config. Apply the versioned schema before reporting setup complete.
for (const args of [
  ['deploy'],
  ['d1', 'migrations', 'apply', 'DB', '--remote'],
]) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    stdio: 'inherit', env: {...process.env, CI: 'true'},
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Anchor deployed and database migrations applied.');
