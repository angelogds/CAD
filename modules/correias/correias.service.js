const db = require('../../database/db');

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}
function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}
function normalize(value) { return String(value || '').trim(); }
function parseQty(value, fallback = 0) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(n) ? n : fallback;
}
function estoqueMinColumn() {
  if (hasColumn('estoque_itens','saldo_minimo')) return 'saldo_minimo';
  if (hasColumn('estoque_itens','estoque_min')) return 'estoque_min';
  return null;
}
function saldoColumn() {
  return hasColumn('estoque_itens','saldo_atual') ? 'saldo_atual' : null;
}

function reservadoExpr(alias = 'i') {
  const correias = tableExists('correias_pedidos') ? `COALESCE((SELECT SUM(quantidade) FROM correias_pedidos WHERE estoque_item_id=${alias}.id AND status IN ('SOLICITADA','SEPARADA')),0)` : '0';
  if (!tableExists('estoque_reservas')) return correias;
  return `${correias} + COALESCE((SELECT SUM(MAX(r.quantidade_reservada-r.quantidade_retirada,0))
    FROM estoque_reservas r
    WHERE r.estoque_item_id=${alias}.id AND r.status<>'CANCELADA'),0)`;
}

function listEquipamentos() {
  if (!tableExists('equipamentos')) return [];
  const ativo = hasColumn('equipamentos','ativo') ? 'WHERE COALESCE(ativo,1)=1' : '';
  return db.prepare(`SELECT id,nome,COALESCE(codigo,'') codigo,COALESCE(setor,'') setor FROM equipamentos ${ativo} ORDER BY nome`).all();
}

function listCorreiasEstoque() {
  if (!tableExists('estoque_itens')) return [];
  const saldo = saldoColumn();
  const minimo = estoqueMinColumn();
  const hasCat = hasColumn('estoque_itens','categoria_id') && tableExists('estoque_categorias');
  const hasSub = hasColumn('estoque_itens','subcategoria_id') && tableExists('estoque_categorias');
  const joins = [
    hasCat ? 'LEFT JOIN estoque_categorias c ON c.id=i.categoria_id' : 'LEFT JOIN (SELECT NULL id,NULL nome) c ON 1=0',
    hasSub ? 'LEFT JOIN estoque_categorias sc ON sc.id=i.subcategoria_id' : 'LEFT JOIN (SELECT NULL id,NULL nome,NULL parent_id) sc ON 1=0',
    hasSub ? 'LEFT JOIN estoque_categorias pc ON pc.id=sc.parent_id' : 'LEFT JOIN (SELECT NULL id,NULL nome) pc ON 1=0',
  ].join(' ');
  return db.prepare(`
    SELECT i.id,i.codigo,i.nome,i.unidade,
      ${saldo ? `COALESCE(i.${saldo},0)` : '0'} AS saldo_atual,
      MAX((${saldo ? `COALESCE(i.${saldo},0)` : '0'}) - ${reservadoExpr('i')},0) AS saldo_livre,
      ${reservadoExpr('i')} AS saldo_reservado,
      ${minimo ? `COALESCE(i.${minimo},0)` : '0'} AS saldo_minimo,
      c.nome categoria_nome,sc.nome subcategoria_nome
    FROM estoque_itens i
    ${joins}
    WHERE COALESCE(i.ativo,1)=1
      AND (
        UPPER(COALESCE(c.nome,''))='CORREIAS'
        OR UPPER(COALESCE(pc.nome,''))='CORREIAS'
        OR UPPER(COALESCE(i.nome,'')) LIKE '%CORREIA%'
      )
    ORDER BY COALESCE(sc.nome,c.nome,'ZZZ'),i.nome
  `).all();
}

