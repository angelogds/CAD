const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.attributes={}; this.style={}; this.events={}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  setAttribute(name,value) { this.attributes[name]=value; }
  addEventListener(name,callback) { this.events[name]=callback; }
  querySelector(selector) { return this.children.find(child=>child.className?.split(' ').includes(selector.slice(1))) || null; }
}

async function render(total, search='?setor=RECICLAGEM', pendentesVinculo=[]) {
  const dashboard=new Element('main');
  const rows=Array.from({length:total},(_,i)=>({id:i+1,demanda_id:10+i,os_id:100+i,itens_count:2,itens_cotados:i===0?2:0}));
  const requests=[];
  const doc={readyState:'complete',createElement:tag=>new Element(tag),querySelector:selector=>selector==='.purchase-dashboard'?dashboard:null};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/compras-demandas-pre-cotacao.js'),'utf8'),{
    document:doc,window:{location:{search}},URLSearchParams,
    fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({ok:true,total,rows:url.includes('todas=1')?rows:rows.slice(0,5),pendentesVinculo})};},
  });
  await new Promise(resolve=>setImmediate(resolve));
  return {panel:dashboard.children[0],requests};
}

test('card mostra cinco, abre todas e recolhe sem duplicar registros',async()=>{
  const {panel,requests}=await render(12);
  const list=panel.querySelector('.demand-prequote-list');
  assert.equal(list.children.length,5);
  const counter=panel.querySelector('.demand-prequote-head').querySelector('.demand-prequote-count');
  assert.equal(counter.children[0].textContent,'12');
  const first=list.children[0];
  assert.match(first.children[0].children[2].textContent,/OS #100/);
  assert.equal(first.children[2].children[0].textContent,'Pré-cotação preparada');
  assert.equal(first.children[2].children[2].href,'/compras/solicitacoes/1');
  const [summary,toggle]=panel.querySelector('.demand-prequote-footer').children;
  assert.equal(summary.textContent,'Exibindo 5 de 12 pré-cotações');
  await toggle.events.click();
  assert.equal(list.children.length,12);
  assert.equal(new Set(list.children.map(row=>row.children[0].children[0].href)).size,12);
  assert.equal(toggle.textContent,'Mostrar apenas 5');
  assert.equal(toggle.attributes['aria-expanded'],'true');
  await toggle.events.click();
  assert.equal(list.children.length,5);
  assert.equal(toggle.attributes['aria-expanded'],'false');
  await toggle.events.click();
  assert.equal(list.children.length,12);
  assert.equal(requests.length,2);
});

test('até cinco pré-cotações não cria botão de expansão',async()=>{
  for(const total of [1,5]) {
    const {panel}=await render(total);
    assert.equal(panel.querySelector('.demand-prequote-list').children.length,total);
    assert.equal(panel.querySelector('.demand-prequote-footer'),null);
  }
});

test('pré-cotação aparece em Todas e destaca solicitações de Demanda sem vínculo', async()=>{
  const {panel}=await render(0,'',[{id:76,numero:'SOL-76',titulo:'Material da Caldeira',itens_count:2}]);
  assert.ok(panel);
  const warning=panel.querySelector('.demand-prequote-diagnostic');
  assert.ok(warning);
  assert.match(warning.children[0].textContent,/vínculo pendente: 1/);
  assert.equal(warning.children[2].children[0].children[0].href,'/compras/solicitacoes/76');
  const empty=panel.querySelector('.demand-prequote-empty');
  assert.ok(empty);
  const other=await render(2,'?setor=LOGISTICA');
  assert.equal(other.panel,undefined);
  assert.equal(other.requests.length,0);
});
