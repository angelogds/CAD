const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../modules/pcm/pcm.service');
const ctrl = require('../modules/pcm/pcm.controller');

// Stubs to keep tests deterministic and independent from DB state
service.listFiltros = () => ({ equipamentos: [], setores: [], tipos: [] });
service.getIndicadores = () => ({ preventiva_pct_mes: 0, corretiva_pct_mes: 0, os_atrasadas: 0, mtbf_medio_dias: 0, mttr_medio_horas: 0, custo_manutencao_mes: 0 });
service.getRankingEquipamentos = () => [];
service.listPlanos = () => [];
service.listBacklogSimples = () => [];
service.getCriticidadeByEquipamentoId = () => null;
service.saveCriticidade = () => ({ nivel_criticidade: 'MEDIA', indice_criticidade: 3.0 });

function mockRes() {
  return {
    rendered: null,
    redirected: null,
    payload: null,
    render(view, payload) {
      this.rendered = view;
      this.payload = payload;
      return this;
    },
    redirect(path) {
      this.redirected = path;
      return this;
    },
  };
}

function mockReq(extra = {}) {
  return {
    query: {},
    body: {},
    params: {},
    session: { user: { id: 1 } },
    flash() {},
    ...extra,
  };
}

test('index renders PCM view with active section', () => {
  const req = mockReq();
  const res = mockRes();
  ctrl.index(req, res);
  assert.equal(res.rendered, 'pcm/index');
  assert.equal(res.payload.activePcmSection, 'visao-geral');
});

test('planejamento and backlog routes render expected views', () => {
  const resA = mockRes();
  ctrl.planejamento(mockReq(), resA);
  assert.equal(resA.rendered, 'pcm/planejamento');

  const resB = mockRes();
  ctrl.backlog(mockReq(), resB);
  assert.equal(resB.rendered, 'pcm/backlog');
});

test('placeholder POST actions redirect to expected pages', () => {
  const redirects = [];
  const req = mockReq({
    body: { equipamento_id: 77 },
    params: { id: '12' },
    flash: () => {},
  });

  const res1 = mockRes(); ctrl.adicionarComponente(req, res1); redirects.push(res1.redirected);
  const res2 = mockRes(); ctrl.adicionarLubrificacao(req, res2); redirects.push(res2.redirected);
  const res3 = mockRes(); ctrl.salvarProgramacao(req, res3); redirects.push(res3.redirected);
  const res4 = mockRes(); ctrl.programarBacklog(req, res4); redirects.push(res4.redirected);

  assert.deepEqual(redirects, [
    '/pcm/engenharia?equipamento_id=77',
    '/pcm/lubrificacao?equipamento_id=77',
    '/pcm/programacao-semanal',
    '/pcm/programacao-semanal',
  ]);
});

test('criticidade GET carrega dados atuais e POST persiste com redirect', () => {
  let persisted = null;
  service.getCriticidadeByEquipamentoId = (id) => ({ equipamento_id: Number(id), nivel_criticidade: 'ALTA', indice_criticidade: 4.5 });
  service.saveCriticidade = (payload) => {
    persisted = payload;
    return { nivel_criticidade: 'ALTA', indice_criticidade: 4.5 };
  };

  const reqGet = mockReq({ query: { equipamento_id: '9' } });
  const resGet = mockRes();
  ctrl.criticidade(reqGet, resGet);
  assert.equal(resGet.rendered, 'pcm/criticidade');
  assert.equal(resGet.payload.criticidadeAtual.nivel_criticidade, 'ALTA');

  const reqPost = mockReq({
    body: { equipamento_id: '9', nivel_criticidade: 'ALTA' },
    flash: () => {},
  });
  const resPost = mockRes();
  ctrl.salvarCriticidade(reqPost, resPost);
  assert.equal(String(persisted.equipamento_id), '9');
  assert.equal(resPost.redirected, '/pcm/criticidade?equipamento_id=9');
});
