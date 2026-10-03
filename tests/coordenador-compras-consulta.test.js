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

test('serviço de acompanhamento força Reciclagem e bloqueia detalhe de outro setor', () => {
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

test('RBAC concede ações somente pelas chaves escopadas da Reciclagem', () => {
  for (const key of [
    'acompanhamento_compras',
    'compras_reciclagem_read',
    'compras_reciclagem_manage',
    'solicitacoes_reciclagem_read',
    'solicitacoes_reciclagem_create',
    'solicitacoes_reciclagem_manage',
    'solicitacoes_reciclagem_delete',
  ]) {
    assert.equal(canAccessModule(user.role, key), true, key);
  }

  for (const key of [
    'compras',
    'compras_read',
    'compras_manage',
    'compras_delete',
    'solicitacoes_delete',
    'diretoria_aprovacao',
    'pre_solicitacao_setor_approve',
    'almoxarifado_manage',
    'estoque_manage',
  ]) {
    assert.equal(canAccessModule(user.role, key), false, key);
  }

  assert.ok(Array.isArray(ACCESS.compras_reciclagem_manage));
});

test('menu oferece Solicitações e Compras operacionais sem conceder módulos globais', () => {
  const fs = require('node:fs');
  const ejs = require('ejs');
  const html = ejs.render(fs.readFileSync(require.resolve('../views/partials/sidebar.ejs'), 'utf8'), {
    user, normalizeRole, canAccessModule, activeMenu: 'solicitacoes', operationalCounters: {},
  });

  assert.match(html, /href="\/solicitacoes\/minhas"/);
  assert.match(html, /href="\/compras\/solicitacoes"/);
  assert.doesNotMatch(html, /href="\/almoxarifado\/recebimentos"/);
  assert.doesNotMatch(html, /href="\/fornecedores"/);
});
