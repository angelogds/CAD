const db = require('../../database/db');

const TERMINAIS = new Set(['FECHADA', 'CANCELADA', 'RECEBIDA_TOTAL', 'ENTREGUE_SOLICITANTE']);
const pct = (n, d) => d > 0 ? (n / d) * 100 : 0;
const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));

function buildFilters(query = {}) {
  return {
    periodo: ['7','30','90','ano','todos','personalizado'].includes(query.periodo) ? query.periodo : '30',
    inicio: String(query.inicio || ''), fim: String(query.fim || ''),
    setor: String(query.setor || ''), responsavel: String(query.responsavel || ''), status: String(query.status || '')
  };
}

function getDashboard(query = {}) {
  const filters = buildFilters(query);
  const sc = columns('solicitacoes'); const ic = columns('solicitacao_itens');
  const where = ['COALESCE(s.disponivel_compras,0)=1']; const params = [];
  if (filters.setor) { where.push('s.setor_origem=?'); params.push(filters.setor); }
  if (filters.responsavel) { where.push('s.compras_user_id=?'); params.push(Number(filters.responsavel)); }
  if (filters.status) { where.push('s.status=?'); params.push(filters.status); }
  let periodClause = '';
  if (['7','30','90'].includes(filters.periodo)) periodClause = `date(s.created_at)>=date('now','-${Number(filters.periodo)} days')`;
  if (filters.periodo === 'ano') periodClause = "strftime('%Y',s.created_at)=strftime('%Y','now')";
  if (filters.periodo === 'personalizado' && filters.inicio) { periodClause = 'date(s.created_at)>=date(?)'; params.push(filters.inicio); }
  if (filters.periodo === 'personalizado' && filters.fim) { periodClause += `${periodClause?' AND ':''}date(s.created_at)<=date(?)`; params.push(filters.fim); }
  // Pendências antigas nunca somem por causa do período.
  if (periodClause) where.push(`((${periodClause}) OR s.status NOT IN ('FECHADA','CANCELADA','RECEBIDA_TOTAL','ENTREGUE_SOLICITANTE'))`);
  const cancelled = ic.has('status_compra') ? "UPPER(COALESCE(si.status_compra,''))<>'CANCELADO'" : '1=1';
  const qtd = ic.has('qtd_solicitada') ? 'COALESCE(si.qtd_solicitada,0)' : 'COALESCE(si.quantidade,0)';
  const rows = db.prepare(`SELECT s.id,s.numero,s.titulo,s.status,s.os_id,s.setor_origem,s.prioridade,s.previsao_entrega,s.created_at,s.updated_at,
    e.nome equipamento_nome,u.name responsavel_nome,si.id item_id,${qtd} qtd_solicitada,
    ${ic.has('status_cotacao')?'si.status_cotacao':"'PENDENTE'"} status_cotacao,
    ${ic.has('status_compra')?'si.status_compra':"'PENDENTE'"} status_compra,
    ${ic.has('qtd_comprada')?'COALESCE(si.qtd_comprada,0)':'0'} qtd_comprada,
    ${ic.has('qtd_recebida_total')?'COALESCE(si.qtd_recebida_total,0)':'0'} qtd_recebida,
    ${ic.has('valor_unitario_centavos')?'COALESCE(si.valor_unitario_centavos,0)':'0'} unitario
    FROM solicitacoes s LEFT JOIN solicitacao_itens si ON si.solicitacao_id=s.id AND ${cancelled}
    LEFT JOIN equipamentos e ON e.id=s.equipamento_id LEFT JOIN users u ON u.id=s.compras_user_id
    WHERE ${where.join(' AND ')} ORDER BY s.created_at,s.id,si.id`).all(...params);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, {...r, itens:[]});
    if (r.item_id) map.get(r.id).itens.push(r);
  }
  const hoje = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia'}).format(new Date());
  const solicitacoes = [...map.values()].map(s => {
    const total=s.itens.length, cotados=s.itens.filter(i=>i.status_cotacao==='COTADO').length;
    const comprados=s.itens.filter(i=>i.status_compra==='COMPRADO').length;
    const recebidos=s.itens.filter(i=>Number(i.qtd_comprada||i.qtd_solicitada)>0&&Number(i.qtd_recebida)>=Number(i.qtd_comprada||i.qtd_solicitada)).length;
    const cotadoCentavos=s.itens.reduce((a,i)=>a+(i.status_cotacao==='COTADO'?Math.round(Number(i.qtd_solicitada)*Number(i.unitario)):0),0);
    const comprometidoCentavos=s.itens.reduce((a,i)=>a+(i.status_compra==='COMPRADO'?Math.round(Number(i.qtd_comprada||i.qtd_solicitada)*Number(i.unitario)):0),0);
    const recebidoCentavos=s.itens.reduce((a,i)=>a+Math.round(Number(i.qtd_recebida)*Number(i.unitario)),0);
    const atrasada=!!s.previsao_entrega&&s.previsao_entrega.slice(0,10)<hoje&&!TERMINAIS.has(s.status);
    return {...s,total,cotados,semCotacao:total-cotados,comprados,recebidos,percentualCotado:pct(cotados,total),percentualSemCotacao:pct(total-cotados,total),cotadoCentavos,comprometidoCentavos,recebidoCentavos,atrasada,venceHoje:!!s.previsao_entrega&&s.previsao_entrega.slice(0,10)===hoje};
  });
  const sum=k=>solicitacoes.reduce((a,s)=>a+Number(s[k]||0),0); const total=sum('total');
  const indicadores={solicitacoes:solicitacoes.length,total,cotados:sum('cotados'),semCotacao:sum('semCotacao'),comprados:sum('comprados'),recebidos:sum('recebidos'),valorCotadoCentavos:sum('cotadoCentavos')};
  const concluida=solicitacoes.filter(s=>TERMINAIS.has(s.status)&&s.status!=='CANCELADA').length;
  const fluxo={cotacao:pct(indicadores.cotados,total),compra:pct(indicadores.comprados,total),recebimento:pct(indicadores.recebidos,total),concluidas:pct(concluida,solicitacoes.length)};
  const equipamentos=new Map(); for(const s of solicitacoes){const nome=s.os_id?(s.equipamento_nome||`OS ${s.os_id} — equipamento não informado`):'Sem OS vinculada';equipamentos.set(nome,(equipamentos.get(nome)||0)+s.cotadoCentavos);}
  return {filters,solicitacoes,indicadores,fluxo,valores:{cotado:sum('cotadoCentavos'),comprometido:sum('comprometidoCentavos'),recebido:sum('recebidoCentavos'),saldo:Math.max(0,sum('comprometidoCentavos')-sum('recebidoCentavos'))},equipamentos:[...equipamentos].map(([nome,valor])=>({nome,valor})).sort((a,b)=>b.valor-a.valor),pendencias:{semCotacao:indicadores.semCotacao,atrasadas:solicitacoes.filter(s=>s.atrasada).length,vencemHoje:solicitacoes.filter(s=>s.venceHoje).length,semOs:solicitacoes.filter(s=>!s.os_id).length},setores:db.prepare('SELECT DISTINCT setor_origem nome FROM solicitacoes WHERE setor_origem IS NOT NULL ORDER BY 1').all(),responsaveis:db.prepare('SELECT id,name FROM users WHERE role IN (\'COMPRAS\',\'ADMIN\') ORDER BY name').all(),atualizadoEm:new Date()};
}
module.exports={getDashboard,buildFilters,pct};
