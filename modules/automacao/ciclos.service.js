'use strict';
// Históricos e relógio de servidor. REAL_MANUAL = apontamento humano, não telemetria/PT100.
// SIMULACAO usa segundos VIRTUAIS e nunca conta como produção de empregado.
const db = require('../../database/db');
const STAGES = Object.freeze({
  CARREGANDO: ['INICIAR_COZIMENTO','COZINHANDO','carga_fim_ms'],
  COZINHANDO: ['INICIAR_DESCARGA','DESCARREGANDO','cozimento_fim_ms'],
  DESCARREGANDO: ['CONCLUIR','CONCLUIDO','descarga_fim_ms'],
});
function bad(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function numberId(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw bad(field + ' inválido.');
  return n;
}
function sec(a,b) { return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b-a)/1000) : null; }
function durations(row) {
  if (row.origem === 'SIMULACAO') return {
    carga_s: row.duracao_virtual_carga_s, cozimento_s: row.duracao_virtual_cozimento_s,
    descarga_s: row.duracao_virtual_descarga_s, transferencia_s: row.duracao_virtual_transferencia_s,
    unidade: 'SEGUNDOS_VIRTUAIS'
  };
  const until = row.status === 'CANCELADO' ? null : row.descarga_fim_ms;
  return { carga_s: sec(row.inicio_ms,row.carga_fim_ms),
    cozimento_s: sec(row.carga_fim_ms,row.cozimento_fim_ms),
    descarga_s: sec(row.cozimento_fim_ms,until), transferencia_s:null,
    unidade:'SEGUNDOS_REAIS_APONTADOS' };
}
function getColaboradores() {
  return db.prepare("SELECT id, nome FROM colaboradores WHERE deleted_at IS NULL AND COALESCE(ativo,1)=1 ORDER BY nome").all();
}
function openReal({digestor_id,colaborador_id,observacao,actor}) {
  const digestor=numberId(digestor_id,'Digestor'), colab=numberId(colaborador_id,'Colaborador');
  if(digestor>4)throw bad('Digestor inválido.');
  const person=db.prepare("SELECT id FROM colaboradores WHERE id=? AND deleted_at IS NULL AND COALESCE(ativo,1)=1").get(colab);
  if(!person)throw bad('Colaborador inexistente/inativo. Selecione o responsável confirmado.');
  const note=String(observacao||'').trim().slice(0,500);
  const now=Date.now();
  try {
    const run=db.prepare(`INSERT INTO automacao_digestor_ciclos
       (digestor_id,origem,colaborador_id,registrado_por_user_id,atualizado_por_user_id,status,inicio_ms,atualizado_ms,observacao)
       VALUES(?,'REAL_MANUAL',?,?,?,'CARREGANDO',?,?,?)`)
       .run(digestor,colab,numberId(actor,'Usuário'),Number(actor),now,now,note||null);
    return getById(Number(run.lastInsertRowid));
  } catch(e) {
    if (/UNIQUE constraint failed/i.test(String(e.message))) throw bad('Já existe um ciclo real aberto para este digestor.',409);
    throw e;
  }
}
function getById(id) {
  return db.prepare(`SELECT t.*, c.nome AS colaborador_nome
    FROM automacao_digestor_ciclos t LEFT JOIN colaboradores c ON c.id=t.colaborador_id
    WHERE t.id=?`).get(numberId(id,'Ciclo'));
}
function moveReal({id,action,actor}) {
  const cycle=getById(id);
  if (!cycle) throw bad('Ciclo não encontrado.',404);
  if (cycle.origem!=='REAL_MANUAL') throw bad('Simulação não aceita transições de produção.',409);
  const act=String(action||'').toUpperCase();
  const now=Date.now();
  if (act==='CANCELAR' && !['CONCLUIDO','CANCELADO'].includes(cycle.status)) {
    const result=db.prepare(`UPDATE automacao_digestor_ciclos
      SET status='CANCELADO', atualizado_ms=?, atualizado_por_user_id=?
      WHERE id=? AND status=?`).run(now,numberId(actor,'Usuário'),cycle.id,cycle.status);
    if(!result.changes) throw bad('O ciclo foi alterado. Atualize a tela.',409);
    return getById(cycle.id);
  }
  const transition=STAGES[cycle.status];
  if(!transition || act!==transition[0])throw bad('Transição inválida para a etapa atual.',409);
  const column=transition[2]; // lista fechada do servidor; não vem do usuário.
  const result=db.prepare(`UPDATE automacao_digestor_ciclos
    SET status=?, ${column}=?, atualizado_ms=?, atualizado_por_user_id=?
    WHERE id=? AND status=?`).run(transition[1],now,now,numberId(actor,'Usuário'),cycle.id,cycle.status);
  if(!result.changes) throw bad('O ciclo foi alterado. Atualize a tela.',409);
  return getById(cycle.id);
}
function saveSimulation({key,digestor_id,carga_s,cozimento_s,descarga_s,transferencia_s,actor}) {
  const id=numberId(digestor_id,'Digestor');
  if(id>4)throw bad('Digestor inválido.');
  if(!/^[a-zA-Z0-9_:-]{10,110}$/.test(String(key||'')))throw bad('Identificador da simulação inválido.');
  const values=[carga_s,cozimento_s,descarga_s,transferencia_s].map(x=>Number(x));
  if(values.some(x=>!Number.isFinite(x)||x<0||x>86400))throw bad('Duração virtual inválida.');
  const now=Date.now();
  db.prepare(`INSERT OR IGNORE INTO automacao_digestor_ciclos
    (digestor_id,origem,colaborador_id,registrado_por_user_id,atualizado_por_user_id,
      status,inicio_ms,carga_fim_ms,cozimento_fim_ms,descarga_fim_ms,atualizado_ms,
      chave_simulacao,duracao_virtual_carga_s,duracao_virtual_cozimento_s,
      duracao_virtual_descarga_s,duracao_virtual_transferencia_s)
    VALUES(?,'SIMULACAO',NULL,?,?,'CONCLUIDO',?,NULL,NULL,NULL,?,?,?,?,?,?)`)
    .run(id,numberId(actor,'Usuário'),Number(actor),now,now,key,...values);
  const cycle=db.prepare('SELECT id,digestor_id,origem FROM automacao_digestor_ciclos WHERE chave_simulacao=?').get(key);
  if(!cycle||cycle.digestor_id!==id)throw bad('Chave de simulação já usada para outro digestor.',409);
  return cycle;
}
function interval(date, end=false) {
  if(!date)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw bad('Data inválida.');
  const epoch=Date.parse(date+(end?'T23:59:59.999-03:00':'T00:00:00.000-03:00'));
  if(!Number.isFinite(epoch))throw bad('Data inválida.');
  return epoch;
}
function list({origem='REAL_MANUAL',de,ate,colaborador_id,digestor_id}={}) {
  if(!['REAL_MANUAL','SIMULACAO'].includes(origem))throw bad('Origem inválida.');
  const where=['t.origem=?'],args=[origem];
  const from=interval(de),to=interval(ate,true);
  if(from!==null){where.push('t.inicio_ms>=?');args.push(from);}
  if(to!==null){where.push('t.inicio_ms<=?');args.push(to);}
  if(colaborador_id){where.push('t.colaborador_id=?');args.push(numberId(colaborador_id,'Colaborador'));}
  if(digestor_id){const n=numberId(digestor_id,'Digestor');if(n>4)throw bad('Digestor inválido.');where.push('t.digestor_id=?');args.push(n);}
  const records=db.prepare(`SELECT t.*, c.nome AS colaborador_nome
    FROM automacao_digestor_ciclos t LEFT JOIN colaboradores c ON c.id=t.colaborador_id
    WHERE ${where.join(' AND ')} ORDER BY t.inicio_ms DESC,t.id DESC LIMIT 2000`).all(...args);
  const rows=records.map(t=>({...t,tempos:durations(t)}));
  const equipment=[1,2,3,4].map(n=>{
    const finished=rows.filter(t=>t.digestor_id===n&&t.status==='CONCLUIDO');
    return {digestor:n,concluidos:finished.length,
      carga_s:finished.reduce((a,t)=>a+(t.tempos.carga_s||0),0),
      cozimento_s:finished.reduce((a,t)=>a+(t.tempos.cozimento_s||0),0)};
  });
  const employees=new Map();
  if(origem==='REAL_MANUAL') for(const t of rows){
    if(t.status!=='CONCLUIDO'||!t.colaborador_id)continue;
    const k=t.colaborador_id;
    const row=employees.get(k)||{colaborador_id:k,nome:t.colaborador_nome||'Colaborador não encontrado',concluidos:0,carga_s:0,cozimento_s:0};
    row.concluidos++;row.carga_s+=t.tempos.carga_s||0;row.cozimento_s+=t.tempos.cozimento_s||0;
    employees.set(k,row);
  }
  return {rows,por_equipamento:equipment,por_colaborador:[...employees.values()].sort((a,b)=>b.concluidos-a.concluidos),
    total_concluidos:rows.filter(t=>t.status==='CONCLUIDO').length,total_abertos:rows.filter(t=>!['CONCLUIDO','CANCELADO'].includes(t.status)).length,
    origem,limitado:rows.length===2000};
}
module.exports={getColaboradores,openReal,moveReal,saveSimulation,list,getById,durations,bad,interval};
