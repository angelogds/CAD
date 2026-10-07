const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V1.3 cria ocorrência única em andamento por ferramenta e preserva vínculo histórico', () => {
  const migration = read('database/migrations/220_ferramental_v1_3.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_ocorrencias/);
  assert.match(migration, /idx_ferramental_ocorrencia_aberta_por_ferramenta/);
  assert.match(migration, /EM_ACOMPANHAMENTO/);
  assert.match(migration, /custodia_id INTEGER REFERENCES ferramental_custodias/);
  assert.match(migration, /equipe_id INTEGER REFERENCES ferramental_equipes/);
});

test('mecânico só abre ocorrência para ferramenta sob sua responsabilidade e não libera a própria custódia', () => {
  const service = read('modules/ferramental/ferramental.ocorrencia.service.js');
  assert.match(service, /userBelongsToTeam/);
  assert.match(service, /Você só pode abrir ocorrência para ferramenta sob sua responsabilidade atual/);
  assert.match(service, /Já existe a ocorrência/);
  const createBlock = service.slice(service.indexOf('function createOwnOccurrence'), service.indexOf('function createPcmOccurrence'));
  assert.doesNotMatch(createBlock, /UPDATE ferramental_custodias/);
  assert.doesNotMatch(createBlock, /SET status='DISPONIVEL'/);
});

test('PCM trata devolução manutenção dano extravio transferência e baixa', () => {
  const service = read('modules/ferramental/ferramental.ocorrencia.service.js');
  [
    'DEVOLVER_DISPONIVEL',
    'ENVIAR_MANUTENCAO',
    'MARCAR_DANIFICADA',
    'MARCAR_EXTRAVIADA',
    'TRANSFERIR',
    'BAIXAR',
    'RETORNAR_DISPONIVEL',
  ].forEach((action) => assert.match(service, new RegExp(action)));
  assert.match(service, /DEVOLUCAO_PCM/);
  assert.match(service, /ENVIO_MANUTENCAO/);
  assert.match(service, /RETORNO_MANUTENCAO/);
  assert.match(service, /FERRAMENTA_EXTRAVIADA/);
  assert.match(service, /TRANSFERENCIA_PCM/);
});

test('encerrar custódia cancela aceite pendente e fecha conferência periódica', () => {
  const service = read('modules/ferramental/ferramental.ocorrencia.service.js');
  assert.match(service, /cancelPendingForCustody\(custody\.id\)/);
  assert.match(service, /settlePendingInventories/);
  assert.match(service, /UPDATE ferramental_inventarios/);
  assert.match(service, /status='CONCLUIDO'/);
  const base = read('modules/ferramental/ferramental.service.js');
  assert.match(base, /settlePendingInventories\(\s*previous\.id/);
});

test('transferência gera nova custódia e novo aceite para os responsáveis de destino', () => {
  const service = read('modules/ferramental/ferramental.ocorrencia.service.js');
  assert.match(service, /function transferTool/);
  assert.match(service, /INSERT INTO ferramental_custodias/);
  assert.match(service, /createPendingForCustody\(result\.lastInsertRowid, target\.team\.id\)/);
  assert.match(service, /O armário de destino deve pertencer a um dos responsáveis da equipe/);
});

test('rotas V1.3 separam autoatendimento do mecânico e decisões PCM', () => {
  const portal = read('modules/meu-portal/meu-portal.routes.js');
  const pcm = read('modules/pcm/pcm.routes.js');
  assert.match(portal, /ferramental\/ferramentas\/:ferramentaId\/ocorrencias'.*requireMaintenanceSelfService/);
  assert.match(pcm, /ferramental\/ocorrencias\/:ocorrenciaId\/resolver".*PCM_MANAGE/);
  assert.match(pcm, /ferramental\/ferramentas\/:ferramentaId\/historico".*PCM_ACCESS/);
  assert.match(pcm, /ferramental\/ferramentas\/:ferramentaId\/ocorrencias".*PCM_MANAGE/);
});

test('Meu Portal, PCM e QR expõem ocorrência e histórico completo', () => {
  const portal = read('views/meu-portal/ferramental.ejs');
  const pcm = read('views/ferramental/index.ejs');
  const qr = read('views/ferramental/qr.ejs');
  const history = read('views/ferramental/historico.ejs');
  assert.match(portal, /Solicitar devolução/);
  assert.match(portal, /Necessita manutenção/);
  assert.match(portal, /Não localizada \/ extravio/);
  assert.match(portal, /Enviar ao PCM/);
  assert.match(pcm, /Ocorrências e ciclo de vida/);
  assert.match(pcm, /Transferir responsabilidade/);
  assert.match(pcm, /Retornar da manutenção/);
  assert.match(qr, /Ocorrência em andamento/);
  assert.match(qr, /Últimas movimentações/);
  assert.match(history, /LINHA DO TEMPO/);
  assert.match(history, /Abrir ocorrência pelo PCM/);
});

test('PDF V1.3 registra ocorrências da equipe e do colaborador', () => {
  const pdf = read('modules/ferramental/ferramental.pdf.js');
  assert.match(pdf, /Ocorrências V1\.3/);
  assert.match(pdf, /Minhas ocorrências V1\.3/);
  assert.match(pdf, /Tratamento PCM/);
});

test('módulos V1.3 permanecem sintaticamente válidos no Node', () => {
  [
    'database/migrations/220_ferramental_v1_3.js',
    'modules/ferramental/ferramental.ocorrencia.service.js',
    'modules/ferramental/ferramental.service.js',
    'modules/ferramental/ferramental.controller.js',
    'modules/ferramental/ferramental.pdf.js',
  ].forEach((file) => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});
