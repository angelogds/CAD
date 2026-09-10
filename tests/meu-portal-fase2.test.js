const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Meu Portal Fase 2 ativa Materiais e reutiliza a Jornada existente', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const controller = read('modules/meu-portal/meu-portal.controller.js');
  const view = read('views/meu-portal/index.ejs');

  assert.match(routes, /router\.get\('\/materiais', ctrl\.materiais\)/);
  assert.match(controller, /service\.listOwnMaterialWithdrawals\(req\.session\.user\.id/);
  assert.match(view, /href="\/meu-portal\/materiais"/);
  assert.match(view, /href="\/escala\/meu-painel"/);
  assert.match(view, /SERVIÇOS INTEGRADOS/);
  assert.match(view, /Materiais[\s\S]*DISPONÍVEL/);
  assert.match(view, /Jornada[\s\S]*DISPONÍVEL/);
});

test('histórico de materiais é estritamente pessoal, autenticado e somente leitura', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const service = read('modules/meu-portal/meu-portal.service.js');

  assert.match(routes, /router\.use\(requireLogin\)/);
  assert.match(service, /const colaborador = getLinkedColaborador\(userId\)/);
  assert.match(service, /m\.retirado_por_colaborador_id = \?/);
  assert.match(service, /params = \[Number\(colaborador\.id\)\]/);
  assert.match(service, /UPPER\(COALESCE\(m\.tipo,''\)\) LIKE 'SAIDA%'/);
  assert.doesNotMatch(routes, /router\.post\('\/materiais'/);
  assert.doesNotMatch(service, /UPDATE\s+estoque_movimentos|DELETE\s+FROM\s+estoque_movimentos|INSERT\s+INTO\s+estoque_movimentos/i);
});

test('materiais reutiliza rastreabilidade real de Estoque, Solicitação, OS e Equipamento', () => {
  const service = read('modules/meu-portal/meu-portal.service.js');
  const estoque = read('modules/estoque/estoque.reservas.service.js');

  assert.match(service, /hasColumn\('estoque_movimentos', 'retirado_por_colaborador_id'\)/);
  assert.match(service, /LEFT JOIN solicitacoes s ON s\.id=m\.solicitacao_id/);
  assert.match(service, /LEFT JOIN equipamentos eq ON eq\.id=m\.equipamento_id/);
  assert.match(service, /LEFT JOIN users eu ON eu\.id=m\.entregue_por_user_id/);
  assert.match(service, /COUNT\(DISTINCT m\.item_id\) materiais_diferentes/);
  assert.match(service, /LIMIT 300/);
  assert.match(estoque, /retirado_por_colaborador_id: colaborador\.id/);
  assert.match(estoque, /entregue_por_user_id: entreguePorUserId/);
  assert.match(estoque, /identificacao_origem: 'QR_COLABORADOR'/);
});

test('tela Meus Materiais oferece filtros, indicadores e rastreabilidade sem edição', () => {
  const view = read('views/meu-portal/materiais.ejs');
  const css = read('public/css/meu-portal.css');

  assert.match(view, /name="q"/);
  assert.match(view, /name="inicio"/);
  assert.match(view, /name="fim"/);
  assert.match(view, /Retiradas/);
  assert.match(view, /Materiais diferentes/);
  assert.match(view, /OS vinculadas/);
  assert.match(view, /Última retirada/);
  assert.match(view, /Solicitação/);
  assert.match(view, /Equipamento/);
  assert.match(view, /Entregue por/);
  assert.match(view, /somente leitura/);
  assert.doesNotMatch(view, /method="POST"/i);
  assert.match(css, /\.my-material-kpis/);
  assert.match(css, /\.my-material-table-wrap/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.my-material-kpis/);
  assert.match(css, /@media\(max-width:620px\)[\s\S]*\.my-material-filters/);
});

test('filtros de materiais validam período e não aceitam colaborador arbitrário', () => {
  const service = read('modules/meu-portal/meu-portal.service.js');
  const controller = read('modules/meu-portal/meu-portal.controller.js');

  assert.match(service, /normalizeMaterialFilters/);
  assert.match(service, /data inicial não pode ser posterior à data final/);
  assert.match(service, /date\(\$\{dataExpr\}\) >= date\(\?\)/);
  assert.match(service, /date\(\$\{dataExpr\}\) <= date\(\?\)/);
  assert.match(service, /LOWER\(COALESCE\(i\.nome,''\)\) LIKE \?/);
  assert.match(controller, /listOwnMaterialWithdrawals\(req\.session\.user\.id, \{[\s\S]*q: req\.query\.q,[\s\S]*inicio: req\.query\.inicio,[\s\S]*fim: req\.query\.fim/);
  assert.doesNotMatch(service, /filters\.colaborador|options\.colaborador/i);
});

test('Jornada da Fase 2 amplia somente o autoatendimento e continua isolando dados pessoais', () => {
  const rbac = read('config/rbac.js');
  const routes = read('modules/escala/escala.routes.js');
  const selfController = read('modules/escala/escala.self.controller.js');
  const controller = read('modules/escala/escala.controller.js');

  assert.match(rbac, /escala_self:\s*\[[^\]]*ROLE\.COMPRAS[^\]]*ROLE\.PCM[^\]]*ROLE\.INSPECAO_QUALIDADE/s);
  assert.match(routes, /router\.get\("\/meu-painel"[^\n]*escalaSelfRead/);
  assert.match(routes, /router\.get\("\/semana"[^\n]*escalaRead/);
  assert.match(selfController, /buscarColaboradorDoUsuario\(user\.id\)/);
  assert.match(selfController, /canViewAll:\s*false/);
  assert.match(controller, /if\(!all && own\?\.id !== id\) return res\.status\(403\)/);
});
