const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('launcher global é um orb exclusivo de voz e não abre composer textual', () => {
  const view = read('views/partials/industrial-assistant-global.ejs');
  const client = read('public/js/ai-global.js');

  assert.match(view, /id="aiGlobalVoice"/);
  assert.match(view, /class="ai-voice-orb"/);
  assert.match(view, /id="aiGlobalVoiceAudio"/);
  assert.match(view, /data-user-name=/);
  assert.match(view, /@keyframes aiVoicePulse/);
  assert.match(view, /Assistente por voz/);
  assert.doesNotMatch(view, /ai-global-panel/);
  assert.doesNotMatch(view, /aiGlobalInput/);
  assert.doesNotMatch(view, /aiGlobalSend/);
  assert.doesNotMatch(client, /\/ai\/industrial\/message/);
  assert.doesNotMatch(client, /innerHTML/);
});

test('launcher global usa o mesmo WebRTC, contexto e tools do Assistente Industrial', () => {
  const client = read('public/js/ai-global.js');

  assert.match(client, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(client, /new RTCPeerConnection\(\)/);
  assert.match(client, /\/ai\/realtime\/call/);
  assert.match(client, /'Content-Type': 'application\/sdp'/);
  assert.match(client, /body: localSdp/);
  assert.match(client, /\/ai\/industrial\/context\?route=/);
  assert.match(client, /\/ai\/tools\/execute/);
  assert.match(client, /conversation\.item\.create/);
  assert.match(client, /function_call_output/);
  assert.match(client, /name\.startsWith\('preparar_'\)/);
});

test('assistente fala primeiro com saudação por horário e usuário autenticado', () => {
  const global = read('public/js/ai-global.js');
  const fullVoice = read('public/js/ai-realtime.js');

  for (const source of [global, fullVoice]) {
    assert.match(source, /function greetingForHour/);
    assert.match(source, /Bom dia/);
    assert.match(source, /Boa tarde/);
    assert.match(source, /Boa noite/);
    assert.match(source, /type: 'response\.create'/);
    assert.match(source, /Assistente por voz ativo\. Como posso ajudar\?/);
    assert.match(source, /setMicEnabled\(false\)/);
    assert.match(source, /setMicEnabled\(true\)/);
    assert.match(source, /greetingInProgress/);
  }

  assert.match(global, /root\.dataset\.userName/);
  assert.match(fullVoice, /document\.querySelector\('\.pill-name'\)/);
});

test('launcher global não cria segunda sessão dentro da página completa do assistente', () => {
  const client = read('public/js/ai-global.js');
  assert.match(client, /window\.location\.pathname === '\/ai\/chat'/);
  assert.match(client, /root\.hidden = true/);
});
