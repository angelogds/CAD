const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Desde c19285b, o bootstrap ativo é o editor 2D estável. As bibliotecas
// MLightCAD permanecem no projeto, mas não devem reinicializar o canvas ativo.
function assertStableBootstrap(source) {
  assert.match(source, /import \{ startCadEditor \} from '.\/cad-legacy-engine\.js/);
  assert.match(source, /const cad = startCadEditor\(\)/);
  assert.match(source, /cad\.isUiBound/);
  assert.match(source, /cadInteractive = 'true'/);
  assert.doesNotMatch(source, /cad-mlight-runtime\.js/);
}
function assertOptionalRuntime(source, filename) {
  assertStableBootstrap(source);
  const runtime=path.resolve(__dirname,'../../public/js',filename);
  assert.ok(fs.existsSync(runtime), `Biblioteca opcional ausente: ${filename}`);
  assert.ok(fs.readFileSync(runtime,'utf8').trim().length>0);
  assert.ok(!source.includes(filename), `Biblioteca opcional não deve reiniciar o editor ativo: ${filename}`);
}
module.exports={assertStableBootstrap,assertOptionalRuntime};
