const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V2 cria uso operacional e inventário físico por QR', () => {
  const migration = read('database/migrations/224_ferramental_v2.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_usos/);
  assert.match(migration, /idx_ferramental_uso_ativo/);
  assert.match(migration, /ferramental_inventario_scan_sessoes/);
  assert.match(migration, /ferramental_inventario_scan_itens/);
  assert.match(migration, /FORA_ESCOPO/);
});

test('retirada por QR não substitui custódia e respeita bloqueio V1.4', () => {
  const service = read('modules/ferramental/ferramental.v2.service.js');
  assert.match(service, /inspecaoService\.assertToolUnblocked\(tid\)/);
  assert.match(service, /INSERT INTO ferramental_usos/);
  assert.match(service, /custodia_id/);
  assert.match(service, /RETIRADA_USO_QR/);
  const checkout = service.slice(service.indexOf('function checkout'), service.indexOf('function returnUse'));
  assert.doesNotMatch(checkout, /UPDATE ferramental_custodias/);
});

test('mecânico só retira ferramenta da própria responsabilidade atual', () => {
  const service = read('modules/ferramental/ferramental.v2.service.js');
  assert.match(service, /teamMembership/);
  assert.match(service, /A retirada por QR é permitida apenas aos responsáveis atuais da ferramenta/);
  assert.match(service, /MANAGER_ROLES/);
});

test('devolução registra usuário condição e devolução danificada impede novo uso', () => {
  const service = read('modules/ferramental/ferramental.v2.service.js');
  assert.match(service, /devolvido_por_user_id/);
  assert.match(service, /condicao_retorno/);
  assert.match(service, /DEVOLUCAO_USO_DANIFICADA/);
  assert.match(service, /status=CASE WHEN \?='DANIFICADA' THEN 'DANIFICADA'/);
});

test('inventário QR permite sessão geral ou por equipe e fecha pendentes como não localizados', () => {
  const service = read('modules/ferramental/ferramental.v2.service.js');
  assert.match(service, /function createScanSession/);
  assert.match(service, /function scanInventory/);
  assert.match(service, /function closeScanSession/);
  assert.match(service, /status='NAO_LOCALIZADO'/);
  assert.match(service, /INVENTARIO_QR_SCAN/);
  assert.match(service, /INVENTARIO_QR_NAO_LOCALIZADO/);
  assert.match(service, /nextStatus = Number\(row\.esperado \|\| 0\) === 1 \? 'LOCALIZADO' : 'FORA_ESCOPO'/);
});

test('leitor aceita token puro ou URL completa do QR', () => {
  const service = read('modules/ferramental/ferramental.v2.service.js');
  assert.match(service, /function extractToken/);
  assert.match(service, /raw\.match/);
  assert.match(service, /decodeURIComponent/);
  const scanner = read('public/js/ferramental-v2-scanner.js');
  assert.match(scanner, /BarcodeDetector/);
  assert.match(scanner, /qr_code/);
  assert.match(scanner, /getUserMedia/);
  assert.match(scanner, /fetch\(endpoint/);
});

test('rotas V2 separam operação QR do inventário gerenciado pelo PCM', () => {
  const publicRoutes = read('modules/ferramental/ferramental.routes.js');
  const pcmRoutes = read('modules/pcm/pcm.routes.js');
  assert.match(publicRoutes, /qr\/:token\/retirar'.*VIEW_ACCESS/);
  assert.match(publicRoutes, /qr\/:token\/devolver'.*VIEW_ACCESS/);
  assert.match(pcmRoutes, /ferramental\/inventarios-scan".*PCM_MANAGE/);
  assert.match(pcmRoutes, /inventarios-scan\/:sessaoId\/scan".*PCM_MANAGE/);
  assert.match(pcmRoutes, /inventarios-scan\/:sessaoId\/fechar".*PCM_MANAGE/);
});

test('PCM, QR, Meu Portal e scanner expõem a experiência V2', () => {
  const pcm = read('views/ferramental/index.ejs');
  const qr = read('views/ferramental/qr.ejs');
  const portal = read('views/meu-portal/ferramental.ejs');
  const scan = read('views/ferramental/inventario-scan.ejs');
  assert.match(pcm, /Operação QR e inventário físico/);
  assert.match(pcm, /Ferramentas em uso/);
  assert.match(pcm, /Usuários com mais retiradas/);
  assert.match(qr, /Uso operacional por QR/);
  assert.match(qr, /Retirar para uso/);
  assert.match(qr, /Registrar devolução/);
  assert.match(portal, /Meu uso operacional/);
  assert.match(scan, /Escanear QR da ferramenta/);
  assert.match(scan, /Concluir inventário/);
});

test('dashboard V2 calcula uso, atraso, inventário e ranking', () => {
  const service = read('modules/ferramental/ferramental.v2.service.js');
  assert.match(service, /wallTimeEpoch/);
  assert.match(service, /APP_TZ/);
  assert.match(service, /isOverdueValue/);
  assert.match(service, /emUso/);
  assert.match(service, /atrasados/);
  assert.match(service, /inventariosAbertos/);
  assert.match(service, /naoLocalizados/);
  assert.match(service, /topUsers/);
  assert.match(service, /topTools/);
  assert.match(service, /devolucoesDanificadas30d/);
});

test('PDF registra uso operacional V2', () => {
  const pdf = read('modules/ferramental/ferramental.pdf.js');
  assert.match(pdf, /Uso operacional por QR V2/);
  assert.match(pdf, /Meu uso operacional V2/);
  assert.match(pdf, /v2Service\.ownUsage/);
});

test('módulos V2 passam no parser do Node', () => {
  [
    'database/migrations/224_ferramental_v2.js',
    'modules/ferramental/ferramental.v2.service.js',
    'modules/ferramental/ferramental.controller.js',
    'modules/ferramental/ferramental.routes.js',
    'modules/ferramental/ferramental.pdf.js',
    'public/js/ferramental-v2-scanner.js',
  ].forEach((file) => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});
