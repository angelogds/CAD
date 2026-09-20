const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Solicitação deriva quantidade utilizada das saídas reais de estoque', () => {
  const service = read('modules/solicitacoes/solicitacoes.service.js');

  assert.match(service, /hasMovSolicitacaoItem/);
  assert.match(service, /UPPER\(COALESCE\(em\.tipo,''\)\) LIKE 'SAIDA%'/);
  assert.match(service, /em\.solicitacao_item_id=si\.id/);
  assert.match(service, /AS qtd_utilizada/);
  assert.match(service, /AS qtd_disponivel_retirada/);
  assert.match(service, /MAX\(\$\{qtdRecebidaExpr\} - \$\{qtdUtilizadaExpr\}, 0\)/);
});

test('OS mostra recebido, disponível e utilizado sem inventar quantidade', () => {
  const view = read('views/os/show.ejs');

  assert.match(view, /<th>Recebida<\/th>/);
  assert.match(view, /<th>Disponível<\/th>/);
  assert.match(view, /<th>Utilizada<\/th>/);
  assert.match(view, /item\.qtd_disponivel_retirada/);
  assert.match(view, /item\.qtd_utilizada/);
  assert.match(view, /totalMaterialDisponivel/);
});

test('OS só oferece retirada quando há saldo e permissão de estoque', () => {
  const controller = read('modules/os/os.controller.js');
  const view = read('views/os/show.ejs');

  assert.match(controller, /canWithdrawMaterial: canAccessModule\(role, "estoque_retirada"\)/);
  assert.match(view, /canWithdrawMaterial && !isOSFechada && totalMaterialDisponivel > 0/);
  assert.match(view, /\/almoxarifado\/retiradas\/qr\?solicitacao_id=<%= materialRequest\.id %>/);
});

test('scanner QR respeita a mesma permissão já existente para retirada', () => {
  const routes = read('modules/almoxarifado/almoxarifado.routes.js');

  assert.match(routes, /RETIRADA_QR_ACCESS/);
  assert.match(routes, /ACCESS\.almoxarifado_read/);
  assert.match(routes, /ACCESS\.estoque_retirada/);
  assert.match(routes, /router\.get\("\/retiradas\/qr",[\s\S]*requireRole\(RETIRADA_QR_ACCESS\)/);
  assert.match(routes, /router\.post\("\/reservas\/:reservaId\/retirar",[\s\S]*ACCESS\.estoque_retirada/);
});

test('histórico do equipamento reutiliza estoque_movimentos em vez de tabela paralela', () => {
  const service = read('modules/equipamentos/equipamentos.service.js');
  const controller = read('modules/equipamentos/equipamentos.controller.js');
  const view = read('views/equipamentos/show.ejs');

  assert.match(service, /function listConsumoMateriais/);
  assert.match(service, /FROM estoque_movimentos m/);
  assert.match(service, /m\.equipamento_id=@equipamento_id/);
  assert.match(service, /UPPER\(COALESCE\(m\.tipo,''\)\) LIKE 'SAIDA%'/);
  assert.match(service, /m\.solicitacao_id/);
  assert.match(service, /m\.solicitacao_item_id/);
  assert.match(service, /m\.os_id/);
  assert.match(controller, /service\.listConsumoMateriais\(id, filtros\)/);
  assert.match(view, /Consumo de materiais/);
  assert.match(view, /m\.retirado_por_nome/);
  assert.match(view, /m\.entregue_por_nome \|\| m\.usuario_nome/);
});

test('histórico de consumo usa os mesmos filtros de período do histórico da ficha', () => {
  const service = read('modules/equipamentos/equipamentos.service.js');

  assert.match(service, /filtros\.data_inicio/);
  assert.match(service, /date\(\$\{dataExpr\}\) >= date\(@data_inicio\)/);
  assert.match(service, /filtros\.data_fim/);
  assert.match(service, /date\(\$\{dataExpr\}\) <= date\(@data_fim\)/);
});

test('views alteradas continuam EJS válidas', () => {
  for (const file of ['views/os/show.ejs', 'views/equipamentos/show.ejs']) {
    const source = read(file);
    assert.doesNotThrow(() => ejs.compile(source, { filename: path.join(root, file) }), file);
  }
});

test('nenhuma migration nova foi necessária para fechar a rastreabilidade', () => {
  const service = read('modules/equipamentos/equipamentos.service.js');
  assert.match(service, /estoque_movimentos/);
  assert.match(service, /estoque_itens/);
});
