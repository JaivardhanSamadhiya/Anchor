// Build-time only. Runtime document processing uses these same-origin assets.
import { build } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'web', 'vendor');
const modules = join(root, 'node_modules');
const languageURL = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz';
await mkdir(target, { recursive: true });

await build({
  entryPoints: [join(modules, 'pdfjs-dist', 'build', 'pdf.mjs')],
  outfile: join(target, 'pdfjs.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
});
await build({
  stdin: {
    contents:
      "import Tesseract from 'tesseract.js'; export const createWorker = Tesseract.createWorker; export const PSM = Tesseract.PSM;",
    resolveDir: root,
    sourcefile: 'anchor-ocr-entry.js',
    loader: 'js',
  },
  outfile: join(target, 'tesseract.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
});
await copyFile(
  join(modules, 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
  join(target, 'pdf.worker.mjs'),
);
await copyFile(
  join(modules, 'tesseract.js', 'web', 'worker.min.js'),
  join(target, 'tesseract-worker.min.js'),
);
await copyFile(
  join(modules, 'tesseract.js', 'web', 'worker.min.js.LICENSE.txt'),
  join(target, 'tesseract-worker.min.js.LICENSE.txt'),
);

await mkdir(join(target, 'core'), { recursive: true });
for (const name of await readdir(join(modules, 'tesseract.js-core'))) {
  if (/^tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(name)) {
    await copyFile(join(modules, 'tesseract.js-core', name), join(target, 'core', name));
  }
}

async function copyDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.isDirectory())
      await copyDirectory(join(source, item.name), join(destination, item.name));
    else if (item.isFile()) await copyFile(join(source, item.name), join(destination, item.name));
  }
}
await copyDirectory(join(modules, 'pdfjs-dist', 'cmaps'), join(target, 'cmaps'));
await copyDirectory(join(modules, 'pdfjs-dist', 'standard_fonts'), join(target, 'standard_fonts'));

await mkdir(join(target, 'lang'), { recursive: true });
const traineddata = join(target, 'lang', 'eng.traineddata.gz');
let languageData;
try {
  languageData = await readFile(traineddata);
} catch {
  /* first vendor build */
}
if (
  !languageData ||
  languageData.byteLength < 100_000 ||
  languageData[0] !== 0x1f ||
  languageData[1] !== 0x8b
) {
  process.stdout.write('Downloading the English Tesseract language file at build time…\n');
  const response = await fetch(languageURL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok)
    throw new Error(
      `English OCR download failed (${response.status}). Retry npm run vendor while online.`,
    );
  languageData = Buffer.from(await response.arrayBuffer());
  if (
    languageData.byteLength < 100_000 ||
    languageData.byteLength > 30_000_000 ||
    languageData[0] !== 0x1f ||
    languageData[1] !== 0x8b
  ) {
    throw new Error('The English OCR download was not the expected compressed language file.');
  }
  await writeFile(traineddata, languageData);
}

const licenseFiles = [
  ['pdfjs-dist', 'LICENSE'],
  ['tesseract.js', 'LICENSE.md'],
  ['tesseract.js-core', 'LICENSE'],
];
await mkdir(join(target, 'licenses'), { recursive: true });
for (const [name, file] of licenseFiles) {
  const source = join(modules, name, file);
  try {
    await copyFile(source, join(target, 'licenses', `${name}-LICENSE.txt`));
  } catch {
    // Package revisions may change a license filename, so use a matching package file.
    const match = (await readdir(join(modules, name))).find((value) =>
      /^license(?:\.|$)/i.test(value),
    );
    if (!match)
      throw new Error(`No license file found for ${name}; keep attribution before distributing.`);
    await copyFile(join(modules, name, match), join(target, 'licenses', `${name}-LICENSE.txt`));
  }
}
await writeFile(
  join(target, 'licenses', 'eng-traineddata.txt'),
  `English language data distributed by the Tesseract.js project\nSource: ${languageURL}\nRepository: https://github.com/naptha/tessdata\nLicense: Apache-2.0 (https://github.com/naptha/tessdata/blob/gh-pages/LICENSE)\nSHA-256: ${createHash('sha256').update(languageData).digest('hex')}\n`,
);
// Include the complete Apache 2.0 license, not only a link to the traineddata license.
await copyFile(
  join(modules, 'pdfjs-dist', 'LICENSE'),
  join(target, 'licenses', 'eng-Apache-2.0-LICENSE.txt'),
);

async function listAssets(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isDirectory()) result.push(...(await listAssets(file)));
    else if (item.isFile() && item.name !== 'manifest.json') {
      const info = await stat(file);
      result.push({
        path: `${relative(join(root, 'web'), file).replaceAll('\\', '/')}`,
        bytes: info.size,
      });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  packages: { 'pdfjs-dist': '4.10.38', 'tesseract.js': '6.0.1', 'tesseract.js-core': '6.0.0' },
  ocrLanguage: 'eng',
  languageSource: languageURL,
  languageSha256: createHash('sha256').update(languageData).digest('hex'),
  assets: await listAssets(target),
};
await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(
  `Vendored ${manifest.assets.length} local assets (${(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1024 / 1024).toFixed(1)} MB). No runtime CDN is needed.\n`,
);
