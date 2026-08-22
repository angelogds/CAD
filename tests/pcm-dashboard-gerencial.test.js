const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ACCESS, ROLE, normalizeRole } = require('../config/rbac');

test('Diretoria consulta o PCM, mas não executa mutações operacionais', () => {
  assert.equal(normalizeRole('DIRECAO'), ROLE.DIRETORIA);
  assert.ok(ACCESS.pcm.includes(ROLE.DIRETORIA));
  assert.ok(!ACCESS.pcm_manage.includes(ROLE.DIRETORIA));
  assert.ok(ACCESS.pcm_manage.includes(ROLE.PCM));
  assert.ok(ACCESS.pcm_manage.includes(ROLE.MANUTENCAO_SUPERVISOR));
});

test('painel da Diretoria é fixo, apresentável e possui exportações', () => {
  const view = fs.readFileSync('views/pcm/dashboard-gerencial.ejs', 'utf8');
  for (const text of ['Apresentação executiva permanente', 'Situação da manutenção', 'Modo apresentação', 'PDF', 'Excel', 'Equipamentos que exigem atenção']) {
    assert.ok(view.includes(text), `texto ausente: ${text}`);
  }
  assert.ok(!view.includes('Configurar dashboard'));
  const service = fs.readFileSync('modules/pcm/pcm.service.js', 'utf8');
  assert.ok(service.includes('composição institucional fixa'));
  assert.match(service, /periodo_padrao: 'mes_atual'/);
});

test('rotas de leitura usam PCM_ACCESS e mutações usam PCM_MANAGE', () => {
  const routes = fs.readFileSync('modules/pcm/pcm.routes.js', 'utf8');
  assert.match(routes, /router\.get\("\/dashboard-gerencial"[\s\S]*requireRole\(PCM_ACCESS\)/);
  assert.match(routes, /router\.post\("\/planos"[\s\S]*requireRole\(PCM_MANAGE\)/);
  for (const target of ['/dashboard-gerencial/pdf','/dashboard-gerencial/excel','/relatorios-avancados/pdf','/relatorios-avancados/excel']) {
    assert.ok(routes.includes(target), `rota ausente: ${target}`);
  }
});
