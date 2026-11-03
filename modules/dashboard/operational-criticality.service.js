const defaultDb = require('../../database/db');
const { normalizeRole, ROLE } = require('../../config/rbac');
const { correctiveWhereSql, maintenanceTypeSql } = require('../../utils/os-maintenance-type');
const dateBr = require('../../utils/data-hora-br');

const CONFIG = Object.freeze({ reincidenciaDias: 15, falhasReforma: 3, criticasUrgente: 2, osAbertaLimiteDias: 7 });
const CLOSED = new Set(['CONCLUIDA','FINALIZADA','FECHADA','CANCELADA','CANCELADO']);
const ACTIVE = new Set(['ABERTA','ABERTO','AGUARDANDO_EQUIPE','ANDAMENTO','EM_ANDAMENTO','PAUSADA','PENDENTE']);
function cols(db, table) { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)); }
function hasTable(db, table) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?").get(table)); }
function norm(value) { return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(); }
function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(' ','T')}${raw.length > 10 ? 'Z' : 'T00:00:00Z'}`);
  return Number.isFinite(+d) ? d : null;
}
function daysBetween(a,b) { const da=parseDate(a), db=parseDate(b); return da && db ? Math.max(0,(db-da)/86400000) : null; }
function avg(values) { return values.length ? values.reduce((s,n)=>s+n,0)/values.length : null; }
function severity(value) { const v=norm(value); return ['CRITICA','CRITICO','EMERGENCIAL','URGENTE'].includes(v)?4:['ALTA','ALTO'].includes(v)?3:['MEDIA','MEDIO','NORMAL'].includes(v)?2:1; }
function priorityOf(row) { return ['EMERGENCIAL','CRITICA'].includes(norm(row.tipo))?'CRITICA':row.criticidade; }
function level(value) { return ['BAIXA','MEDIA','ALTA','CRITICA'][severity(value)-1]; }
function key(row) { return row.equipamento_id ? `id:${row.equipamento_id}` : `nome:${norm(row.equipamento_nome)}`; }
function trend(values) {
  if (values.length < 2) return 'Dados insuficientes';
  const a=avg(values.slice(0,Math.ceil(values.length/2))), b=avg(values.slice(Math.floor(values.length/2)));
  return b<a?'Piora: intervalo entre falhas reduziu':b>a?'Melhora: intervalo entre falhas aumentou':'Estável';
}
function validISO(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) && parseDate(value)?.toISOString().slice(0,10)===value; }
function parseFilters(query = {}) {
  const aliases = { '7d':7, '30d':30, hoje:1 };
  const selected = aliases[query.periodo] || Number(query.periodo);
  const days = [1,7,30,60,90,180].includes(selected) ? selected : 30;
  let end = validISO(query.fim) ? query.fim : dateBr.todayISO();
  const startDate = new Date(`${end}T12:00:00Z`); startDate.setUTCDate(startDate.getUTCDate()-days+1);
  let start = validISO(query.inicio) ? query.inicio : startDate.toISOString().slice(0,10);
  if (query.periodo === 'mes' && !validISO(query.inicio)) start = `${end.slice(0,7)}-01`;
  if (start>end) [start,end]=[end,start];
  const relative=!validISO(query.inicio)&&!validISO(query.fim)&&query.periodo!=='personalizado';
  const periodo=relative?(query.periodo==='mes'?'mes':days===1?'hoje':String(days)):'personalizado';
  return { start,end,days,relative,periodo,setor:String(query.setor||'').trim(),equipamento_id:query.equipamento_id||'',criticidade:query.criticidade||'',tipo:query.tipo||'',status:query.status||'',ativo:query.ativo===undefined?'1':String(query.ativo) };
}
function canView(role) { return [ROLE.ADMIN,ROLE.DIRETORIA,ROLE.PCM,ROLE.MANUTENCAO_SUPERVISOR,ROLE.ENCARREGADO_MANUTENCAO,ROLE.MECANICO].includes(normalizeRole(role)); }
function canManage(role) { return [ROLE.ADMIN,ROLE.PCM,ROLE.MANUTENCAO_SUPERVISOR,ROLE.ENCARREGADO_MANUTENCAO].includes(normalizeRole(role)); }
function coalesce(c, names, alias, fallback="''") { const values=names.filter(n=>c.has(n)).map(n=>`NULLIF(TRIM(${alias}.${n}),'')`); return values.length?`COALESCE(${[...values,fallback].join(',')})`:fallback; }

function createOperationalCriticalityService(db=defaultDb) {
  function getFiltersOptions() {
    if (!hasTable(db,'equipamentos')) return {setores:[],equipamentos:[]};
    return {setores:db.prepare("SELECT DISTINCT setor FROM equipamentos WHERE COALESCE(setor,'')<>'' ORDER BY setor").all().map(r=>r.setor),equipamentos:db.prepare('SELECT id,nome,setor,ativo FROM equipamentos ORDER BY nome').all()};
  }
  function queryFailures(f,{current=false}={}) {
    if (!hasTable(db,'os')) return [];
    const c=cols(db,'os'), ec=cols(db,'equipamentos');
    const view=hasTable(db,'vw_criticidade_os_corretivas');
    const source=view?'vw_criticidade_os_corretivas':'os';
    const join=ec.size&&c.has('equipamento_id')?'LEFT JOIN equipamentos e ON e.id=o.equipamento_id':'LEFT JOIN (SELECT NULL id,NULL nome,NULL setor,NULL ativo,NULL criticidade,NULL status_operacional) e ON 1=0';
    const priority=coalesce(c,['grau','prioridade','ai_criticidade'],'o',"COALESCE(e.criticidade,'MEDIA')");
    const type=maintenanceTypeSql(db);
    const where=[view?'1=1':correctiveWhereSql(db)];
    if (current) where.push(`UPPER(TRIM(COALESCE(o.status,''))) IN (${[...ACTIVE].map(s=>`'${s}'`).join(',')})`);
    else where.push("date(o.opened_at,'-3 hours') BETWEEN date(@start) AND date(@end)");
    if (f.setor) where.push("COALESCE(e.setor,'')=@setor");
    if (f.equipamento_id) where.push('e.id=@equipamento_id');
    if (f.ativo!=='') where.push('COALESCE(e.ativo,1)=CAST(@ativo AS INTEGER)');
    if (!current) {
      if (f.criticidade) where.push(`UPPER(${priority})=UPPER(@criticidade)`);
      if (f.tipo) where.push(`UPPER(${type})=UPPER(@tipo)`);
      if (f.status) where.push('UPPER(TRIM(o.status))=UPPER(@status)');
    }
    const eqId=c.has('equipamento_id')?'o.equipamento_id':'NULL';
    const eqStatus=ec.has('status_operacional')?'e.status_operacional':'NULL';
    return db.prepare(`SELECT o.id,${eqId} equipamento_id,COALESCE(e.nome,o.equipamento,'Sem equipamento') equipamento_nome,
      COALESCE(e.setor,'-') setor,${eqStatus} status_equipamento,${type} tipo,COALESCE(o.status,'') status,
      ${priority} criticidade,o.opened_at,o.closed_at,o.descricao,date(o.opened_at,'-3 hours') data_falha
      FROM ${source} o ${join} WHERE ${where.join(' AND ')} ORDER BY equipamento_nome,datetime(o.opened_at),o.id`).all(f);
  }
  function buildRanking(rows,current,f={}) {
    const groups=new Map(), active=new Map();
    for(const row of current) { const k=key(row); if(!active.has(k))active.set(k,[]); active.get(k).push(row); }
    for(const row of rows) { const k=key(row); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(row); }
    return [...groups.entries()].map(([k,items])=>{
      const pendentes=active.get(k)||[], diffs=[];
      for(let i=1;i<items.length;i++) { const d=daysBetween(items[i-1].opened_at,items[i].opened_at); if(d!==null)diffs.push(d); }
      const valid=diffs.filter(d=>d>0), media=avg(valid);
      const worst=list=>list.reduce((max,r)=>severity(priorityOf(r))>severity(max)?level(priorityOf(r)):max,'BAIXA');
      const historical=worst(items), actual=pendentes.length?worst(pendentes):null;
      const states=new Set(pendentes.map(r=>norm(r.status)));
      const state=!pendentes.length?'SEM_CORRETIVA_ABERTA':states.has('EM_ANDAMENTO')||states.has('ANDAMENTO')?'EM_ANDAMENTO':states.has('PAUSADA')?'PAUSADA':'ABERTA';
      const first=items[0];
      return { equipamento_id:first.equipamento_id,equipamento_nome:first.equipamento_nome,setor:first.setor,
        total_falhas:items.length,os_criticas:items.filter(r=>severity(priorityOf(r))>=3).length,
        reincidencias:diffs.filter(d=>d<=CONFIG.reincidenciaDias).length,ultima_falha:items.at(-1).opened_at,
        criticidade:historical,criticidade_atual:actual,nivel:actual||'SEM_PENDENCIA',corretivas_abertas:pendentes.length,
        situacao_atual:state,status_equipamento:first.status_equipamento,
        intervalo:{diffs,media,menor:valid.length?Math.min(...valid):null,maior:valid.length?Math.max(...valid):null,anterior:valid.at(-1)??null,tendencia:trend(valid),insuficiente:valid.length===0},
        frequencia_media:media===null?'Dados insuficientes':`${media.toFixed(1)} dias`,
        historico_url:first.equipamento_id?`/dashboard/criticidade/equipamentos/${first.equipamento_id}?${new URLSearchParams({inicio:f.start||'',fim:f.end||'',ativo:f.ativo??'1'})}`:`/os?tipo=CORRETIVA&equipamento=${encodeURIComponent(first.equipamento_nome)}` };
    }).sort((a,b)=>b.total_falhas-a.total_falhas||b.os_criticas-a.os_criticas||a.equipamento_nome.localeCompare(b.equipamento_nome,'pt-BR'));
  }
  function osSummary(rows) {
    const summary={abertas:0,aguardando_equipe:0,andamento:0,pausadas:0,criticas_emergenciais:0,finalizadas_periodo:0,vencidas:0,tempo_medio_fechamento_horas:null};
    const hours=[];
    for(const row of rows) {
      const status=norm(row.status);
      if(['ABERTA','ABERTO','PENDENTE'].includes(status))summary.abertas++;
      else if(status==='AGUARDANDO_EQUIPE')summary.aguardando_equipe++;
      else if(['ANDAMENTO','EM_ANDAMENTO'].includes(status))summary.andamento++;
      else if(status==='PAUSADA')summary.pausadas++;
      else if(CLOSED.has(status))summary.finalizadas_periodo++;
      if(severity(priorityOf(row))===4)summary.criticas_emergenciais++;
      if(ACTIVE.has(status)&&daysBetween(row.opened_at,new Date().toISOString())>CONFIG.osAbertaLimiteDias)summary.vencidas++;
      const start=parseDate(row.opened_at), end=parseDate(row.closed_at);
      if(CLOSED.has(status)&&start&&end&&end>=start)hours.push((end-start)/3600000);
    }
    summary.tempo_medio_fechamento_horas=avg(hours); return summary;
  }
  function interventions(ranking) {
    return ranking.filter(i=>i.total_falhas>=CONFIG.falhasReforma||i.os_criticas>=CONFIG.criticasUrgente||i.reincidencias>0).map(i=>({
      ...i,origem:'AUTOMATICA',situacao_solicitacao:'Sugestão do sistema — requer avaliação da manutenção/PCM',
      motivo:!i.corretivas_abertas?'Ocorrências encerradas; acompanhar o histórico, sem corretiva pendente.':i.os_criticas>=CONFIG.criticasUrgente?'Avaliar ocorrências críticas/emergenciais':i.total_falhas>=CONFIG.falhasReforma?'Avaliar falhas repetidas':'Avaliar reincidência',
      classificacao:!i.corretivas_abertas?'Acompanhamento histórico':i.os_criticas>=CONFIG.criticasUrgente?'Avaliação prioritária':i.total_falhas>=CONFIG.falhasReforma?'Avaliar reforma':'Avaliar reincidência',responsavel:'Manutenção/PCM' }));
  }
  function series(rows,f) {
    const size=Math.round((new Date(`${f.end}T12:00:00Z`)-new Date(`${f.start}T12:00:00Z`))/86400000)+1;
    const bins=Array.from({length:Math.min(4,size)},(_,i)=>{const start=new Date(`${f.start}T12:00:00Z`);start.setUTCDate(start.getUTCDate()+Math.floor(i*size/Math.min(4,size)));const end=new Date(`${f.start}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+Math.floor((i+1)*size/Math.min(4,size))-1);return {inicio:start.toISOString().slice(0,10),fim:end.toISOString().slice(0,10),falhas:0};});
    for(const row of rows) {const date=row.data_falha||String(row.opened_at).slice(0,10);const bin=bins.find(b=>date>=b.inicio&&date<=b.fim);if(bin)bin.falhas++;}
    return bins;
  }
  function getDashboard(query={}) {
    const filters=parseFilters(query), rows=queryFailures(filters), all=buildRanking(rows,queryFailures(filters,{current:true}),filters);
    const ranking=all.slice(0,5);
    return {config:CONFIG,filters,options:getFiltersOptions(),ranking,osResumo:osSummary(rows),intervencoes:interventions(ranking),
      resumo:{equipamentos:all.length,falhas:rows.length,reincidencias:all.reduce((n,i)=>n+i.reincidencias,0),com_corretiva_aberta:all.filter(i=>i.corretivas_abertas>0).length,criticos_atuais:all.filter(i=>i.criticidade_atual&&severity(i.criticidade_atual)>=3).length,encerrados:all.filter(i=>!i.corretivas_abertas).length},
      serie_falhas:series(rows,filters),atualizado_em:new Date().toISOString(),canManage,canView};
  }
  function getRanking(filters) { return buildRanking(queryFailures(filters),queryFailures(filters,{current:true}),filters).slice(0,5); }
  function getDetalhe(equipamentoId,query={}) { const filters=parseFilters({...query,equipamento_id:equipamentoId});return {filters,ocorrencias:queryFailures(filters)}; }
  return {parseFilters,getDashboard,getRanking,getOsResumo:f=>osSummary(queryFailures(f)),getIntervencoes:f=>interventions(getRanking(f)),getDetalhe,canView,canManage,_listFailures:queryFailures};
}
module.exports=createOperationalCriticalityService();
module.exports.createOperationalCriticalityService=createOperationalCriticalityService;
module.exports.CONFIG=CONFIG;
