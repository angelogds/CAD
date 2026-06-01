const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ACCESS, ROLE, canAccessModule, normalizeRole } = require('../config/rbac');
const { canViewOSDetails, OS_EXECUTION_ACCESS, OS_STATUS_ACCESS } = require('../modules/os/os.permissions');
const { requireLogin, requireRole } = require('../modules/auth/auth.middleware');

const PROFILE = ROLE.INSPECAO_QUALIDADE;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('normaliza aliases do perfil Inspeção e Qualidade', () => {
  ['INSPECAO_QUALIDADE', 'INSPECAO_E_QUALIDADE', 'INSPECAO QUALIDADE', 'INSPEÇÃO E QUALIDADE', 'QUALIDADE']
    .forEach((alias) => assert.equal(normalizeRole(alias), PROFILE));
});

test('perfil recebe somente os módulos operacionais solicitados', () => {
  const allowed = [
    'painel_operacional', 'equipamentos', 'os_view', 'os_open', 'preventivas_view',
    'demandas_view', 'demandas_open', 'solicitacoes_read', 'solicitacoes_create',
    'inspecao_view', 'inspecao_edit', 'notificacoes_view',
  ];
  const denied = [
    'usuarios', 'compras_manage', 'almoxarifado_read', 'almoxarifado_manage',
    'estoque_view', 'estoque_manage', 'pcm', 'tracagem_view', 'tracagem_manage',
    'desenho_tecnico_view', 'desenho_tecnico_manage', 'preventivas_manage',
    'os_execute', 'escala', 'academia_view', 'academia_manage',
  ];

  allowed.forEach((key) => assert.equal(canAccessModule(PROFILE, key), true, `${key} deveria ser permitido`));
  denied.forEach((key) => assert.equal(canAccessModule(PROFILE, key), false, `${key} deveria ser negado`));
});

test('perfil consulta detalhes de OS sem executar ou alterar status operacional', () => {
  assert.equal(canViewOSDetails(PROFILE), true);
  assert.equal(OS_EXECUTION_ACCESS.includes(PROFILE), false);
  assert.equal(OS_STATUS_ACCESS.includes(PROFILE), false);

  const routes = read('modules/os/os.routes.js');
  assert.match(routes, /\/:id\/iniciar"[^\n]+requireRole\(OS_EXECUTION_ACCESS\)/);
  assert.match(routes, /\/:id\/pausar"[^\n]+requireRole\(OS_EXECUTION_ACCESS\)/);
  assert.match(routes, /\/:id\/fechar"[^\n]+requireRole\(OS_EXECUTION_ACCESS\)/);
  assert.match(routes, /\/:id\/status"[^\n]+requireRole\(OS_STATUS_ACCESS\)/);
  assert.match(read('modules/os/os.controller.js'), /!service\.isOSLinkedToInspecao\(id\)/);
  assert.match(read('modules/os/os.service.js'), /function isOSLinkedToInspecao\(osId\)/);
});

test('sidebar usa chaves granulares e oculta módulos não liberados para o perfil', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /can\('solicitacoes_read'\)/);
  assert.match(sidebar, /can\('almoxarifado_read'\)/);
  assert.match(sidebar, /role !== 'INSPECAO_QUALIDADE'/);
});

test('painel mantém preventivas somente para acompanhamento do perfil', () => {
  const dashboard = read('views/dashboard/index.ejs');
  assert.match(dashboard, /showPreventivasCard = canAccessModule\(roleNorm, 'preventivas_view'\)/);
  assert.match(dashboard, /roleNorm !== 'INSPECAO_QUALIDADE'/);
  assert.match(read('modules/dashboard/dashboard.service.js'), /role === "INSPECAO_QUALIDADE"/);
});

test('tela de demandas usa RBAC para exibir abertura e gestão', () => {
  assert.match(read('views/demandas/index.ejs'), /canAccessModule\(normalizeRole\(user\?\.role\), 'demandas_open'\)/);
  assert.match(read('views/demandas/view.ejs'), /canAccessModule\(normalizeRole\(user\?\.role\), 'demandas_manage'\)/);
});

test('cadastro de usuários aceita o novo perfil', () => {
  assert.match(read('modules/usuarios/usuarios.controller.js'), /key: "INSPECAO_QUALIDADE", label: "Inspeção e Qualidade"/);
  assert.match(read('modules/usuarios/usuarios.service.js'), /"INSPECAO_QUALIDADE"/);
});


test('middleware permite login e aberturas operacionais, mas bloqueia áreas administrativas', () => {
  const user = { id: 77, role: PROFILE };
  const invoke = (middleware) => {
    let proceeded = false;
    let responseStatus = 200;
    middleware(
      { session: { user }, originalUrl: '/teste', accepts: () => true, flash: () => {} },
      {
        status(code) { responseStatus = code; return this; },
        render() { return this; },
        json() { return this; },
        redirect() { return this; },
      },
      () => { proceeded = true; }
    );
    return { proceeded, responseStatus };
  };

  assert.equal(invoke(requireLogin).proceeded, true, 'login autenticado deve continuar normalmente');
  [
    ACCESS.os_open, ACCESS.demandas_open, ACCESS.solicitacoes_create,
    ACCESS.inspecao_view, ACCESS.inspecao_edit,
  ].forEach((roles) => assert.equal(invoke(requireRole(roles)).proceeded, true));

  [
    ACCESS.usuarios, ACCESS.compras_read, ACCESS.almoxarifado_read,
    ACCESS.estoque_view, ACCESS.pcm, ACCESS.escala,
  ].forEach((roles) => {
    const result = invoke(requireRole(roles));
    assert.equal(result.proceeded, false);
    assert.equal(result.responseStatus, 403);
  });
});
