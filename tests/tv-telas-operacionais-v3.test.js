const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const view = () => fs.readFileSync('views/tv/modo-tv.ejs', 'utf8');
const screens = () => fs.readFileSync('public/js/tv-screens-2026.js', 'utf8');
const css = () => fs.readFileSync('public/css/tv-screens-2026.css', 'utf8');

test('Modo TV mantém 6 telas e carrega a modernização estrutural depois da base', () => {
  const html = view();
  assert.equal((html.match(/data-tv-screen=/g) || []).length, 6);
  assert.ok(html.indexOf('/css/tv-screens-2026.css') > html.indexOf('/css/tv-mode-2026.css'));
  assert.ok(html.indexOf('/js/tv-screens-2026.js') > html.indexOf('/js/tv-mode.js'));
});

test('fase 3 moderniza somente preventivas, escala, desempenho e criticidade', () => {
  const js = screens();
  for (const screen of ['preventivas', 'escala', 'desempenho', 'criticidade']) {
    assert.match(js, new RegExp(`${screen}: render`, 'i'));
  }
  assert.doesNotMatch(js, /os:\s*render/i);
  assert.doesNotMatch(js, /materiais:\s*render/i);
});

test('tela de preventivas usa tabela operacional com programação, responsável, criticidade e situação', () => {
  const js = screens();
  assert.match(js, /Próximas preventivas/);
  assert.match(js, /Equipamento \/ Local/);
  assert.match(js, /Responsável/);
  assert.match(js, /Data prevista/);
  assert.match(js, /Criticidade/);
  assert.match(js, /PROGRAMADA/);
  assert.match(js, /VENCIDA/);
});

test('tela de escala apresenta equipe em campo, disponibilidade e afastamentos', () => {
  const js = screens();
  assert.match(js, /Equipe em campo/);
  assert.match(js, /Disponíveis/);
  assert.match(js, /Em atendimento/);
  assert.match(js, /Final de semana/);
  assert.match(js, /Folgas e afastamentos/);
});

test('desempenho e criticidade passam a usar tabelas proporcionais para TV', () => {
  const js = screens();
  const styles = css();
  assert.match(js, /Desempenho mensal da equipe/);
  assert.match(js, /OS finalizadas/);
  assert.match(js, /Carga atual/);
  assert.match(js, /Top 5 — incidência de falhas/);
  assert.match(js, /MTBF/);
  assert.match(styles, /\.performance-table/);
  assert.match(styles, /\.critical-table/);
  assert.match(styles, /\.tv-v3-table thead th/);
});

test('extensão de telas reutiliza o snapshot já carregado e não cria rede paralela', () => {
  const js = screens();
  assert.match(js, /window\.CGTVTest\?\.state\?\.data/);
  assert.match(js, /MutationObserver/);
  assert.doesNotMatch(js, /new EventSource/);
  assert.doesNotMatch(js, /fetch\s*\(/);
  assert.doesNotMatch(js, /\/api\/tv\//);
});

test('correções da revisão preservam zero corretivo, criticidade exata e fallback de foto seguro', () => {
  const js = screens();
  assert.match(js, /m\.percentualCorretivas \?\? \(100 - pctPreventive\)/);
  assert.match(js, /function isHighCriticality/);
  assert.match(js, /\['CRITICA', 'CRITICO', 'ALTA', 'ALTO', 'CRITICIDADE_ALTA'\]\.includes\(p\)/);
  assert.doesNotMatch(js, /onerror=/i);
  assert.match(js, /addEventListener\('error'/);
  assert.match(js, /span\.textContent = img\.dataset\.tvFallback/);
});

test('agendamento libera o latch antes da modernização para não travar novas renderizações', () => {
  const js = screens();
  assert.match(js, /requestAnimationFrame\(\(\) => \{\s*scheduled = false;\s*modernize\(\);/);
});

test('extensão da fase 3 é JavaScript válido e pode aguardar DOMContentLoaded', () => {
  const js = screens();
  assert.doesNotThrow(() => new vm.Script(js));
  assert.doesNotThrow(() => new vm.Script(js).runInNewContext({
    window: {},
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelector() { return null; },
      getElementById() { return null; },
      createElement() { return { textContent: '' }; },
    },
    requestAnimationFrame(fn) { return fn(); },
    MutationObserver: class { observe() {} },
    console,
  }));
});