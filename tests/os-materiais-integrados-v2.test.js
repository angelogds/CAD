const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('OS carrega permissão e alterações pendentes da solicitação vinculada', () => {
  const controller = read('modules/os/os.controller.js');

  assert.match(controller, /solicitacoes\.itens-bilateral\.service/);
  assert.match(controller, /canAccessModule\(role, "solicitacoes_read"\)/);
  assert.match(controller, /solicitacoesItensService\.canManageItems/);
  assert.match(controller, /solicitacoesItensService\.getAlteracoes/);
  assert.match(controller, /canManageMaterialRequest/);
  assert.match(controller, /materialItemChanges/);
});

test('aba Materiais permite adicionar item na mesma solicitação sem criar outra', () => {
  const view = read('views/os/show.ejs');

  assert.match(view, /data-material-toggle="novo"/);
  assert.match(view, /action="\/solicitacoes\/<%= materialRequest\.id %>\/itens\/adicionar"/);
  assert.match(view, /name="item_nome"/);
  assert.match(view, /name="qtd_solicitada"/);
  assert.match(view, /name="unidade"/);
  assert.match(view, /name="item_descricao"/);
  assert.match(view, /name="adicao_justificativa"/);
  assert.match(view, /name="return_to" value="\/os\/<%= os\.id %>#materiais"/);
  assert.match(view, /O novo item entra individualmente em cotação sem regredir o status dos itens já comprados/);
});

test('OS oferece ajuste somente de quantidade reutilizando consenso bilateral', () => {
  const view = read('views/os/show.ejs');
  const service = read('modules/solicitacoes/solicitacoes.itens-bilateral.service.js');

  assert.match(view, /Ajustar quantidade/);
  assert.match(view, /action="\/solicitacoes\/<%= materialRequest\.id %>\/itens\/<%= item\.id %>\/alteracao"/);
  assert.match(view, /type="hidden" name="item_nome"/);
  assert.match(view, /type="hidden" name="item_descricao"/);
  assert.match(view, /type="hidden" name="unidade"/);
  assert.match(view, /name="motivo"/);
  assert.match(view, /Enviar para consenso/);

  assert.match(service, /quantidade solicitada não pode ficar abaixo da quantidade já comprada/);
  assert.match(service, /Item com recebimento físico não pode ser alterado retroativamente/);
  assert.match(service, /Após a compra, somente a quantidade solicitada pode ser ajustada por consenso/);
});

test('UI bloqueia edição rápida quando há recebimento, cancelamento ou consenso pendente', () => {
  const view = read('views/os/show.ejs');

  assert.match(view, /const received=Number\(item\.qtd_recebida_total\|\|0\)>0/);
  assert.match(view, /const exclusionPending=String\(item\.exclusao_status\|\|''\).*PENDENTE/);
  assert.match(view, /const changePending=pendingMaterialChanges\.has\(Number\(item\.id\)\)/);
  assert.match(view, /const cancelled=statusCompra==='CANCELADO'/);
  assert.match(view, /!received && !exclusionPending && !changePending && !cancelled/);
  assert.match(view, /Recebimento iniciado; alteração bloqueada/);
  assert.match(view, /Aguardando consenso/);
});

test('retorno após ação aceita somente caminhos internos seguros da OS ou Solicitações', () => {
  const controller = read('modules/solicitacoes/solicitacoes.itens-consenso.controller.js');

  assert.match(controller, /function safeReturnTo/);
  assert.match(controller, /target\.startsWith\('\/\/'\)/);
  assert.match(controller, /\^\\\/os\\\/\\d\+/);
  assert.match(controller, /\^\\\/solicitacoes\\\/\\d\+/);
  assert.match(controller, /res\.redirect\(safeReturnTo\(req,/);
});

test('service expõe permissão sem duplicar regra de status final', () => {
  const service = read('modules/solicitacoes/solicitacoes.itens-bilateral.service.js');

  assert.match(service, /function isOpenForItemChanges/);
  assert.match(service, /FINAL_STATUS\.has/);
  assert.match(service, /function canManageItems/);
  assert.match(service, /actorSide\(sol, user\)/);
  assert.match(service, /canManageItems,/);
  assert.match(service, /isOpenForItemChanges,/);
});

test('interação dos formulários rápidos fica no JS da OS e CSS é responsivo', () => {
  const js = read('public/js/os-detalhe.js');
  const css = read('public/css/os-detail.css');

  assert.match(js, /\[data-material-panel\]/);
  assert.match(js, /\[data-material-toggle\]/);
  assert.match(js, /\[data-material-close\]/);
  assert.match(js, /setMaterialPanel/);

  assert.match(css, /\.material-quick-panel/);
  assert.match(css, /\.material-quick-form/);
  assert.match(css, /\.material-qty-form/);
  assert.match(css, /@media\(max-width:700px\).*material-head/s);
});

test('view da OS continua sendo EJS válido após integração', () => {
  const view = read('views/os/show.ejs');
  assert.doesNotThrow(() => ejs.compile(view, { filename: path.join(root, 'views/os/show.ejs') }));
});
