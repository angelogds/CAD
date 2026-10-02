const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const build=fs.readFileSync(path.join(__dirname,'..','scripts','build-mlightcad.mjs'),'utf8');
test('bundle MLightCAD suporta múltiplos entrypoints e agrupa dependências centrais',()=>{assert.doesNotMatch(build,/inlineDynamicImports:\s*true/);assert.match(build,/manualChunks\(id\)/);assert.match(build,/@mlightcad\/geometry-engine/);assert.match(build,/@mlightcad\/cad-simple-viewer/);});
