const test=require('node:test');
const assert=require('node:assert/strict');
const { once }=require('node:events');
const { consolidar,periodoSeguro }=require('../modules/almoxarifado/almoxarifado.gerencial.service');
const { gerarResumoAtrasos,filtrarAtrasos }=require('../modules/almoxarifado/almoxarifado.atrasos-fornecedor.service');
const { gerarDocumento }=require('../modules/almoxarifado/almoxarifado.gerencial.pdf');

async function render(info,pendencias,extra={}) {
  const pdf=gerarDocumento(info,pendencias,filtrarAtrasos(pendencias,{}),{emitidoEm:new Date('2026-11-02T15:00:00Z'),...extra});
  const calls=[],chunks=[];let page=0;
  pdf.doc.on('pageAdded',()=>page++);
  const original=pdf.doc.text.bind(pdf.doc);
  pdf.doc.text=(text,x,y,options)=>{calls.push({text:String(text),x,y,options,page});return original(text,x,y,options);};
  pdf.doc.on('data',c=>chunks.push(c));
  const complete=once(pdf.doc,'end');
  pdf.render();await complete;
  return {calls,buffer:Buffer.concat(chunks),pages:page+1};
}

test('PDF institucional pagina descrições longas, repete títulos e preserva a última linha',async()=>{
  const periodo=periodoSeguro({},'2026-11-02');
  const itens=Array.from({length:90},(_,n)=>({id:n+1,nome:`Material de validação ${n+1} — `+'Referência industrial e especificação '.repeat(5),unidade:'UN',saldo_atual:2,custo_unit:15,created_at:'2026-11-01',setor_utilizacao:'RECICLAGEM'}));
  itens.at(-1).nome='Último material de validação';
  const info=consolidar(itens,[],[],periodo);
  const pendencias=gerarResumoAtrasos([{solicitacao_id:1,numero:'SOL-TESTE',item_nome:'Material atrasado '+('especificação '.repeat(30)),fornecedor_nome:'Fornecedor de validação',unidade:'L',qtd_comprada:10,qtd_recebida:2,previsao_entrega:'2026-10-01'}],periodo.hoje);
  const r=await render(info,pendencias,{retiradas:{total:1,lista:[{item_nome:'Material de validação',numero:'SOL-TESTE',quantidade:2,unidade:'UN',retirante_nome:'Perfil retirante',entregador_nome:'Perfil almoxarife',data_mov:'2026-11-02',setor:'RECICLAGEM'}]}});
  assert.ok(r.pages>3);assert.match(r.buffer.subarray(0,8).toString(),/^%PDF-/);
  assert.ok(r.calls.some(c=>c.text==='Último material de validação'));
  assert.ok(r.calls.filter(c=>c.text.includes('INVENTÁRIO VALORIZADO')).length>1);
  assert.equal(r.calls.filter(c=>/^Página \d+ de /.test(c.text)).length,r.pages);
  assert.ok(r.calls.some(c=>c.text.includes('Retirou: Perfil retirante')));
  assert.ok(r.calls.some(c=>c.text.includes('Entregou: Perfil almoxarife')));
  for(const c of r.calls){
    assert.ok(c.x>=40&&c.x+c.options.width<=556,`texto fora da margem horizontal: ${c.text}`);
    assert.ok(c.y>=20&&c.y+c.options.height<818,`texto fora da página: ${c.text}`);
  }
});

test('PDF sem movimentos informa ausência de dados e não cria página vazia',async()=>{
  const periodo=periodoSeguro({},'2026-11-02');
  const r=await render(consolidar([],[],[],periodo),gerarResumoAtrasos([],periodo.hoje));
  assert.ok(r.calls.some(c=>c.text==='Sem entradas ou saídas registradas no intervalo.'));
  assert.ok(r.calls.some(c=>c.text==='Nenhum material com saldo atual.'));
  for(let p=0;p<r.pages;p++)assert.ok(r.calls.filter(c=>c.page===p&&c.y>90&&c.y<775).length>0);
});
