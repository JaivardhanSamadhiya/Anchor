import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({entryPoints:['src/domain/source-locations.ts'], bundle:true, write:false, format:'esm', platform:'node'});
const { locateSource } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
test('source locator maps exact Spanish text and rejects unrelated text', () => {
  const layout = [{page:2,width:600,height:800,words:[{text:'Certificación termina el',x:.1,y:.2,w:.5,h:.02},{text:'31 de octubre de 2026',x:.1,y:.23,w:.5,h:.02}]}];
  assert.equal(locateSource(layout,'Certificación termina el 31 de octubre de 2026').page,2);
  assert.equal(locateSource(layout,'Entregue el 22 de octubre de 2026'),null); assert.equal(locateSource(layout,'2026'),null);
});
test('a long quote cannot be highlighted by matching only its prefix', () => {
  const prefix = Array.from({length:100},(_,index) => `word${index}`).join(' ');
  const layout = [{page:1,width:600,height:800,words:[{text:prefix+' firstEnding',x:.1,y:.2,w:.5,h:.02}]}];
  assert.equal(locateSource(layout,prefix+' differentEnding'),null);
});
