const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../modules/escala/escala.pdf.js'), 'utf8');

test('PDFs da Escala priorizam logo oficial da manutenção e paleta padrão', () => {
  assert.match(source, /public\/IMG\/logo_menu\.png\.png/);
  assert.match(source, /green:\s*"#16A34A"/);
  assert.match(source, /greenDark:\s*"#166534"/);
  assert.match(source, /ESCALA SEMANAL – MANUTENÇÃO INDUSTRIAL/);
  assert.match(source, /Banco de Horas da Manutenção/);
});

const generators = require('../modules/escala/escala.pdf');
const fixture = require('./fixtures/banco-horas-pdf');

async function capture(doc) {
  const pages = [doc.page];
  const texts = []; const rects = [];
  doc.on('pageAdded', () => pages.push(doc.page));
  const originalText = doc.text;
  doc.text = function (text, x, y, options = {}) {
    texts.push({ text:String(text), x, y, width:options.width, height:options.height,
      measured:this.widthOfString(String(text)), page:pages.indexOf(this.page) });
    return originalText.call(this, text, x, y, options);
  };
  const originalRect = doc.rect;
  doc.rect = function (x, y, w, h) {
    rects.push({ x, y, w, h, page:pages.indexOf(this.page) });
    return originalRect.call(this, x, y, w, h);
  };
  const chunks = [];
  for await (const chunk of doc) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert(bytes.subarray(-30).toString().includes('%%EOF'));
  return { pages, texts, rects, bytes };
}

function assertLayout(result) {
  const { pages, texts, rects } = result;
  for (let i = 0; i < pages.length; i += 1) {
    const here = texts.filter(t => t.page === i);
    assert(here.some(t => t.text === 'RECICLAGEM CAMPO DO GADO'), `Cabeçalho ausente na página ${i+1}`);
    assert(here.some(t => t.text === `Página ${i+1} de ${pages.length}`));
    assert(here.filter(t => t.y >= 100 && t.y < 772).length >= 5, 'Página vazia ou somente assinatura');
  }
  for (const t of texts) {
    assert(t.measured <= t.width + .5, `Texto excede célula: ${t.text}`);
    if (t.y < 100 || t.y >= 790) continue;
    assert(t.x >= 40 && t.x + t.width <= 555.3, `Texto fora da largura útil: ${t.text}`);
    assert(t.y + t.height <= 772, `Texto invade rodapé: ${t.text}`);
  }
  for (const r of rects.filter(r => r.y >= 100)) {
    assert(r.x >= 40 && r.x + r.w <= 555.3, 'Tabela excede margem direita');
    assert(r.y + r.h <= 772, 'Tabela invade rodapé');
  }
}

test('PDFs reais preservam OS, saldo negativo e nomes iguais com cadastros distintos', async () => {
  const result = await capture(generators.gerarPdfBancoHorasGeral(fixture));
  assertLayout(result);
  const text = result.texts.map(t => t.text).join('\n');
  assert.match(text, /Cadastro #103/);
  assert.match(text, /Cadastro #104/);
  assert.match(text, /-3h48/);
  assert.match(text, /-0,47/);
  assert.match(text, /8h00/);
  assert.match(text, /900/);
  assert.doesNotMatch(text, /\b901\b/); // lançamento sem os_id não recebe vínculo artificial
  assert.match(text, /PENDENTE APROVACAO/);
  assert.match(text, /Equipamento de exemplo/);
  assert.match(text, /DEMONSTRAÇÃO VISUAL/);
  const individual = await capture(generators.gerarPdfBancoHorasFuncionario({ ...fixture,
    filtros:{colaborador_id:100}, banco:[fixture.banco[0]], horasExtras:[{...fixture.horasExtras[0],equipamento_nome:null,os_equipamento:'Local vindo da OS',descricao_servico:null,os_descricao:'Serviço vindo da OS'}] }));
  assertLayout(individual);
  assert(individual.texts.some(t => t.text === 'Serviço vindo da OS'));
  assert(individual.texts.some(t => t.text === 'Local vindo da OS'));
});

test('tabelas longas repetem colunas e seções sem cortar registros ou criar páginas vazias', async () => {
  const horasExtras = Array.from({length:75}, (_, i) => ({...fixture.horasExtras[i%7],descricao_servico:`MARCADOR_${i+1}`}));
  const result = await capture(generators.gerarPdfBancoHorasGeral({...fixture,horasExtras}));
  assertLayout(result);
  for (let i = 1; i <= 75; i++) {
    const line = result.texts.find(t => t.text === `MARCADOR_${i}`);
    assert(line, `Registro ${i} ausente`);
    const here = result.texts.filter(t => t.page === line.page);
    assert(here.some(t => /DETALHAMENTO POR FUNCIONÁRIO/.test(t.text)));
    assert(here.some(t => t.text === 'Horas'));
    assert(here.some(t => /Serviço executado/.test(t.text)));
  }
});

test('serviço maior que uma página é dividido integralmente, inclusive palavra sem espaços', async () => {
  const content = Array.from({length:1200},(_,i)=>`palavra${i}`).join(' ');
  const result = await capture(generators.gerarPdfBancoHorasPorOs({...fixture,
    horasExtras:[{...fixture.horasExtras[0],descricao_servico:content+'\n'+'X'.repeat(500)+'\nFIM_DO_SERVICO'}] }));
  assertLayout(result);
  const text = result.texts.map(t => t.text).join(' ');
  for(let i=0;i<1200;i++) assert(new RegExp(`\\bpalavra${i}\\b`).test(text), `Trecho ${i} ausente`);
  assert.match(text,/FIM_DO_SERVICO/);
});

test('relatórios vazios e por OS cabem em uma página sem sobreposição do título', async () => {
  for(const name of ['gerarPdfBancoHorasGeral','gerarPdfBancoHorasFuncionario','gerarPdfBancoHorasPorOs']) {
    const result = await capture(generators[name]({...fixture,banco:[],horasExtras:[],folgas:[]}));
    assertLayout(result);
    assert.equal(result.pages.length,1);
  }
  const result = await capture(generators.gerarPdfBancoHorasGeral({...fixture,
    reportTitle:'Relatório consolidado do banco de horas da manutenção industrial para conferência do RH',banco:[],horasExtras:[],folgas:[]}));
  assertLayout(result);
  const title = result.texts.filter(t => t.y >= 108 && t.height === 23);
  assert(title.length > 1);
  const sub = result.texts.find(t => t.text === fixture.reportSubtitle);
  assert(sub.y >= title.at(-1).y + 23);
});
