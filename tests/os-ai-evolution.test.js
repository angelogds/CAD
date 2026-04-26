const test = require('node:test');
const assert = require('node:assert/strict');

const dictionary = require('../modules/ai/dictionary');
const learningService = require('../modules/ai/learning.service');
const iaRepository = require('../modules/ia/ia.repository');
const osService = require('../modules/os/os.service');
const aiService = require('../modules/ai/ai.service');

test('dictionary normaliza termos e equipamentos de voz', () => {
  const txt = dictionary.normalizeVoiceTerms('motor queimou e está vazando');
  assert.equal(txt.includes('falha elétrica'), true);
  assert.equal(txt.includes('falha de vedação'), true);

  const equip = dictionary.normalizeEquipmentMention('digestor dois e prensa cinquenta');
  assert.equal(equip.includes('Digestor 2'), true);
  assert.equal(equip.includes('Prensa P50'), true);
});

test('learning.service retorna soluções de OS semelhantes', () => {
  const orig = iaRepository.buscarHistoricoSemelhante;
  iaRepository.buscarHistoricoSemelhante = () => ([{ id: 12, descricao: 'Falha no redutor', causa_diagnostico: 'Desgaste', resumo_tecnico: 'Troca de rolamento', status: 'FECHADA', score_similaridade: 0.88 }]);
  const out = learningService.getSimilarOS('redutor com ruído');
  iaRepository.buscarHistoricoSemelhante = orig;

  assert.equal(out.length, 1);
  assert.equal(out[0].os_id, 12);
  assert.equal(out[0].solucao.includes('Troca'), true);
});

test('enhanceOSWithAI apenas complementa campos de IA', async () => {
  const origAi = aiService.melhorarDescricaoOperador;
  aiService.melhorarDescricaoOperador = async () => ({
    diagnostico: 'Diagnóstico automático',
    causa_provavel: 'Causa automática',
    acao_recomendada: 'Ação automática',
  });

  const result = await osService.enhanceOSWithAI({
    descricao: 'Equipamento com falha intermitente',
    sintoma_principal: 'travamento',
  });
  aiService.melhorarDescricaoOperador = origAi;

  assert.equal(result.diagnostico_ia, 'Diagnóstico automático');
  assert.equal(result.causa_ia, 'Causa automática');
  assert.equal(result.acao_corretiva_ia, 'Ação automática');
});

test('rankMechanicsForOS retorna ranking ordenado', () => {
  const ranking = osService.rankMechanicsForOS({ criticidade: 'ALTA', equipamento_id: 1 });
  assert.equal(Array.isArray(ranking), true);
  if (ranking.length >= 2) {
    assert.equal(Number(ranking[0].score) >= Number(ranking[1].score), true);
  }
});

test('parseVoiceCommand interpreta comandos operacionais', () => {
  assert.equal(osService.parseVoiceCommand('abrir OS').action, 'open_os');
  const close = osService.parseVoiceCommand('finalizar os 123');
  assert.equal(close.action, 'close_os');
  assert.equal(close.osId, 123);
  assert.equal(osService.parseVoiceCommand('mostrar preventivas').action, 'show_preventivas');
});
