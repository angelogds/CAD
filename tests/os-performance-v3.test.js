const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fechamento operacional não depende mais de mídia obrigatória', () => {
  const fast = read('modules/os/os-fast.controller.js');
  const show = read('views/os/show.ejs');
  const close = read('views/os/close.ejs');

  const closeStart = fast.indexOf('function osClose(req, res)');
  assert.notEqual(closeStart, -1);
  const closeBody = fast.slice(closeStart);

  assert.doesNotMatch(closeBody, /Adicione pelo menos uma mídia/);
  assert.match(closeBody, /if \(fotosFechamento\.length\)/);
  assert.match(show, /Conclui a OS imediatamente\. Fotos e vídeos podem ser anexados separadamente/);
  assert.match(show, /<form method="POST" action="\/os\/<%= os\.id %>\/concluir" id="form-concluir">/);
  assert.doesNotMatch(close, /fechamento_fotos[^\n]*required/);
  assert.doesNotMatch(close, /enctype="multipart\/form-data" id="form-fechar-os"/);
});

test('evidência de fechamento possui upload independente e continua protegida por RBAC', () => {
  const routes = read('modules/os/os.routes.js');
  const fast = read('modules/os/os-fast.controller.js');
  const show = read('views/os/show.ejs');

  assert.match(routes, /"\/:id\/evidencias-fechamento"[\s\S]*requireRole\(OS_EXECUTION_ACCESS\)[\s\S]*fechamentoUpload[\s\S]*fastCtrl\.osAddEvidence/);
  assert.match(fast, /function osAddEvidence\(req, res\)/);
  assert.match(fast, /tipo: "FECHAMENTO"/);
  assert.match(show, /action="\/os\/<%= os\.id %>\/evidencias-fechamento"/);
  assert.match(show, /Envio separado do fechamento/);
});

test('fechamento rápido usa leitura mínima e evita rascunho vazio', () => {
  const fast = read('modules/os/os-fast.controller.js');

  assert.match(fast, /function getOSCore\(id\)/);
  assert.match(fast, /SELECT id, status FROM os WHERE id = \?/);
  assert.match(fast, /const hasDraftContent = Boolean\(/);
  assert.match(fast, /if \(hasDraftContent\) \{[\s\S]*service\.persistirRascunhoFechamento/);
});

test('enriquecimento posterior preserva o primeiro horário de fechamento', () => {
  const service = read('modules/os/os.service.js');

  assert.match(service, /closed_at = COALESCE\(closed_at, datetime\('now'\)\)/);
  assert.match(service, /closed_by = COALESCE\(closed_by, \?\)/);
});

test('ficha da OS carrega WhatsApp somente sob demanda', () => {
  const controller = read('modules/os/os.controller.js');
  const show = read('views/os/show.ejs');

  assert.match(controller, /whatsappDiagnosticsLoaded/);
  assert.match(controller, /req\.query\.whatsapp_diagnostico/);
  assert.match(controller, /const whatsappLogs = whatsappDiagnosticsLoaded/);
  assert.match(controller, /const whatsappDiagnostico = whatsappDiagnosticsLoaded/);
  assert.match(show, /Diagnóstico detalhado carregado somente quando necessário/);
  assert.match(show, /\?whatsapp_diagnostico=1#whatsapp-os/);
});

test('ficha da OS usa resumo leve de chat sem carregar histórico inteiro', () => {
  const chat = read('modules/os-chat/os-chat.service.js');
  const controller = read('modules/os/os.controller.js');

  assert.match(chat, /function buscarResumoConversaPorOS\(osId, user\)/);
  assert.match(chat, /ORDER BY datetime\(created_at\) DESC, id DESC[\s\S]*LIMIT 1/);
  assert.match(chat, /historico: \[\]/);
  assert.match(controller, /osChatService\.buscarResumoConversaPorOS/);
});

test('views alteradas continuam compilando como EJS', () => {
  assert.doesNotThrow(() => ejs.compile(read('views/os/show.ejs')));
  assert.doesNotThrow(() => ejs.compile(read('views/os/close.ejs')));
});
