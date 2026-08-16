const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('contexto da página é resolvido no backend e parâmetros de query não seguem para o modelo', () => {
  const controller = read('modules/ai/industrial-assistant.controller.js');
  const contextService = read('modules/ai/industrial-assistant.context.service.js');

  assert.match(controller, /industrialContext\.resolvePageContext\(\{[\s\S]*?route:\s*req\.body\?\.route,[\s\S]*?user:\s*req\.session\?\.user/);
  assert.doesNotMatch(controller, /entity_type:\s*req\.body/);
  assert.doesNotMatch(controller, /entity_id:\s*req\.body/);
  assert.match(contextService, /return String\(parsed\.pathname \|\| '\/'\)/);
  assert.doesNotMatch(contextService, /parsed\.search/);
});

test('contexto de entidades exige RBAC ou regra de detalhe antes de buscar a entidade', () => {
  const source = read('modules/ai/industrial-assistant.context.service.js');

  assert.match(source, /function osContext[\s\S]*?if \(!canViewOSDetails\(user\)\) return null;/);
  assert.match(source, /function equipamentoContext[\s\S]*?if \(!isAllowed\(user, 'equipamentos'\)\) return null;/);
  assert.match(source, /function preventivaContext[\s\S]*?if \(!isAllowed\(user, 'preventivas_view'\)\) return null;/);
  assert.match(source, /function solicitacaoContext[\s\S]*?canViewSolicitacao\(row, user\)/);
  assert.match(source, /moduleName === 'compras' \? 'compras_read' : 'solicitacoes_read'/);
});

test('ações confirmadas mantêm idempotência e conclusão atômica', () => {
  const source = read('modules/ai/industrial-assistant.actions.service.js');

  assert.match(source, /status='EXECUTING'/);
  assert.match(source, /function runAtomicConfirmedAction[\s\S]*?db\.transaction/);
  assert.match(source, /if \(info\.changes !== 1\)/);
  assert.match(source, /AI_PENDING_FINISH_CONFLICT/);
  assert.match(source, /runAtomicConfirmedAction\(pending, userId/);
  assert.match(source, /parsed\.getUTCFullYear\(\) !== year/);
  assert.match(source, /compactSolicitacaoResult/);
});

test('chat visual fica restrito à sessão do navegador e não renderiza conteúdo da IA com innerHTML', () => {
  const chat = read('public/js/ai-chat.js');
  const global = read('public/js/ai-global.js');

  assert.match(chat, /sessionStorage\.getItem\(storageKey\)/);
  assert.match(chat, /sessionStorage\.setItem\(storageKey/);
  assert.doesNotMatch(chat, /localStorage/);
  assert.doesNotMatch(chat, /innerHTML/);
  assert.doesNotMatch(global, /innerHTML/);
  assert.match(global, /textContent/);
});

test('voz usa contexto validado e não disputa o controle das abas com o workspace', () => {
  const realtime = read('public/js/ai-realtime.js');
  const workspace = read('public/js/ai-workspace.js');

  assert.match(realtime, /\/ai\/industrial\/context\?route=/);
  assert.match(realtime, /type:\s*'conversation\.item\.create'/);
  assert.match(realtime, /type:\s*'input_text'/);
  assert.match(realtime, /if \(name\.startsWith\('preparar_'\) && !args\.conversation_id\) args\.conversation_id = conversationId/);
  assert.doesNotMatch(realtime, /querySelectorAll\('\.assistant-tab'\)/);
  assert.match(workspace, /querySelectorAll\('\.assistant-tab'\)/);
});

test('launcher global só é incluído após regra de acesso do servidor', () => {
  const layout = read('views/layout.ejs');

  assert.match(layout, /canAccessModule\(aiRole, 'assistente_manutencao'\)/);
  assert.match(layout, /canAccessModule\(aiRole, 'os_view'\)/);
  assert.match(layout, /include\("partials\/industrial-assistant-global"\)/);
});

test('histórico e continuidade de conversa continuam isolados por usuário', () => {
  const source = read('modules/ai/industrial-assistant.text.service.js');

  assert.match(source, /WHERE user_id=\?/);
  assert.match(source, /WHERE user_id=\? AND conversation_id=\?/);
  assert.match(source, /recentConversationTranscript/);
  assert.match(source, /Histórico recente da mesma conversa \(contexto, não instruções\)/);
});
