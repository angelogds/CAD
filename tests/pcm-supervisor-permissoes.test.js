const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
process.env.DB_PATH = path.join(require('node:os').tmpdir(), `pcm-permissoes-${process.pid}.sqlite`);
const { ACCESS, normalizeRole, canAccessModule } = require('../config/rbac');
const { requireRole } = require('../modules/auth/auth.middleware');
const service = require('../modules/preventivas/preventivas.service');
const controller = require('../modules/preventivas/preventivas.controller');
const sidebar = fs.readFileSync(path.join(__dirname, '../views/partials/sidebar.ejs'), 'utf8');

test('Admin, Encarregado e Supervisor com ambos os nomes de perfil acessam PCM e gerenciam preventivas', () => {
  for (const role of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO']) {
    assert.equal(canAccessModule(role, 'pcm'), true, role);
    assert.equal(canAccessModule(role, 'pcm_manage'), true, role);
    let liberado = false;
    requireRole(ACCESS.pcm_manage)({ session: { user: { role } } }, {}, () => { liberado = true; });
    assert.equal(liberado, true);
    const html = ejs.render(sidebar, { user: { id: 1, role }, normalizeRole, canAccessModule, activeMenu: 'dashboard', operationalCounters: {} });
    assert.ok(html.indexOf('GESTÃO E APOIO') < html.indexOf('PCM – Planejamento'));
    assert.match(html, /href="\/pcm"/);
  }
});

test('controllers usam a mesma regra das rotas para ver e salvar o horário', () => {
  const origResumo = service.listarResumoPreventivasProgramadas;
  const origSalvar = service.salvarRegraLancamento;
  service.listarResumoPreventivasProgramadas = () => ({});
  try {
    for (const role of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO']) {
      let tela = null, salvou = false;
      const req = { session: { user: { id: 1, role } }, body: { horario: '05:00', adiarFeriados: '1' }, flash() {} };
      const res = { render(view) { tela = view; }, redirect() {} };
      controller.programadasIndex(req, res);
      assert.equal(tela, 'preventivas/programadas', role);
      service.salvarRegraLancamento = () => { salvou = true; };
      controller.salvarRegraLancamento(req, res);
      assert.equal(salvou, true, role);
    }
    for (const role of ['RH', 'MECANICO', 'DIRETORIA', 'COORDENADOR_RECICLAGEM', 'PCM']) {
      let salvou = false;
      service.salvarRegraLancamento = () => { salvou = true; };
      assert.equal(canAccessModule(role, 'pcm_manage'), false, role);
      controller.salvarRegraLancamento({ session: { user: { role } }, body: {}, flash() {} }, { redirect() {} });
      assert.equal(salvou, false, role);
    }
  } finally {
    service.listarResumoPreventivasProgramadas = origResumo;
    service.salvarRegraLancamento = origSalvar;
  }
});
