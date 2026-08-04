const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { ACCESS, ROLE, normalizeRole } = require('../config/rbac');

test('perfil DIRECAO normaliza para DIRETORIA e acessa PCM/equipamentos em modo consulta', () => {
  assert.equal(normalizeRole('DIRECAO'), ROLE.DIRETORIA);
  assert.ok(ACCESS.pcm.includes(ROLE.DIRETORIA));
  assert.ok(ACCESS.equipamentos.includes(ROLE.DIRETORIA));
  assert.ok(!ACCESS.equipamentos_manage.includes(ROLE.DIRETORIA));
  assert.ok(!ACCESS.equipamentos_delete.includes(ROLE.DIRETORIA));
  assert.ok(!ACCESS.os_delete.includes(ROLE.DIRETORIA));
  assert.ok(!ACCESS.preventivas_manage.includes(ROLE.DIRETORIA));
});

test('dashboard gerencial possui rotas protegidas para tela, configuração e exportações', () => {
  const routes = fs.readFileSync('modules/pcm/pcm.routes.js', 'utf8');
  for (const target of ['/dashboard-gerencial', '/dashboard-gerencial/configurar', '/dashboard-gerencial/pdf', '/dashboard-gerencial/excel']) {
    assert.ok(routes.includes(target), `rota ausente: ${target}`);
  }
  assert.match(routes, /requireRole\(PCM_ACCESS\)/);
});

test('serviço expõe filtro de mês anterior e consultas agregadas reais', () => {
  const src = fs.readFileSync('modules/pcm/pcm.service.js', 'utf8');
  assert.ok(src.includes('function buildDashboardFilters'));
  assert.ok(src.includes("shortcut === 'mes_anterior'"));
  assert.ok(src.includes('date(o.opened_at) BETWEEN date(@data_inicial) AND date(@data_final)'));
  assert.ok(src.includes('GROUP BY strftime'));
});

test('views do dashboard gerencial incluem filtros, gráficos, PDF, Excel e configuração', () => {
  const view = fs.readFileSync('views/pcm/dashboard-gerencial.ejs', 'utf8');
  for (const text of ['Dashboard Gerencial da Manutenção', 'Configurar dashboard', 'PDF', 'Excel', 'Equipamentos que exigem atenção', 'Ranking operacional dos mecânicos', 'Ranking dos solicitantes']) {
    assert.ok(view.includes(text), `texto ausente: ${text}`);
  }
  const nav = fs.readFileSync('views/pcm/partials/internal-nav.ejs', 'utf8');
  assert.ok(nav.includes('/pcm/dashboard-gerencial'));
});
