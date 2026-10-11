/** Build a static, subdirectory-safe site. No account data or server credentials
 * enter this process: all permitted inputs are explicitly public configuration.
 */
import { build } from 'esbuild';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'web');
const output = resolve(root, 'dist/pages');

export function publicConfiguration(env) {
  const supabaseUrl = (env.PUBLIC_SUPABASE_URL || '').trim();
  const supabasePublishableKey = (env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const googleClientId = (env.PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  const basePath = (env.PUBLIC_BASE_PATH || '/Anchor/').trim();

  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) {
    throw new Error('PUBLIC_BASE_PATH must be / or a path such as /Anchor/.');
  }
  if (Boolean(supabaseUrl) !== Boolean(supabasePublishableKey)) {
    throw new Error(
      'Set both PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY, or neither.',
    );
  }
  if (supabaseUrl) {
    let url;
    try {
      url = new URL(supabaseUrl);
    } catch {
      throw new Error('PUBLIC_SUPABASE_URL must be a valid project origin.');
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const hostnameAllowed =
      local ||
      url.hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
    if (
      !hostnameAllowed ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error(
        'PUBLIC_SUPABASE_URL must be an HTTPS project origin (loopback HTTP is allowed for tests).',
      );
    }
  }
  if (supabasePublishableKey) {
    // New publishable keys are preferred; legacy anon JWTs are supported. Never
    // accept service_role JWTs or sb_secret_ keys in a static browser bundle.
    if (supabasePublishableKey.startsWith('sb_secret_')) {
      throw new Error('A Supabase secret key cannot be published. Use a publishable key.');
    }
    const modern = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(supabasePublishableKey);
    let legacyAnon = false;
    if (!modern) {
      try {
        const parts = supabasePublishableKey.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        legacyAnon = parts.length === 3 && payload.role === 'anon';
      } catch {
        /* Invalid keys fail the allowlist below. */
      }
    }
    if (!modern && !legacyAnon)
      throw new Error(
        'PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key or a legacy anon key.',
      );
  }
  if (googleClientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
    throw new Error('PUBLIC_GOOGLE_CLIENT_ID must be a Google Web client ID, never its secret.');
  }
  return { supabaseUrl, supabasePublishableKey, googleClientId, basePath };
}

export async function buildPages(env = process.env, { modulesOnly = false } = {}) {
  const config = publicConfiguration(env);
  for (const file of ['index.html', 'vendor/pdfjs.mjs', 'vendor/lang/eng.traineddata.gz'])
    await access(resolve(web, file));

  // Generate adjacent ES modules for both the static development server and the
  // final Pages copy. TypeScript remains canonical; emitted files are ignored.
  await build({
    absWorkingDir: root,
    entryPoints: {
      continuity: 'src/domain/continuity.ts',
      'continuity-view': 'src/ui/continuity-view.ts',
      'supabase-transport': 'src/infrastructure/supabase-transport.ts',
      'next-step-cue': 'src/ui/next-step-cue.ts',
      'form-assistance': 'src/domain/form-assistance.ts',
      'form-assistance-view': 'src/ui/form-assistance-view.ts',
      'form-documents': 'src/infrastructure/form-documents.ts',
      'program-assistant': 'src/domain/program-assistant.ts',
      'google-calendar': 'src/domain/google-calendar.ts',
      'google-calendar-client': 'src/infrastructure/google-calendar-client.ts',
      config: 'src/config.ts',
    },
    outdir: web,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    legalComments: 'linked',
    define: { __ANCHOR_PUBLIC_CONFIG__: JSON.stringify(config) },
  });

  if (!modulesOnly) {
    // Only this known generated directory is replaced. Canonical assets stay in web.
    if (output !== resolve(root, 'dist', 'pages')) throw new Error('Unsafe Pages output path.');
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(web, output, { recursive: true, dereference: false });
    // SDK source files do not all retain license headers after bundling. Ship
    // each package's original attribution alongside the existing reader licenses.
    const licenseFiles = [
      ...[
        'supabase-js',
        'auth-js',
        'functions-js',
        'postgrest-js',
        'realtime-js',
        'storage-js',
      ].map((name) => [
        `@supabase/${name}/LICENSE`,
        `${name === 'supabase-js' ? name : `supabase-${name}`}-LICENSE.txt`,
      ]),
      ['@supabase/phoenix/LICENSE.md', 'supabase-phoenix-LICENSE.txt'],
      ['iceberg-js/LICENSE', 'iceberg-js-LICENSE.txt'],
      ['tslib/LICENSE.txt', 'tslib-LICENSE.txt'],
    ];
    for (const [source, filename] of licenseFiles) {
      await cp(resolve(root, 'node_modules', source), resolve(output, 'vendor/licenses', filename));
    }
    if (config.supabaseUrl) {
      const indexFile = resolve(output, 'index.html');
      const html = await readFile(indexFile, 'utf8');
      if (!/connect-src\s+[^;]+;/.test(html))
        throw new Error('The website must declare its connect-src CSP.');
      // Allow this project alone, rather than every Supabase host or every HTTPS
      // destination. Document reader traffic remains on the same site origin.
      const origin = new URL(config.supabaseUrl).origin;
      await writeFile(
        indexFile,
        html.replace(/connect-src\s+([^;]+);/, `connect-src $1 ${origin};`),
      );
    }
    await writeFile(resolve(output, '.nojekyll'), '');
    console.log(
      `Pages artifact: dist/pages (${config.supabaseUrl && config.googleClientId ? 'account configuration supplied' : 'device-only until account setup'}).`,
    );
  } else {
    console.log('Browser TypeScript modules generated in web/.');
  }
  return config;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await buildPages(process.env, { modulesOnly: process.argv.includes('--modules-only') });
}
