const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('liberação da Demanda é independente da OS e não bypassa aprovação financeira de Compras', () => {
  const gate = read('modules/compras/compras-demandas.service.js');
  const purchaseRoutes = read('modules/compras/compras.routes.js');

  assert.match(gate, /liberacao_compras_status/);
  assert.match(gate, /A geração de OS não é necessária para comprar o material/);
  assert.match(gate, /DEMANDA_COMPRA_AGUARDANDO_LIBERACAO/);

  assert.match(purchaseRoutes, /approvalGuard\.requireApprovedPurchase/);
  assert.match(purchaseRoutes, /approvalGuard\.requireApprovedPurchaseIntent/);
});

test('pré-solicitação sai da fila antecipada quando a Demanda é liberada', () => {
  const prequote = read('modules/compras/compras-demandas.service.js');
  const queue = read('modules/compras/compras.service.js');

  assert.match(prequote, /releaseWhere/);
  assert.match(prequote, /liberacao_compras_status[\s\S]*<> 'LIBERADA'/);
  assert.match(queue, /s\.demanda_id IS NULL/);
  assert.match(queue, /s\.os_id IS NOT NULL/);
  assert.match(queue, /liberacao_compras_status,'PENDENTE'\)\)='LIBERADA'/);
});

test('planejamento possui bloco próprio para liberar compras e outro para aprovar execução', () => {
  const view = read('views/demandas/view.ejs');
  const routes = read('modules/demandas/demandas.routes.js');

  assert.match(view, /Execução do serviço/);
  assert.match(view, /Liberação da compra/);
  assert.match(view, /Não é necessário gerar OS/);
  assert.match(view, /materialSituation/);
  assert.match(routes, /\/liberacao-compras/);
  assert.match(routes, /ACCESS\.demandas_approve/);
});

test('solicitação criada pela Demanda recebe criticidade explícita', () => {
  const view = read('views/demandas/view.ejs');
  const controller = read('modules/demandas/demandas.controller.js');
  const service = read('modules/demandas/demandas.service.js');
  const prequoteJs = read('public/js/compras-demandas-pre-cotacao.js');

  assert.match(view, /name="prioridade_solicitacao"/);
  assert.match(view, /BAIXA','MEDIA','ALTA','CRITICA/);
  assert.match(controller, /prioridade: req\.body\.prioridade_solicitacao/);
  assert.match(service, /\['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'\]/);
  assert.match(prequoteJs, /Criticidade:/);
});


test('execução da Demanda aguarda materiais quando existe solicitação ativa', () => {
  const service = read('modules/demandas/demandas.service.js');
  const controller = read('modules/demandas/demandas.controller.js');
  const view = read('views/demandas/view.ejs');

  assert.match(service, /function materiaisDisponiveisParaExecucao/);
  assert.match(service, /RECEBIDA_TOTAL/);
  assert.match(service, /SEPARADA_PARA_RETIRADA/);
  assert.match(service, /ENTREGUE_SOLICITANTE/);
  assert.match(service, /DEMANDA_MATERIAIS_NAO_DISPONIVEIS/);
  assert.match(controller, /A Ordem de Serviço só pode ser gerada quando os materiais planejados estiverem disponíveis na empresa/);
  assert.match(view, /Aguardando materiais/);
  assert.match(view, /serviceReadyForOS/);
});

test('Demanda sem solicitação de material continua podendo seguir para execução', () => {
  const service = read('modules/demandas/demandas.service.js');
  const view = read('views/demandas/view.ejs');

  assert.match(service, /if \(!relevantes\.length\) return true/);
  assert.match(view, /materialRequestsForExecution\.length === 0/);
});
