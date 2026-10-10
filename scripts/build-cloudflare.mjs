import { build } from 'esbuild';
import { access } from 'node:fs/promises';

for (const file of ['web/index.html', 'web/vendor/pdfjs.mjs', 'web/vendor/lang/eng.traineddata.gz']) await access(file);
await build({
  entryPoints: ['server/worker.js'],
  outfile: 'dist/worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
});
console.log('Anchor Worker built; website assets are in web/.');
