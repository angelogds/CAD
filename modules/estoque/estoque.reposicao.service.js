const db = require('../../database/db');
const estoque = require('./estoque.service');
const pre = require('../pre-solicitacoes/pre-solicitacoes.service');
const { normalizeRole } = require('../../config/rbac');
function exists(t) {return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);}
function number(v) {const n=Number(String(v??'').replace(',','.')); if(!Number.isFinite(n)||n<0) throw new Error('Informe uma quantidade válida, igual ou maior que zero.');return n;}
function rateio(v) {
  const data=typeof v==='string'?JSON.parse(v||'{}'):(v||{});const out={};
  for(const [key,value] of Object.entries(data)) {
    if(!['RECICLAGEM','FRIGORIFICO','LOGISTICA','ADMINISTRATIVO'].includes(key)) throw new Error('Setor inválido no rateio.');
    out[key]=number(value);
  } return out;
}
function ponto(item) { return item.ponto_reposicao!=null?Number(item.ponto_reposicao):Number(item.saldo_minimo||0)+(Number(item.consumo_90d||0)/90)*Number(item.prazo_reposicao_dias||0); }
function resumo() {
  if(!exists('estoque_reposicao_vinculos')) return [];
  const reserves=require('./estoque.reservas.service').resumoPorItem();
  const open=db.prepare(`SELECT si.estoque_item_id id,SUM(MAX(COALESCE(si.qtd_comprada,0)-COALESCE(si.qtd_recebida_total,0),0)) qtd
    FROM solicitacao_itens si JOIN solicitacoes s ON s.id=si.solicitacao_id WHERE si.status_compra='COMPRADO' AND s.status NOT IN ('CANCELADA','FECHADA') GROUP BY si.estoque_item_id`).all();
  const incoming=new Map(open.map(r=>[Number(r.id),Number(r.qtd)]));
  const pending=db.prepare(`SELECT v.estoque_item_id,s.id,s.numero,s.pre_status,s.status FROM estoque_reposicao_vinculos v JOIN solicitacoes s ON s.id=v.solicitacao_id WHERE s.status NOT IN ('CANCELADA','FECHADA','RECEBIDA_TOTAL','SEPARADA_PARA_RETIRADA','ENTREGUE_SOLICITANTE') AND COALESCE(s.pre_status,'')<>'REPROVADA' ORDER BY s.id`).all();
  const pedidos=new Map(pending.map(r=>[Number(r.estoque_item_id),r]));
  return estoque.listItens().map(i=>{
    const reservado=Number(reserves.get(Number(i.id))||0); const fisico=Number(i.saldo_atual||0); const livre=Math.max(fisico-reservado,0);
    const pedido=pedidos.get(Number(i.id));
    const pp=ponto(i);const alvo=Number(i.saldo_alvo||0); const chegada=Number(incoming.get(Number(i.id))||0);
    // Pedidos de reposição são expressos na unidade de controle do estoque.
    return {...i,ponto_calculado:pp,reservado,disponivel:livre,a_receber:chegada,pedido,necessidade:Math.max(alvo-livre-chegada,0),situacao:livre<=Number(i.saldo_minimo||0)?'RESERVA_MINIMA':livre<=pp?'REPOR':'OK'};
  });
}
function salvar(itemId,data) {
  const i=estoque.getItem(Number(itemId));if(!i) throw new Error('Material não encontrado.');
  const minimo=number(data.saldo_minimo);const pp=data.ponto_reposicao==null||data.ponto_reposicao===''?null:number(data.ponto_reposicao); const alvo=number(data.saldo_alvo);
  if(pp!=null&&pp<minimo) throw new Error('Ponto de reposição deve cobrir a reserva mínima.');
  if(alvo<Math.max(minimo,pp ?? ponto({...i,saldo_minimo:minimo,ponto_reposicao:null,prazo_reposicao_dias:number(data.prazo_reposicao_dias)}))) throw new Error('Saldo alvo deve cobrir o ponto de reposição e a reserva mínima.');
  const factor=data.fator_compra==null||data.fator_compra===''?null:number(data.fator_compra);if(factor===0) throw new Error('Fator de conversão deve ser maior que zero.');
  db.prepare(`UPDATE estoque_itens SET saldo_minimo=?,ponto_reposicao=?,saldo_alvo=?,prazo_reposicao_dias=?,unidade_compra=?,fator_compra=?,rateio_setores_json=?,updated_at=datetime('now') WHERE id=?`).run(minimo,pp,alvo,number(data.prazo_reposicao_dias),String(data.unidade_compra||i.unidade).trim().toUpperCase(),factor,JSON.stringify(rateio(data.rateio_setores_json)),i.id);
}
function semana() {const d=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'})+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear(); const week=Math.ceil((((d-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);return `${year}-W${String(week).padStart(2,'0')}`;}
function gerar(user) {
  if(!['ADMIN','ALMOXARIFADO'].includes(normalizeRole(user?.role))) throw new Error('A reposição é preparada pelo Almoxarifado.');
  return db.transaction(()=>{
    const ids=[];
    for(const i of resumo()) {
      if(i.pedido||i.ponto_calculado<=0||i.disponivel>i.ponto_calculado||i.necessidade<=0) continue;
      const setor=i.setor_utilizacao==='COMUM'?'RECICLAGEM':i.setor_utilizacao;
      if(!['RECICLAGEM','FRIGORIFICO','LOGISTICA','ADMINISTRATIVO'].includes(setor)) continue;
      const sol=pre.create({setor_origem:setor,subarea_destino:setor==='LOGISTICA'?'MANUTENÇÃO / FROTA':setor==='ADMINISTRATIVO'?'ADMINISTRATIVO':'MANUTENÇÃO',semana_referencia:semana(),acao:'rascunho',itens_nome:[i.nome],itens_un:[i.unidade],itens_qtd:[i.necessidade],itens_item_id:[i.id],observacao:`Reposição automática • saldo livre ${i.disponivel} ${i.unidade}; ponto ${i.ponto_calculado}; alvo ${i.saldo_alvo}. Rateio previsto por setor: ${i.rateio_setores_json||'{}'}`},user);
      db.prepare('INSERT INTO estoque_reposicao_vinculos(estoque_item_id,solicitacao_id) VALUES(?,?)').run(i.id,sol.id);
      db.prepare('UPDATE solicitacao_itens SET rateio_setores_json=? WHERE solicitacao_id=? AND estoque_item_id=?').run(i.rateio_setores_json||'{}',sol.id,i.id);
      ids.push(sol.id);
    }return ids;
  })();
}
function gerarAutomaticamente() {
  if(!exists('estoque_reposicao_vinculos')) return [];
  const user=db.prepare("SELECT id,role FROM users WHERE ativo=1 AND deleted_at IS NULL AND UPPER(role)='ALMOXARIFADO' ORDER BY id LIMIT 1").get();
  return user?gerar(user):[];
}
module.exports={resumo,salvar,gerar,gerarAutomaticamente,ponto,rateio};
