const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('modo TV usa dados reais do almoxarifado vinculados a OS', () => {
  const service = read('modules/tv/tv.service.js');

  assert.match(service, /function getMaterialRows\(\)/);
  assert.match(service, /solicitacao_itens/);
  assert.match(service, /s\.os_id IS NOT NULL/);
  assert.match(service, /qtd_recebida/);
  assert.match(service, /qtd_retirada/);
  assert.match(service, /quantidadeDisponivel/);
  assert.match(service, /materiaisDisponiveis/);
  assert.match(service, /materiaisEmFluxo/);
  assert.doesNotMatch(service, /CREATE TABLE .*tv/i);
  assert.doesNotMatch(service, /ALTER TABLE .*tv/i);
});

test('modo TV exibe materiais recebidos para retirada e itens ainda chegando', () => {
  const script = read('public/js/tv-mode.js');

  assert.match(script, /Disponível no almoxarifado/);
  assert.match(script, /Material recebido e ainda não retirado/);
  assert.match(script, /Em recebimento \/ chegando/);
  assert.match(script, /Falta \$\{numberBR\(x\.quantidadePendente\)\}/);
  assert.match(script, /Próximas demandas da fábrica/);
});

test('modo TV passa a usar demandas reais da fábrica na tela de materiais', () => {
  const service = read('modules/tv/tv.service.js');

  assert.match(service, /function getProximasDemandas\(\)/);
  assert.match(service, /FROM demandas d/);
  assert.match(service, /demanda_pai_id IS NULL/);
  assert.match(service, /NOT IN \('CONCLUIDA','CONCLUÍDA','CANCELADA','CANCELADO'\)/);
  assert.match(service, /proximasDemandas/);
});

test('primeira tela limita OS e usa tabela operacional com local', () => {
  const script = read('public/js/tv-mode.js');
  const css = read('public/css/tv-mode.css');

  assert.match(script, /sortedActiveOS\(\)\.slice\(0, 5\)/);
  assert.match(script, /Equipamento \/ Local/);
  assert.match(script, /o\.local \|\| o\.setor/);
  assert.match(script, /class="os-table"/);
  assert.match(css, /\.os-table/);
  assert.match(css, /\.equipment-cell/);
  assert.match(css, /\.responsible-cell/);
});

test('assistente do modo TV anuncia novas OS por voz sem notificar baseline', () => {
  const view = read('views/tv/modo-tv.ejs');
  const script = read('public/js/tv-mode.js');

  assert.match(view, /id="tvVoiceBtn"/);
  assert.match(view, /criticalAlertMs: 25000/);
  assert.match(script, /SpeechSynthesisUtterance/);
  assert.match(script, /utterance\.lang = 'pt-BR'/);
  assert.match(script, /buildVoiceMessage\(os\)/);
  assert.match(script, /incoming\.forEach\(markProcessed\)/);
  assert.match(script, /baselineReady/);
  assert.match(script, /state\.voiceTimer = setTimeout/);
});

test('tela de materiais preserva fluxo integrado sem criar nova estrutura de banco', () => {
  const service = read('modules/tv/tv.service.js');

  assert.match(service, /estoque_movimentos/);
  assert.match(service, /solicitacao_item_id/);
  assert.match(service, /estoque_local_nome/);
  assert.match(service, /previsao_entrega/);
  assert.doesNotMatch(service, /INSERT INTO/);
  assert.doesNotMatch(service, /UPDATE solicitacoes/);
  assert.doesNotMatch(service, /DELETE FROM/);
});
