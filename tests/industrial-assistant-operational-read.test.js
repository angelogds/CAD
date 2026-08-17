const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const operationalRead = require('../modules/ai/industrial-assistant.read.service');
const industrialAssistant = require('../modules/ai/industrial-assistant.service');
const realtimeAssistant = require('../modules/ai/industrial-assistant.realtime.service');

const readSource = fs.readFileSync(path.join(__dirname, '../modules/ai/industrial-assistant.read.service.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(__dirname, '../modules/ai/industrial-assistant.service.js'), 'utf8');
const realtimeSource = fs.readFileSync(path.join(__dirname, '../modules/ai/industrial-assistant.realtime.service.js'), 'utf8');

test('novas consultas operacionais são somente leitura e possuem contrato explícito', () => {
  const tools = operationalRead.getTools();
  const names = tools.map((tool) => tool.name);
  assert.deepEqual(names, ['consultar_demandas', 'consultar_recebimentos_almoxarifado']);
  assert.equal(operationalRead.hasTool('consultar_demandas'), true);
  assert.equal(operationalRead.hasTool('consultar_recebimentos_almoxarifado'), true);
  assert.equal(operationalRead.hasTool('receber_item'), false);
  assert.match(readSource, /somente_leitura: true/);
  assert.match(readSource, /valores_financeiros_expostos: false/);
});

test('RBAC filtra Demandas e Almoxarifado antes das tools chegarem à voz', () => {
  const diretoria = realtimeAssistant.getRealtimeTools({ id: 1, role: 'DIRETORIA' }).map((tool) => tool.name);
  assert.ok(diretoria.includes('consultar_demandas'));
  assert.ok(diretoria.includes('consultar_recebimentos_almoxarifado'));

  const inspecao = realtimeAssistant.getRealtimeTools({ id: 2, role: 'INSPECAO_QUALIDADE' }).map((tool) => tool.name);
  assert.ok(inspecao.includes('consultar_demandas'));
  assert.equal(inspecao.includes('consultar_recebimentos_almoxarifado'), false);

  const mecanico = realtimeAssistant.getRealtimeTools({ id: 3, role: 'MECANICO' }).map((tool) => tool.name);
  assert.equal(mecanico.includes('consultar_demandas'), false);
  assert.equal(mecanico.includes('consultar_recebimentos_almoxarifado'), false);
});

test('execução também recusa consulta sem permissão no backend', async () => {
  await assert.rejects(
    industrialAssistant.executeTool({ name: 'consultar_demandas', args: {}, user: { id: 7, role: 'MECANICO' } }),
    (err) => err?.code === 'AI_RBAC_DENIED' && err?.status === 403,
  );
  await assert.rejects(
    industrialAssistant.executeTool({ name: 'consultar_recebimentos_almoxarifado', args: {}, user: { id: 8, role: 'COMPRAS' } }),
    (err) => err?.code === 'AI_RBAC_DENIED' && err?.status === 403,
  );
});

test('consulta de recebimentos não possui chamadas de escrita nem campos financeiros', () => {
  assert.match(readSource, /listRecebimentos/);
  assert.match(readSource, /getSolicitacao/);
  assert.doesNotMatch(readSource, /\.iniciarRecebimento\s*\(/);
  assert.doesNotMatch(readSource, /\.receberItem\s*\(/);
  assert.doesNotMatch(readSource, /\.finalizarRecebimento\s*\(/);
  assert.doesNotMatch(readSource, /\.fechar\s*\(/);
  assert.doesNotMatch(readSource, /\.registrarSaida\s*\(/);
  assert.doesNotMatch(readSource, /valor_(?:unitario|total|centavos)|preco|frete|desconto/i);
});

test('status inválido do Almoxarifado falha fechado em vez de ampliar a consulta', () => {
  assert.throws(
    () => operationalRead.consultarRecebimentos({ status: 'QUALQUER_COISA' }),
    (err) => err?.code === 'AI_RECEBIMENTO_STATUS_INVALID' && err?.status === 400,
  );
});

test('registro central e Realtime reconhecem as novas tools com chaves granulares', () => {
  const names = industrialAssistant.getRealtimeTools().map((tool) => tool.name);
  assert.ok(names.includes('consultar_demandas'));
  assert.ok(names.includes('consultar_recebimentos_almoxarifado'));
  assert.match(assistantSource, /operationalRead\.getTools\(\)/);
  assert.match(assistantSource, /operationalRead\.executeTool/);
  assert.match(realtimeSource, /consultar_demandas:\s*'demandas_view'/);
  assert.match(realtimeSource, /consultar_recebimentos_almoxarifado:\s*'almoxarifado_read'/);
});