function recalcularMinimoEstoque(itemId) {
  const id = Number(itemId || 0);
  const minCol = estoqueMinColumn();
  if (!id || !minCol || !tableExists('preventiva_planos')) return 0;
  const required = Number(db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(quantidade_material,1) * MAX(COALESCE(estoque_minimo_conjuntos,1),1)
    ),0) total
    FROM preventiva_planos
    WHERE estoque_item_id=?
      AND UPPER(COALESCE(tipo_plano,''))='TROCA_CORREIA'
      AND COALESCE(ativo,1)=1
  `).get(id)?.total || 0);
  db.prepare(`UPDATE estoque_itens SET ${minCol}=MAX(COALESCE(${minCol},0),?),updated_at=datetime('now') WHERE id=?`).run(required,id);
  return required;
}

function listPlanos(filters = {}) {
  if (!tableExists('preventiva_planos')) return [];
  const where = ["UPPER(COALESCE(p.tipo_plano,''))='TROCA_CORREIA'"];
  const params = [];
  const q = normalize(filters.q).toLowerCase();
  if (q) {
    where.push("(LOWER(COALESCE(e.nome,'')) LIKE ? OR LOWER(COALESCE(i.nome,'')) LIKE ? OR LOWER(COALESCE(i.codigo,'')) LIKE ?)");
    const like = `%${q}%`; params.push(like,like,like);
  }
  if (filters.equipamento_id) { where.push('p.equipamento_id=?'); params.push(Number(filters.equipamento_id)); }
  const saldoLivreSql = `MAX(COALESCE(i.saldo_atual,0)-${reservadoExpr('i')},0)`;
  if (String(filters.status || '').toUpperCase()==='CRITICO') where.push(`${saldoLivreSql} < COALESCE(p.quantidade_material,1)*MAX(COALESCE(p.estoque_minimo_conjuntos,1),1)`);
  if (String(filters.status || '').toUpperCase()==='OK') where.push(`${saldoLivreSql} >= COALESCE(p.quantidade_material,1)*MAX(COALESCE(p.estoque_minimo_conjuntos,1),1)`);

  return db.prepare(`
    SELECT p.id,p.equipamento_id,p.titulo,p.frequencia_tipo,p.frequencia_valor,p.ativo,p.observacao,
      p.estoque_item_id,COALESCE(p.quantidade_material,1) quantidade_material,
      MAX(COALESCE(p.estoque_minimo_conjuntos,1),1) estoque_minimo_conjuntos,
      p.baixa_estoque_automatica,
      e.nome equipamento_nome,COALESCE(e.codigo,'') equipamento_codigo,COALESCE(e.setor,'') setor,
      i.nome correia_nome,i.codigo correia_codigo,i.unidade,
      COALESCE(i.saldo_atual,0) saldo_atual,
      ${reservadoExpr('i')} saldo_reservado,
      MAX(COALESCE(i.saldo_atual,0)-${reservadoExpr('i')},0) saldo_livre,
      COALESCE((SELECT MIN(pe.data_prevista) FROM preventiva_execucoes pe
        WHERE pe.plano_id=p.id AND UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ATRASADA','EM_ANDAMENTO')),NULL) proxima_execucao,
      COALESCE((SELECT MAX(pe.data_executada) FROM preventiva_execucoes pe
        WHERE pe.plano_id=p.id AND UPPER(COALESCE(pe.status,'')) IN ('EXECUTADA','FINALIZADA','CONCLUIDA')),NULL) ultima_troca
    FROM preventiva_planos p
    JOIN equipamentos e ON e.id=p.equipamento_id
    LEFT JOIN estoque_itens i ON i.id=p.estoque_item_id
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE WHEN COALESCE(i.saldo_atual,0) < COALESCE(p.quantidade_material,1)*MAX(COALESCE(p.estoque_minimo_conjuntos,1),1) THEN 0 ELSE 1 END,
      COALESCE(proxima_execucao,'9999-12-31'),e.nome
  `).all(...params).map((row) => {
    const porTroca = Number(row.quantidade_material || 1);
    const conjuntos = Math.max(Number(row.estoque_minimo_conjuntos || 1),1);
    const minimo = porTroca * conjuntos;
    const saldoLivre = Number(row.saldo_livre ?? row.saldo_atual ?? 0);
    return {
      ...row,
      estoque_minimo_calculado:minimo,
      conjuntos_disponiveis: porTroca > 0 ? Math.floor(saldoLivre / porTroca) : 0,
      estoque_status: saldoLivre < minimo ? 'CRITICO' : 'OK',
    };
  });
}

function dashboard() {
  const rows = listPlanos({});
  return {
    planos: rows.length,
    equipamentos: new Set(rows.map((r)=>Number(r.equipamento_id))).size,
    criticos: rows.filter((r)=>r.estoque_status==='CRITICO').length,
    sem_estoque: rows.filter((r)=>Number(r.saldo_atual||0)<=0).length,
  };
}

function computeNextDate(tipo, valor, baseDate) {
  const base = normalize(baseDate) || db.prepare("SELECT date('now','localtime') d").get().d;
  const n = Math.max(1,Math.round(Number(valor)||1));
  const t = normalize(tipo).toLowerCase();
  if (t === 'semanal') return db.prepare("SELECT date(?, '+' || ? || ' day') d").get(base,n*7).d;
  if (t === 'mensal') return db.prepare("SELECT date(?, '+' || ? || ' month') d").get(base,n).d;
  if (t === 'anual') return db.prepare("SELECT date(?, '+' || ? || ' year') d").get(base,n).d;
  return db.prepare("SELECT date(?, '+' || ? || ' day') d").get(base,n).d;
}

function createPlano(data, userId = null) {
  if (!tableExists('preventiva_planos') || !tableExists('preventiva_execucoes')) {
    throw new Error('Estrutura de preventivas indisponível.');
  }
  const equipamentoId = Number(data.equipamento_id || 0);
  const estoqueItemId = Number(data.estoque_item_id || 0);
  const quantidade = parseQty(data.quantidade_material,0);
  const conjuntos = Math.max(1,parseQty(data.estoque_minimo_conjuntos,1));
  if (!equipamentoId) throw new Error('Selecione o equipamento.');
  if (!estoqueItemId) throw new Error('Selecione a correia do estoque.');
  if (!(quantidade > 0)) throw new Error('Informe a quantidade de correias usada em cada troca.');

  const item = listCorreiasEstoque().find((row)=>Number(row.id)===estoqueItemId);
  if (!item) throw new Error('O item selecionado não está classificado como correia no estoque.');

  const freqTipo = ['diario','semanal','mensal','anual'].includes(normalize(data.frequencia_tipo).toLowerCase())
    ? normalize(data.frequencia_tipo).toLowerCase() : 'mensal';
  const freqValor = Math.max(1,Math.round(Number(data.frequencia_valor)||1));
  const proxima = normalize(data.data_prevista) || computeNextDate(freqTipo,freqValor,null);
  const equipamento = db.prepare('SELECT id,nome FROM equipamentos WHERE id=?').get(equipamentoId);
  if (!equipamento) throw new Error('Equipamento não encontrado.');

  const checklist = [
    'Bloquear e sinalizar o equipamento antes da intervenção.',
    'Conferir desgaste das polias e alinhamento do conjunto.',
    'Substituir o conjunto de correias conforme quantidade prevista.',
    'Ajustar tensão e alinhamento antes do teste operacional.',
    'Registrar a troca e confirmar a baixa automática do estoque.'
  ];

  const tx = db.transaction(() => {
    const cols = db.prepare('PRAGMA table_info(preventiva_planos)').all().map((c)=>c.name);
    const fields = ['equipamento_id','titulo','frequencia_tipo','frequencia_valor','ativo','observacao'];
    const values = [
      equipamentoId,
      normalize(data.titulo) || `Troca de correias - ${equipamento.nome}`,
      freqTipo,freqValor,1,
      normalize(data.observacao) || `Troca programada de ${quantidade} ${item.unidade||'UN'} da correia ${item.nome}.`
    ];
    const optional = {
      tipo_plano:'TROCA_CORREIA',
      prioridade:'MEDIA',
      origem:'PLANO_CORREIAS',
      checklist_json:JSON.stringify(checklist),
      estoque_item_id:estoqueItemId,
      quantidade_material:quantidade,
      estoque_minimo_conjuntos:conjuntos,
      baixa_estoque_automatica:1,
    };
    for (const [key,value] of Object.entries(optional)) {
      if (!cols.includes(key)) continue;
      fields.push(key); values.push(value);
    }
    const info = db.prepare(`INSERT INTO preventiva_planos (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...values);
    const planoId = Number(info.lastInsertRowid);

    const execCols = db.prepare('PRAGMA table_info(preventiva_execucoes)').all().map((c)=>c.name);
    const eFields = ['plano_id','data_prevista','status','responsavel','observacao'];
    const eValues = [planoId,proxima,'PENDENTE','',`Troca programada de ${item.nome}`];
    if (execCols.includes('origem')) { eFields.push('origem'); eValues.push('PLANO_CORREIAS'); }
    db.prepare(`INSERT INTO preventiva_execucoes (${eFields.join(',')}) VALUES (${eFields.map(()=>'?').join(',')})`).run(...eValues);
    return planoId;
  });
  const planoId = tx();
  recalcularMinimoEstoque(estoqueItemId);
  return planoId;
}

