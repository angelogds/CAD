const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const build=fs.readFileSync(path.join(__dirname,'..','scripts','build-mlightcad.mjs'),'utf8');
test('bundle MLightCAD evita separar dependências circulares em chunks',()=>{assert.match(build,/inlineDynamicImports:\s*true/);assert.doesNotMatch(build,/chunkFileNames:/);});
