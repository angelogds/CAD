const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');

const view = path.join(__dirname, '../views/desenho-tecnico/index.ejs');
const runtime = fs.readFileSync(path.join(__dirname, '../public/js/desenho-tecnico-central.js'), 'utf8');
const drawing = (id, overrides = {}) => ({
  id, codigo: `CAD${id}`, titulo: `Desenho ${id}`, status: 'ATIVO', revisao: 2,
  atualizado_em: `2026-10-${String(id).padStart(2, '0')} 12:00:00`, ...overrides,
});
const render = (overrides = {}) => ejs.renderFile(view, {
  layout: () => '', canManage: true, canDelete: true,
  lista: [drawing(1)], equipamentos: [], filtros: { status: 'ATIVO' }, ...overrides,
});

test('início exibe os três desenhos ativos atualizados mais recentemente, sem alterar lista original', async () => {
  const lista = [drawing(1), drawing(4), drawing(2), drawing(5, { status: 'INATIVO' }), drawing(3), drawing(6, { atualizado_em: 'sem data' })];
  const html = await render({ lista });
  const recent = html.match(/<div class="dtc-recent-grid">([\s\S]*?)<\/section>/)[1];
  assert.equal((recent.match(/class="dtc-recent-card"/g) || []).length, 3);
  const codes = [...recent.matchAll(/class="dtc-recent-code">([^<]+)/g)].map((match) => match[1]);
  assert.deepEqual(codes, ['CAD4', 'CAD3', 'CAD2']);
  assert.deepEqual(lista.map((item) => item.id), [1, 4, 2, 5, 3, 6]);
  assert.doesNotMatch(html, /dtc-kpis/);
  assert.match(html, /6 desenhos nesta seleção/);
});

test('permissões distinguem consulta, gerenciamento e arquivamento em todos os atalhos', async () => {
  const readOnly = await render({ canManage: false, canDelete: false });
  assert.doesNotMatch(readOnly, /href="\/desenho-tecnico\/cad\/novo"|\/1\/editor|\/1\/pdf|\/1\/arquivar/);
  assert.match(readOnly, /href="\/desenho-tecnico\/cad\/1"/);
  assert.doesNotMatch(readOnly, /class="dtc-nav-link[^>]+>.*Arquivados/);
  const manage = await render({ canDelete: false });
  assert.match(manage, /href="\/desenho-tecnico\/cad\/novo"/);
  assert.match(manage, /href="\/desenho-tecnico\/cad\/1\/editor"/);
  assert.doesNotMatch(manage, /action="\/desenho-tecnico\/cad\/1\/arquivar"/);
  const admin = await render();
  assert.match(admin, /method="POST" action="\/desenho-tecnico\/cad\/1\/arquivar" onsubmit="return confirm\(/);
  assert.match(admin, /dados serão preservados/i);
});

test('arquivo mantém registros sem atalhos de edição ou arquivamento duplicado', async () => {
  const html = await render({ filtros: { status: 'INATIVO' }, lista: [drawing(1, { status: 'INATIVO' })] });
  assert.match(html, /Desenhos arquivados/);
  assert.match(html, /Dados preservados/);
  assert.doesNotMatch(html, /class="dtc-recent-card"|\/1\/editor|\/1\/pdf|\/1\/arquivar/);
  assert.match(html, /class="dtc-nav-link is-current" aria-current="page"/);
});

test('filtros GET preservam busca, equipamento e status com valores escapados', async () => {
  const html = await render({
    filtros: { q: 'Eixo "A" <10>', equipamento_id: '9', status: 'INATIVO' },
    equipamentos: [{ id: 9, nome: 'Prensa <3>', codigo: 'EQ009' }],
  });
  assert.match(html, /method="GET" action="\/desenho-tecnico"/);
  assert.match(html, /name="q"[^>]*value="Eixo &#34;A&#34; &lt;10&gt;"/);
  assert.match(html, /option value="9" selected/);
  assert.match(html, /option value="INATIVO" selected/);
  assert.match(html, /Prensa &lt;3&gt;/);
  assert.doesNotMatch(html, /class="dtc-recent-card"/);
});

test('estados vazios orientam nova criação, consulta, arquivo ou limpeza de busca', async () => {
  const initial = await render({ lista: [] });
  assert.match(initial, /Seu próximo desenho começa aqui/);
  assert.match(initial, /Criar primeiro desenho/);
  const readOnly = await render({ lista: [], canManage: false });
  assert.match(readOnly, /disponíveis aqui para consulta/);
  assert.doesNotMatch(readOnly, /href="\/desenho-tecnico\/cad\/novo"/);
  const archived = await render({ lista: [], filtros: { status: 'INATIVO' } });
  assert.match(archived, /Nenhum desenho arquivado/);
  assert.doesNotMatch(archived, /Criar primeiro desenho/);
  const filtered = await render({ lista: [], filtros: { status: 'INATIVO', q: 'inexistente' } });
  assert.match(filtered, /Nenhum desenho corresponde à busca/);
  assert.match(filtered, /href="\/desenho-tecnico\?status=INATIVO">Limpar busca/);
});

test('metadados textuais ficam escapados sem entrar no código da confirmação', async () => {
  const html = await render({ lista: [drawing(1, { codigo: "CAD'1", titulo: '<img src=x onerror=alert(1)>', revisao: null })] });
  assert.match(html, /CAD&#39;1/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html.match(/onsubmit="([^"]+)"/)[1], /CAD/);
  assert.match(html, /REV\. —/);
});

function runDisplay({ saved = null, unavailable = false, empty = false } = {}) {
  const writes = [];
  const buttons = ['list', 'cards'].map((value) => ({
    dataset: { cadView: value }, attributes: {},
    setAttribute(name, setting) { this.attributes[name] = setting; },
    addEventListener(_type, listener) { this.click = listener; },
  }));
  const records = { dataset: { view: 'list' } };
  const controls = { hidden: true, querySelectorAll: () => buttons };
  const root = { querySelector: (selector) => selector === '[data-cad-records]' ? empty ? null : records : controls };
  vm.runInNewContext(runtime, {
    document: { querySelector: () => root },
    window: { localStorage: {
      getItem() { if (unavailable) throw new Error('blocked'); return saved; },
      setItem(key, value) { if (unavailable) throw new Error('blocked'); writes.push([key, value]); },
    } },
  });
  return { records, controls, buttons, writes };
}

test('lista/cartões restaura preferência e mantém uma única seleção acessível', () => {
  const { records, controls, buttons, writes } = runDisplay({ saved: 'cards' });
  assert.equal(records.dataset.view, 'cards');
  assert.equal(controls.hidden, false);
  assert.equal(buttons[0].attributes['aria-pressed'], 'false');
  assert.equal(buttons[1].attributes['aria-pressed'], 'true');
  buttons[0].click();
  assert.equal(records.dataset.view, 'list');
  assert.deepEqual(writes, [['cg.cad.central.view', 'list']]);
});

test('lista continua funcional com storage bloqueado e controles ficam ocultos sem registros', () => {
  const blocked = runDisplay({ unavailable: true });
  assert.equal(blocked.records.dataset.view, 'list');
  blocked.buttons[1].click();
  assert.equal(blocked.records.dataset.view, 'cards');
  assert.equal(runDisplay({ saved: 'unknown' }).records.dataset.view, 'list');
  assert.equal(runDisplay({ empty: true }).controls.hidden, true);
});
