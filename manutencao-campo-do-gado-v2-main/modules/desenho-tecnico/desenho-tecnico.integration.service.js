const tracagemService = require('../tracagem/tracagem.service');

const ORIGIN_MAP = {
  'quadrado-redondo': { categoria: 'TRANSICOES', subtipo: 'QUADRADO_REDONDO' },
  'reducao-concentrica': { categoria: 'TRANSICOES', subtipo: 'REDUCAO_CONCENTRICA' },
  'curva-gomos': { categoria: 'CHAPARIA', subtipo: 'CHAPA_DOBRADA' },
  'furacao-flange': { categoria: 'FLANGES', subtipo: 'FLANGE_FURACAO' },
  'mao-francesa': { categoria: 'ESTRUTURAS', subtipo: 'MAO_FRANCESA' },
};

function ensureMinData(tracagem) {
  if (!tracagem || !tracagem.tipo) throw new Error('Integração com Traçagem sem dados mínimos.');
}

function mapTracagemToDesenho(tracagem) {
  ensureMinData(tracagem);
  const mapped = ORIGIN_MAP[tracagem.tipo];
  if (!mapped) throw new Error('Origem da Traçagem não suportada para integração automática.');

  const entrada = tracagem.resultado?.entrada || tracagem.parametros || {};
  const resultado = tracagem.resultado?.resultado || {};

  return {
    codigo: `DT-TR-${tracagem.id}`,
    titulo: tracagem.titulo || `Desenho técnico (${tracagem.tipo})`,
    categoria: mapped.categoria,
    subtipo: mapped.subtipo,
    descricao: `Gerado automaticamente pela Traçagem #${tracagem.id}`,
    equipamento_id: tracagem.equipamento_id || null,
    props_json: JSON.stringify({ ...entrada, ...resultado }),
    origem_modulo: 'TRACAGEM',
    origem_referencia: `${tracagem.tipo}:${tracagem.id}`,
    origem_integracao_em: new Date().toISOString(),
  };
}

function loadTracagem(origem, id) {
  if (String(origem).toLowerCase() !== 'tracagem') throw new Error('Origem inválida para integração.');
  const tracagem = tracagemService.getById(id);
  if (!tracagem) throw new Error('Traçagem de origem não encontrada.');
  return tracagem;
}

module.exports = {
  ORIGIN_MAP,
  mapTracagemToDesenho,
  loadTracagem,
};
