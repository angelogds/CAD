const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const path = require('node:path');
// As páginas usam inventário de referência. Não há consulta ao banco neste teste.
require.cache[require.resolve('../database/db')] = { exports: {} };
const router = require('../modules/automacao/automacao.routes');

function request(route, role) {
  const layer = router.stack.find(layer => layer.route?.path === route && layer.route.methods.get);
  assert.ok(layer, route);
  const result = { status: 200 };
  const req = { session: { user: role ? { id: 1, role } : null }, originalUrl: '/automacao' + route,
    flash() {}, accepts: () => true };
  const res = {
    status(status) { result.status = status; return res; },
    render(view, data) { result.view = view; result.data = data; },
    redirect(url) { result.status = 302; result.location = url; },
    json(body) { result.body = body; }, setHeader() {},
  };
  let index = 0;
  function next(error) { if (error) throw error; layer.route.stack[index++]?.handle(req, res, next); }
  next();
  return result;
}
function render(result) {
  const filename = path.join(__dirname, '../views', result.view + '.ejs');
  return ejs.render(require('node:fs').readFileSync(filename, 'utf8'), { layout() {}, ...result.data }, { filename });
}

test('rota do simulador admite apenas ADMIN, encarregado e supervisor de manutenção, incluindo aliases', () => {
  for (const role of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'Encarregado de manutenção', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO']) {
    const result = request('/decanters/simulador', role);
    assert.equal(result.status, 200, role);
    const html = render(result);
    assert.match(html, /data-dec-simulation-allowed="true"/);
    assert.match(html, /id="dec-sim-panel"/);
    assert.match(html, /id="dec-demo-start"/);
  }
  for (const role of ['DIRETORIA', 'PRODUCAO', 'ENCARREGADO_PRODUCAO', 'MECANICO', 'RH', 'ALMOXARIFADO']) {
    assert.equal(request('/decanters/simulador', role).status, 403, role);
  }
  assert.equal(request('/decanters/simulador', null).status, 302);
});

test('Diretoria recebe supervisão sem atalhos ou controles de simulação', () => {
  const result = request('/decanters', 'DIRETORIA');
  assert.equal(result.status, 200);
  const html = render(result);
  assert.match(html, /data-dec-simulation-allowed="false"/);
  assert.doesNotMatch(html, /id="dec-sim-panel"|id="dec-demo-start"|href="\/automacao\/decanters\/simulador"/);
});

test('encarregado entra nas decanters sem ganhar gestão de tokens ou acesso às demais áreas', () => {
  const role = 'ENCARREGADO_MANUTENCAO';
  assert.equal(request('/decanters', role).status, 200);
  const home = request('/', role);
  assert.equal(home.status, 200);
  assert.deepEqual(home.data.setores.map(setor => setor.key), ['decanters']);
  assert.match(render(home), /href="\/automacao\/decanters\/simulador"/);
  assert.doesNotMatch(render(home), /href="\/automacao\/digestores"|href="\/automacao\/prensas"|href="\/automacao\/configuracao"/);
  for (const route of ['/digestores', '/prensas', '/configuracao']) assert.equal(request(route, role).status, 403, route);
});
