const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const view = () => fs.readFileSync('views/tv/modo-tv.ejs', 'utf8');
const baseCss = () => fs.readFileSync('public/css/tv-mode.css', 'utf8');
const refinementCss = () => fs.readFileSync('public/css/tv-mode-2026.css', 'utf8');
const voice = () => fs.readFileSync('public/js/tv-voice-assistant.js', 'utf8');

test('Modo TV mantém a folha base e carrega o refinamento visual depois dela', () => {
  const html = view();
  const base = html.indexOf('/css/tv-mode.css');
  const refinement = html.indexOf('/css/tv-mode-2026.css');
  assert.ok(base >= 0);
  assert.ok(refinement > base);
  assert.equal((html.match(/data-tv-screen=/g) || []).length, 7);
});

test('ticker inferior é ampliado para leitura em TV e não volta ao tamanho antigo nos breakpoints principais', () => {
  const css = refinementCss();
  assert.match(css, /--ticker-h:82px/);
  assert.match(css, /@media\(max-width:1450px\)[\s\S]*--ticker-h:72px/);
  assert.match(css, /@media\(max-width:1180px\)[\s\S]*--ticker-h:68px/);
  assert.match(css, /\.tv-ticker-track span[\s\S]*font-size:clamp\(19px,1\.35vw,27px\)/);
  assert.match(css, /TEMPO REAL/);
});

test('tabela de OS recebe tratamento específico de cabeçalho, linhas e legibilidade', () => {
  const css = refinementCss();
  assert.match(css, /\.os-panel \.table-wrap/);
  assert.match(css, /\.os-table thead th/);
  assert.match(css, /\.os-table tbody tr[\s\S]*height:66px/);
  assert.match(css, /\.os-table td[\s\S]*padding:11px 12px/);
  assert.match(css, /\.equipment-cell strong/);
  assert.match(css, /\.responsible-cell i/);
});

test('alerta informa que a assistente lerá a OS completa e carrega a extensão de voz após o módulo principal', () => {
  const html = view();
  assert.match(html, /id="tvVoiceReadingStatus"/);
  assert.match(html, /descrição completa do chamado/);
  assert.ok(html.indexOf('/js/tv-voice-assistant.js') > html.indexOf('/js/tv-mode.js'));
});

test('assistente de voz inclui os dados operacionais completos sem duplicar SSE ou polling', () => {
  const js = voice();
  for (const field of [
    'Equipamento:',
    'Local:',
    'Prioridade:',
    'Status:',
    'Abertura:',
    'Descrição completa do serviço:',
  ]) assert.match(js, new RegExp(field));

  assert.match(js, /Responsável|RESPONSAVEL/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /synth\.speak = function enhancedSpeak/);
  assert.doesNotMatch(js, /new EventSource/);
  assert.doesNotMatch(js, /fetch\s*\(/);
  assert.doesNotMatch(js, /\/api\/tv\//);
});

test('extensão de voz é JavaScript válido e encerra com fallback quando síntese não existe', () => {
  const js = voice();
  assert.doesNotThrow(() => new vm.Script(js));
  assert.doesNotThrow(() => new vm.Script(js).runInNewContext({
    window: { speechSynthesis: null, SpeechSynthesisUtterance: null },
    document: { getElementById() { return null; } },
    console,
  }));
});

test('refinamento não substitui a folha principal do Modo TV', () => {
  assert.match(baseCss(), /\.tv-shell/);
  assert.match(refinementCss(), /Refinamento visual do Modo TV/);
});