function agendarProximaExecucao(planoId, execId) {
  const id=Number(planoId||0);
  const currentId=Number(execId||0);
  const plano=db.prepare(`
    SELECT id,frequencia_tipo,frequencia_valor,ativo,tipo_plano
    FROM preventiva_planos WHERE id=?
  `).get(id);
  if(!plano || Number(plano.ativo||0)!==1 || String(plano.tipo_plano||'').toUpperCase()!=='TROCA_CORREIA') return null;

  const pending=db.prepare(`
    SELECT id FROM preventiva_execucoes
    WHERE plano_id=? AND id<>?
      AND UPPER(COALESCE(status,'')) IN ('PENDENTE','ATRASADA','EM_ANDAMENTO')
    ORDER BY id DESC LIMIT 1
  `).get(id,currentId);
  if(pending?.id) return Number(pending.id);

  const current=db.prepare("SELECT COALESCE(data_executada,date('now','localtime')) base FROM preventiva_execucoes WHERE id=? AND plano_id=?").get(currentId,id);
  const nextDate=computeNextDate(plano.frequencia_tipo,plano.frequencia_valor,current?.base||null);
  const cols=db.prepare('PRAGMA table_info(preventiva_execucoes)').all().map((r)=>r.name);
  const fields=['plano_id','data_prevista','status','responsavel','observacao'];
  const values=[id,nextDate,'PENDENTE','', 'Próxima troca programada automaticamente pelo Plano de Correias.'];
  if(cols.includes('origem')){fields.push('origem');values.push('PLANO_CORREIAS');}
  const info=db.prepare(`INSERT INTO preventiva_execucoes (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...values);
  return Number(info.lastInsertRowid);
}

function getPlanoContext(planoId) {
  const id = Number(planoId || 0);
  if (!id) return null;
  const row = db.prepare(`
    SELECT p.id,p.equipamento_id,p.estoque_item_id,p.quantidade_material,p.estoque_minimo_conjuntos,
      p.baixa_estoque_automatica,p.tipo_plano,
      e.nome equipamento_nome,i.nome correia_nome,i.codigo correia_codigo,i.unidade,
      COALESCE(i.saldo_atual,0) saldo_atual,
      ${reservadoExpr('i')} saldo_reservado,
      MAX(COALESCE(i.saldo_atual,0)-${reservadoExpr('i')},0) saldo_livre
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id=p.equipamento_id
    LEFT JOIN estoque_itens i ON i.id=p.estoque_item_id
    WHERE p.id=? LIMIT 1
  `).get(id);
  if (!row || String(row.tipo_plano||'').toUpperCase()!=='TROCA_CORREIA') return null;
  const quantidade = Number(row.quantidade_material||1);
  const minimo = quantidade*Math.max(Number(row.estoque_minimo_conjuntos||1),1);
  return {...row,estoque_minimo_calculado:minimo,estoque_status:Number(row.saldo_livre ?? row.saldo_atual ?? 0)<minimo?'CRITICO':'OK'};
}

function baixarEstoquePreventiva({ planoId, execId, userId = null }) {
  if (tableExists('correias_pedidos')) {
    const pedidos = db.prepare('SELECT status,movimento_id FROM correias_pedidos WHERE preventiva_execucao_id=?').all(Number(execId));
    if (pedidos.length) {
      if (pedidos.some(p => ['SOLICITADA','SEPARADA','RETIRADA'].includes(p.status))) throw new Error('Conclua a retirada e confirme a troca das correias, ou cancele/devolva o pedido antes de concluir a preventiva.');
      return { skipped: true };
    }
    // Novas execuções usam o pedido e a baixa na retirada. O legado já baixado continua idempotente.
    const legado = db.prepare('SELECT estoque_movimento_id FROM preventiva_execucoes WHERE id=?').get(Number(execId));
    if (getPlanoContext(planoId) && !legado?.estoque_movimento_id) throw new Error('Solicite e retire as correias pelo Almoxarifado antes de concluir a troca.');
  }
  const plano = getPlanoContext(planoId);
  if (!plano || Number(plano.baixa_estoque_automatica||0)!==1) return { skipped:true };
  const quantidade = Number(plano.quantidade_material||0);
  if (!(quantidade > 0)) throw new Error('Plano de correias sem quantidade configurada.');
  if (!saldoColumn()) throw new Error('Saldo físico do estoque não está disponível para baixa automática.');

  return db.transaction(() => {
    const exec = db.prepare('SELECT id,estoque_movimento_id FROM preventiva_execucoes WHERE id=? AND plano_id=?').get(Number(execId),Number(planoId));
    if (!exec) throw new Error('Execução preventiva não encontrada.');
    if (exec.estoque_movimento_id) return { movimentoId:Number(exec.estoque_movimento_id), skipped:true };

    const item = db.prepare(`SELECT id,nome,unidade,COALESCE(saldo_atual,0) saldo_atual,
      ${reservadoExpr('estoque_itens')} saldo_reservado
      FROM estoque_itens WHERE id=? AND ativo=1`).get(Number(plano.estoque_item_id));
    if (!item) throw new Error('Correia vinculada não encontrada no estoque.');
    const anterior = Number(item.saldo_atual||0);
    const reservado = Number(item.saldo_reservado||0);
    const livre = Math.max(anterior-reservado,0);
    if (livre < quantidade) {
      throw new Error(`Estoque livre insuficiente para concluir a troca. Necessário: ${quantidade} ${item.unidade||'UN'}; livre: ${livre}; reservado: ${reservado}.`);
    }
    const posterior = anterior-quantidade;
    const updated = db.prepare("UPDATE estoque_itens SET saldo_atual=?,updated_at=datetime('now') WHERE id=? AND COALESCE(saldo_atual,0)=?").run(posterior,item.id,anterior);
    if (!updated.changes) throw new Error('Saldo alterado por outro usuário. Atualize e tente novamente.');

    const movementCols = db.prepare('PRAGMA table_info(estoque_movimentos)').all().map((c)=>c.name);
    const fields=['tipo','item_id','quantidade']; const values=['SAIDA_PREVENTIVA_CORREIA',item.id,quantidade];
    const optional={
      origem:'PREVENTIVA',equipamento_id:plano.equipamento_id,usuario_id:userId||null,
      saldo_anterior:anterior,saldo_posterior:posterior,
      observacao:`Troca preventiva de correia - plano #${planoId}, execução #${execId}`,
      identificacao_origem:'PREVENTIVA_CORREIA'
    };
    for(const [key,value] of Object.entries(optional)){if(movementCols.includes(key)){fields.push(key);values.push(value);}}
    const mov=db.prepare(`INSERT INTO estoque_movimentos (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...values);
    const movimentoId=Number(mov.lastInsertRowid);

    const execCols=db.prepare('PRAGMA table_info(preventiva_execucoes)').all().map((c)=>c.name);
    const sets=[]; const vals=[];
    if(execCols.includes('estoque_movimento_id')){sets.push('estoque_movimento_id=?');vals.push(movimentoId);}
    if(execCols.includes('estoque_quantidade_utilizada')){sets.push('estoque_quantidade_utilizada=?');vals.push(quantidade);}
    if(sets.length){vals.push(Number(execId));db.prepare(`UPDATE preventiva_execucoes SET ${sets.join(',')} WHERE id=?`).run(...vals);}
    return { movimentoId, quantidade, saldoAnterior:anterior, saldoPosterior:posterior };
  })();
}

module.exports = {
  listEquipamentos,
  listCorreiasEstoque,
  listPlanos,
  dashboard,
  createPlano,
  getPlanoContext,
  baixarEstoquePreventiva,
  agendarProximaExecucao,
  recalcularMinimoEstoque,
};
