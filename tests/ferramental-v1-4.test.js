const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V1.4 cria plano, inspeções, checklist e bloqueio técnico', () => {
  const migration = read('database/migrations/223_ferramental_v1_4.js');
  assert.match(migration, /ferramental_inspecao_config/);
  assert.match(migration, /ferramental_inspecoes/);
  assert.match(migration, /ferramental_inspecao_itens/);
  assert.match(migration, /ferramental_bloqueios/);
  assert.match(migration, /ferramental_bloqueios/);
});

test('perfis de checklist cobrem padrão, elétrica, solda, abrasiva e manual', () => {
  const service = read('modules/ferramental/ferramental.inspecao.service.js');
  ['PADRAO','ELETRICA','SOLDA','ABRASIVA','MANUAL'].forEach((profile) => {
    assert.match(service, new RegExp(profile));
  });
  assert.match(service, /CABO/);
  assert.match(service, /PROTECAO_DISCO/);
  assert.match(service, /CABOS_SOLDA/);
});

test('plano periódico sincroniza inspeção agendada e gera próximo ciclo', () => {
  const service = read('modules/ferramental/ferramental.inspecao.service.js');
  assert.match(service, /UPDATE ferramental_inspecoes[\s\S]*data_programada/);
  assert.match(service, /DELETE FROM ferramental_inspecao_itens/);
  assert.match(service, /Próxima inspeção periódica gerada automaticamente pela V1\.4/);
  assert.match(service, /scheduleInspection/);
});

test('reprovação bloqueia uso e cria ocorrência de manutenção', () => {
  const service = read('modules/ferramental/ferramental.inspecao.service.js');
  assert.match(service, /createInspectionBlock/);
  assert.match(service, /ensureMaintenanceOccurrence/);
  assert.match(service, /tipo: 'MANUTENCAO'/);
  assert.match(service, /INSPECAO_REPROVADA/);
  assert.match(service, /Ferramenta bloqueada para uso/);
});

test('aprovação libera bloqueio de inspeção e mantém trilha', () => {
  const service = read('modules/ferramental/ferramental.inspecao.service.js');
  assert.match(service, /releaseInspectionBlock/);
  assert.match(service, /liberado_por_user_id/);
  assert.match(service, /INSPECAO_APROVADA/);
  assert.match(service, /APROVADA_RESTRICAO/);
});

test('custódia e ciclo V1.3 respeitam bloqueio técnico V1.4', () => {
  const custody = read('modules/ferramental/ferramental.service.js');
  const occurrence = read('modules/ferramental/ferramental.ocorrencia.service.js');
  assert.match(custody, /assertToolUnblocked\(toolId\)/);
  assert.match(occurrence, /assertToolNotBlocked\(occurrence\.ferramenta_id\)/);
  assert.match(occurrence, /Ferramenta bloqueada para uso/);
});

test('rotas V1.4 ficam sob PCM_MANAGE', () => {
  const routes = read('modules/pcm/pcm.routes.js');
  assert.match(routes, /ferramental\/inspecao-config".*PCM_MANAGE/);
  assert.match(routes, /ferramental\/inspecoes".*PCM_MANAGE/);
  assert.match(routes, /ferramental\/inspecoes\/:inspecaoId".*PCM_MANAGE/);
  assert.match(routes, /ferramental\/inspecoes\/:inspecaoId\/executar".*PCM_MANAGE/);
});

test('PCM, Meu Portal, QR e histórico mostram situação de inspeção', () => {
  const pcm = read('views/ferramental/index.ejs');
  const portal = read('views/meu-portal/ferramental.ejs');
  const qr = read('views/ferramental/qr.ejs');
  const history = read('views/ferramental/historico.ejs');
  const inspection = read('views/ferramental/inspecao.ejs');
  assert.match(pcm, /Inspeção periódica e segurança/);
  assert.match(pcm, /Bloqueadas/);
  assert.match(portal, /Alertas de inspeção/);
  assert.match(portal, /NÃO USAR/);
  assert.match(qr, /Inspeção de segurança/);
  assert.match(history, /Inspeção e liberação de uso/);
  assert.match(inspection, /Executar inspeção/);
  assert.match(inspection, /Reprovada — bloquear uso/);
});

test('PDF V1.4 registra inspeção e bloqueio de segurança', () => {
  const pdf = read('modules/ferramental/ferramental.pdf.js');
  assert.match(pdf, /Inspeções de segurança V1\.4/);
  assert.match(pdf, /BLOQUEADA — NÃO USAR/);
  assert.match(pdf, /Alertas de inspeção/);
});

test('módulos V1.4 passam no parser do Node', () => {
  [
    'database/migrations/223_ferramental_v1_4.js',
    'modules/ferramental/ferramental.inspecao.service.js',
    'modules/ferramental/ferramental.service.js',
    'modules/ferramental/ferramental.ocorrencia.service.js',
    'modules/ferramental/ferramental.controller.js',
    'modules/ferramental/ferramental.pdf.js',
  ].forEach((file) => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});
