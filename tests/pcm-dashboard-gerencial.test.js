const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ACCESS, ROLE, normalizeRole } = require('../config/rbac');

test('Diretoria consulta desempenho da manutenção sem acessar o PCM operacional', () => {
  assert.equal(normalizeRole('DIRECAO'), ROLE.DIRETORIA);
  assert.ok(ACCESS.diretoria_manutencao.includes(ROLE.DIRETORIA));
  assert.ok(!ACCESS.pcm.includes(ROLE.DIRETORIA));
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

test('rotas antigas redirecionam e novo Painel da Diretoria mantém exportações em somente leitura', () => {
  const pcmRoutes = fs.readFileSync('modules/pcm/pcm.routes.js', 'utf8');
  const diretoriaRoutes = fs.readFileSync('modules/diretoria/diretoria.routes.js', 'utf8');

  assert.match(pcmRoutes, /DIRETORIA_MANUTENCAO_PATH = "\/dashboard\/diretoria\/manutencao"/);
  assert.match(pcmRoutes, /router\.get\("\/dashboard-gerencial"[\s\S]*redirectWithQuery\(DIRETORIA_MANUTENCAO_PATH\)/);
  assert.match(diretoriaRoutes, /router\.get\('\/manutencao', requireLogin, requireRole\(DIRETORIA_MANUTENCAO\), ctrl\.manutencao\)/);
  for (const target of ['/manutencao/dados','/manutencao/pdf','/manutencao/excel']) {
    assert.ok(diretoriaRoutes.includes(target), `rota executiva ausente: ${target}`);
  }
  assert.match(pcmRoutes, /router\.post\("\/planos"[\s\S]*requireRole\(PCM_MANAGE\)/);
});
