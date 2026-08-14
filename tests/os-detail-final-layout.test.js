const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');

test('OS detail exposes evidence before exactly three domain tabs', () => {
  const view = read('views/os/show.ejs');
  const evidence = view.indexOf('class="os-panel os-evidence-card"');
  const tabs = view.indexOf('class="os-panel os-workspace"');
  assert.ok(evidence > 0 && evidence < tabs);
  assert.equal((view.match(/role="tab"/g) || []).length, 3);
  assert.doesNotMatch(view, /id="tab-(resumo|evidencias)"/);
  assert.match(view, /Histórico da OS/);
});

test('closed OS is read-only and materials have truthful empty state', () => {
  const view = read('views/os/show.ejs');
  assert.match(view, /canAutoAssign && !isOSFechada/);
  assert.match(view, /canManualEditEquipe && !isOSFechada/);
  assert.match(view, /else if \(!isOSFechada && canExecuteOS\)/);
  assert.match(view, /Nenhuma solicitação de material vinculada a esta OS\./);
  assert.match(view, /item\.valor_unitario_centavos!==null/);
});

test('WhatsApp diagnostics remain restricted and outside operational history', () => {
  const view = read('views/os/show.ejs');
  const script = read('public/js/os-detalhe.js');
  assert.match(view, /canSendWhatsappNotification[\s\S]*Diagnóstico da integração WhatsApp/);
  assert.doesNotMatch(script, /moveModule\('whatsapp-os', 'historico'/);
  assert.match(view, /Notificação da OS enviada à equipe\./);
});
