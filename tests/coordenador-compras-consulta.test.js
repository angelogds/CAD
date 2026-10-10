const test = require('node:test');
const assert = require('node:assert/strict');
const { getAcompanhamentoScope, canViewSetor } = require('../modules/acompanhamento-compras/acompanhamento-compras.scope');
const { ACCESS, canAccessModule, normalizeRole } = require('../config/rbac');
const user = { id: 10, role: 'COORDENADOR_RECICLAGEM', setor: 'LOGÍSTICA' };

test('setor do coordenador é imposto pelo perfil, inclusive para aliases', () => {
  for (const role of ['COORDENADOR_RECICLAGEM', 'Coordenador', 'Coordenador da Reciclagem']) {
    assert.equal(getAcompanhamentoScope({ ...user, role }).setor, 'RECICLAGEM');
    assert.equal(canViewSetor({ role }, 'RECICLAGEM'), true);
    for (const setor of ['LOGÍSTICA', 'FRIGORÍFICO', 'ADMINISTRATIVO', 'DESCONHECIDO']) {
      assert.equal(canViewSetor({ role }, setor), false);
    }
  }
});

test('serviço força filtro de Reciclagem e bloqueia detalhe de outro setor', () => {
  const servicePath = require.resolve('../modules/acompanhamento-compras/acompanhamento-compras.service');
  const replacements = [
    ['../database/db', { prepare: () => ({ get: () => undefined }) }],
    ['../modules/compras/acompanhamento.service', {
      getDashboard: (query) => { assert.equal(query.setor, 'RECICLAGEM'); return { solicitacoes: [] }; },
      getDetail: (id) => ({ id, setor_origem: id === 1 ? 'RECICLAGEM' : 'LOGÍSTICA', itens: [] }),
    }],
    ['../modules/compras/compras.aprovacao-itens.service', { getSummary: () => ({ itens: [] }) }],
  ];
  const saved = [];
  try {
    for (const [name, exports] of replacements) {
      const id = require.resolve(name);
      saved.push([id, require.cache[id]]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    delete require.cache[servicePath];
    const service = require(servicePath);
    assert.equal(service.getDashboard(user, { setor: 'LOGÍSTICA' }).scope.setor, 'RECICLAGEM');
    assert.equal(service.getDetail(user, 1).id, 1);
    assert.throws(() => service.getDetail(user, 2), { status: 403 });
  } finally {
    delete require.cache[servicePath];
    for (const [id, value] of saved) {
      if (value) require.cache[id] = value; else delete require.cache[id];
    }
  }
});

test('middleware libera leitura e recusa permissões de escrita', () => {
  const { requireRole } = require('../modules/auth/auth.middleware');
  const req = { session: { user }, flash() {}, accepts: () => false };
  const res = { status(code) { this.code = code; return this; }, json() {} };
  let passed = false;
  requireRole(ACCESS.diretoria_compras)(req, res, () => { passed = true; });
  assert.equal(passed, true);
  for (const key of ['compras_manage', 'compras_delete', 'diretoria_aprovacao', 'almoxarifado_manage']) {
    requireRole(ACCESS[key])(req, res, () => assert.fail(key));
    assert.equal(res.code, 403);
  }
});

test('menu oferece acompanhamento executivo e solicitações sem compras operacionais', () => {
  const fs = require('node:fs');
  const ejs = require('ejs');
  const html = ejs.render(fs.readFileSync(require.resolve('../views/partials/sidebar.ejs'), 'utf8'), {
    user, normalizeRole, canAccessModule, activeMenu: 'solicitacoes', operationalCounters: {},
  });
  assert.match(html, /href="\/dashboard\/diretoria\/compras"/);
  assert.doesNotMatch(html, /href="\/compras\/solicitacoes"/);
  assert.match(html, /href="\/solicitacoes\/minhas"/);
});
