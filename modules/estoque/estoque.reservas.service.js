const db = require('../../database/db');
const userQrService = require('../usuarios/usuarios.qr.service');
const fluxoSolicitacaoService = require('./estoque.solicitacao-fluxo.service');
const { isDirectUserIdentityRole } = require('../usuarios/usuarios.perfil');

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}
function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}
function normalizeQr(value) {
  let code = String(value || '').trim();
  if (!code) return '';
  if (/^CGCOL:/i.test(code)) code = code.replace(/^CGCOL:/i, '');
  try {
    if (/^https?:\/\//i.test(code)) {
      const parsed = new URL(code);
      code = parsed.searchParams.get('token') || parsed.pathname.split('/').filter(Boolean).pop() || '';
    }
  } catch (_error) {}
  return code.trim();
}
function itemNameExpr(alias = 'si') {
  const parts = [];
  if (hasColumn('solicitacao_itens', 'item_nome')) parts.push(`${alias}.item_nome`);
  if (hasColumn('solicitacao_itens', 'item_descricao')) parts.push(`${alias}.item_descricao`);
  if (hasColumn('solicitacao_itens', 'descricao')) parts.push(`${alias}.descricao`);
  parts.push(`'Item #' || ${alias}.id`);
  return `COALESCE(${parts.join(',')})`;
}

function getColaboradorByQr(codigo) {
  const token = normalizeQr(codigo);
  if (!token || !tableExists('colaboradores') || !hasColumn('colaboradores', 'qr_token')) return null;
  const deletedFilter = hasColumn('colaboradores', 'deleted_at') ? 'AND deleted_at IS NULL' : '';
  return db.prepare(`
    SELECT id,nome,apelido,funcao,setor,status,foto_url,user_id,qr_emitido_em
    FROM colaboradores
    WHERE qr_token=? AND COALESCE(qr_ativo,0)=1 ${deletedFilter}
      AND UPPER(COALESCE(status,'ATIVO'))='ATIVO'
  `).get(token) || null;
}

function getPessoaByQr(codigo) {
  const raw = String(codigo || '').trim();
  if (!raw) return null;

  if (/^CGUSR:/i.test(raw)) {
    const user = userQrService.getByQr(raw);
    if (!user) return null;
    return {
      identity_type: 'USUARIO',
      id: Number(user.id),
      user_id: Number(user.id),
      colaborador_id: null,
      nome: user.name,
      apelido: null,
      funcao: user.funcao || user.role,
      setor: user.setor || null,
      status: 'ATIVO',
      foto_url: user.photo_path || null,
      perfil_role: user.role,
      qr_emitido_em: user.qr_emitido_em || null,
    };
  }

  const colaborador = getColaboradorByQr(raw);
  if (!colaborador) return null;
  return identidadeColaborador(colaborador);
}

function identidadeColaborador(colaborador) {
  let perfil = null;
  if (colaborador.user_id) {
    const ativo=hasColumn('users','ativo')?'COALESCE(ativo,1)':'1';
    const deleted=hasColumn('users','deleted_at')?'deleted_at':'NULL';
    perfil=db.prepare(`SELECT id,name,role,${ativo} ativo,${deleted} deleted_at FROM users WHERE id=?`).get(Number(colaborador.user_id));
    if(!perfil || Number(perfil.ativo)!==1 || perfil.deleted_at)return null;
  }
  return {...colaborador,identity_type:'COLABORADOR',colaborador_id:Number(colaborador.id),
    user_id:perfil?Number(perfil.id):null,nome:perfil?.name||colaborador.nome,perfil_role:perfil?.role||colaborador.funcao};
}

function getPessoaByCadastro(tipo, id) {
  const identityType = String(tipo || '').trim().toUpperCase();
  const identityId = Number(id || 0);
  if (!identityId) return null;

  if (identityType === 'USUARIO') {
    const user = userQrService.getById(identityId);
    if (!user || Number(user.ativo ?? 1) !== 1 || user.deleted_at || !isDirectUserIdentityRole(user.role)) return null;
    return {
      identity_type: 'USUARIO',
      id: Number(user.id),
      user_id: Number(user.id),
      colaborador_id: null,
      nome: user.name,
      apelido: null,
      funcao: user.funcao || user.role,
      setor: user.setor || null,
      status: 'ATIVO',
      foto_url: user.photo_path || null,
      perfil_role: user.role,
      qr_emitido_em: user.qr_emitido_em || null,
    };
  }

  if (identityType !== 'COLABORADOR' || !tableExists('colaboradores')) return null;
  const deletedFilter = hasColumn('colaboradores', 'deleted_at') ? "AND deleted_at IS NULL" : "";
  const colaborador = db.prepare(`
    SELECT id,nome,apelido,funcao,setor,status,foto_url,user_id
    FROM colaboradores
    WHERE id=? ${deletedFilter}
      AND UPPER(COALESCE(status,'ATIVO'))='ATIVO'
    LIMIT 1
  `).get(identityId);
  if (!colaborador) return null;
  return identidadeColaborador(colaborador);
}

function listPessoasAtivas(query) {
  const q = String(query || '').trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const results = [];

  if (tableExists('colaboradores')) {
    const deletedFilter = hasColumn('colaboradores', 'deleted_at') ? "AND deleted_at IS NULL" : "";
    const rows = db.prepare(`
      SELECT id,nome,apelido,funcao,setor,status,foto_url,user_id
      FROM colaboradores
      WHERE UPPER(COALESCE(status,'ATIVO'))='ATIVO' ${deletedFilter}
        AND (
          LOWER(COALESCE(nome,'')) LIKE ? OR LOWER(COALESCE(apelido,'')) LIKE ?
          OR LOWER(COALESCE(funcao,'')) LIKE ? OR LOWER(COALESCE(setor,'')) LIKE ?
        )
      ORDER BY nome LIMIT 12
    `).all(like, like, like, like);
    for (const row of rows) {
      const pessoa = identidadeColaborador(row);
      if (!pessoa) continue;
      results.push({
        ...pessoa,
        identity_type: 'COLABORADOR',
        identity_id: Number(row.id),
        colaborador_id: Number(row.id),
      });
    }
  }

  if (tableExists('users')) {
    const rows = db.prepare(`
      SELECT id FROM users
      WHERE COALESCE(ativo,1)=1 AND COALESCE(deleted_at,'')=''
        AND LOWER(COALESCE(name,'')) LIKE ?
      ORDER BY name LIMIT 12
    `).all(like);
    for (const row of rows) {
      const user = userQrService.getById(row.id);
      if (!user || !isDirectUserIdentityRole(user.role)) continue;
      results.push({
        identity_type: 'USUARIO',
        identity_id: Number(user.id),
        id: Number(user.id),
        user_id: Number(user.id),
        colaborador_id: null,
        nome: user.name,
        funcao: user.funcao || user.role,
        setor: user.setor || null,
        foto_url: user.photo_path || null,
        status: 'ATIVO',
      });
    }
  }

  return results
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .slice(0, 15);
}

function dashboard() {
  if (!tableExists('estoque_reservas')) return { reservado: 0, retirado: 0, solicitacoes: 0, prontas: 0 };
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(MAX(quantidade_reservada-quantidade_retirada,0)),0) reservado,
      COALESCE(SUM(quantidade_retirada),0) retirado,
      COUNT(DISTINCT solicitacao_id) solicitacoes,
      COUNT(DISTINCT CASE WHEN quantidade_reservada>quantidade_retirada THEN solicitacao_id END) prontas
    FROM estoque_reservas
    WHERE status<>'CANCELADA'
      AND NOT EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id=estoque_reservas.solicitacao_id AND UPPER(TRIM(s.status)) IN ('CANCELADA','CANCELADO','FECHADA','FECHADO','ENTREGUE_SOLICITANTE'))
  `).get();
  return {
    reservado: Number(row?.reservado || 0),
    retirado: Number(row?.retirado || 0),
    solicitacoes: Number(row?.solicitacoes || 0),
    prontas: Number(row?.prontas || 0),
  };
}

function resumoPorItem() {
  if (!tableExists('estoque_reservas')) return new Map();
  const rows = db.prepare(`
    SELECT estoque_item_id,
      COALESCE(SUM(MAX(quantidade_reservada-quantidade_retirada,0)),0) reservado
    FROM estoque_reservas
    WHERE status<>'CANCELADA'
      AND NOT EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id=estoque_reservas.solicitacao_id AND UPPER(TRIM(s.status)) IN ('CANCELADA','CANCELADO','FECHADA','FECHADO','ENTREGUE_SOLICITANTE'))
    GROUP BY estoque_item_id
  `).all();
  const result = new Map(rows.map((r) => [Number(r.estoque_item_id), Number(r.reservado || 0)]));
  if (tableExists('correias_pedidos')) {
    for (const r of db.prepare("SELECT estoque_item_id, SUM(quantidade) reservado FROM correias_pedidos WHERE status IN ('SOLICITADA','SEPARADA') GROUP BY estoque_item_id").all()) result.set(Number(r.estoque_item_id), Number(result.get(Number(r.estoque_item_id)) || 0) + Number(r.reservado));
  }
  return result;
}

function listReservas(options = {}) {
  if (!tableExists('estoque_reservas')) return [];
  const q = String(options.q || '').trim();
  const params = [];
  let where = "WHERE r.status<>'CANCELADA' AND UPPER(TRIM(COALESCE(s.status,''))) NOT IN ('CANCELADA','CANCELADO','FECHADA','FECHADO','ENTREGUE_SOLICITANTE') AND (o.id IS NULL OR UPPER(TRIM(COALESCE(o.status,''))) NOT IN ('CANCELADA','CANCELADO','CONCLUIDA','CONCLUÍDA','CONCLUIDO','FECHADA','FECHADO','FINALIZADA','FINALIZADO'))";
  if (options.solicitacao_id) { where += ' AND r.solicitacao_id=?'; params.push(Number(options.solicitacao_id)); }
  if (q) {
    where += ` AND (LOWER(COALESCE(s.numero,'')) LIKE ? OR LOWER(COALESCE(s.titulo,'')) LIKE ? OR LOWER(${itemNameExpr('si')}) LIKE ? OR LOWER(COALESCE(e.nome,'')) LIKE ?)`;
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  return db.prepare(`
    SELECT r.*,s.numero,s.titulo,s.setor_origem,s.prioridade,s.solicitante_user_id,
      u.name solicitante_nome,${itemNameExpr('si')} item_nome,si.unidade,
      ei.nome estoque_item_nome,COALESCE(ei.saldo_atual,0) saldo_fisico,
      o.id os_numero,e.nome equipamento_nome,
      MAX(r.quantidade_reservada-r.quantidade_retirada,0) quantidade_disponivel
    FROM estoque_reservas r
    JOIN solicitacoes s ON s.id=r.solicitacao_id
    JOIN solicitacao_itens si ON si.id=r.solicitacao_item_id
    JOIN estoque_itens ei ON ei.id=r.estoque_item_id
    LEFT JOIN users u ON u.id=s.solicitante_user_id
    LEFT JOIN os o ON o.id=r.os_id
    LEFT JOIN equipamentos e ON e.id=r.equipamento_id
    ${where}
    ORDER BY s.id DESC,r.id ASC
  `).all(...params);
}

function groupBySolicitacao(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = Number(row.solicitacao_id);
    if (!groups.has(id)) {
      groups.set(id, {
        solicitacao_id: id,
        numero: row.numero || `#${id}`,
        titulo: row.titulo || 'Solicitação de materiais',
        setor_origem: row.setor_origem || '-',
        prioridade: row.prioridade || 'MEDIA',
        solicitante_nome: row.solicitante_nome || '-',
        os_numero: row.os_numero || null,
        equipamento_nome: row.equipamento_nome || null,
        total_reservado: 0,
        total_retirado: 0,
        total_disponivel: 0,
        itens: [],
      });
    }
    const group = groups.get(id);
    group.itens.push(row);
    group.total_reservado += Number(row.quantidade_reservada || 0);
    group.total_retirado += Number(row.quantidade_retirada || 0);
    group.total_disponivel += Number(row.quantidade_disponivel || 0);
  }
  return [...groups.values()];
}

function listSolicitacoes(options = {}) {
  return groupBySolicitacao(listReservas(options));
}

function getReserva(id) {
  if (!tableExists('estoque_reservas')) return null;
  return db.prepare('SELECT * FROM estoque_reservas WHERE id=?').get(Number(id)) || null;
}

function insertMovimento(data) {
  const cols = ['tipo', 'item_id', 'quantidade'];
  const vals = [data.tipo, data.item_id, data.quantidade];
  const optional = [
    ['origem', data.origem], ['os_id', data.os_id], ['equipamento_id', data.equipamento_id],
    ['solicitacao_id', data.solicitacao_id], ['solicitacao_item_id', data.solicitacao_item_id],
    ['usuario_id', data.usuario_id], ['saldo_anterior', data.saldo_anterior], ['saldo_posterior', data.saldo_posterior],
    ['custo_unit', data.custo_unit], ['observacao', data.observacao], ['reserva_id', data.reserva_id],
    ['retirado_por_colaborador_id', data.retirado_por_colaborador_id],
    ['retirado_por_user_id', data.retirado_por_user_id],
    ['entregue_por_user_id', data.entregue_por_user_id],
    ['identificacao_origem', data.identificacao_origem], ['empresa_consumidora', data.empresa_consumidora], ['setor_utilizacao', data.setor_utilizacao],
    ['retirada_lote_token', data.retirada_lote_token],
  ];
  for (const [column, value] of optional) {
    if (hasColumn('estoque_movimentos', column)) { cols.push(column); vals.push(value ?? null); }
  }
  return Number(db.prepare(`INSERT INTO estoque_movimentos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals).lastInsertRowid);
}

function retirarReserva({ reservaId, quantidade, qrCode, pessoaTipo, pessoaId, nomeRetirante, entreguePorUserId, observacao, empresaConsumidora, setorConsumidor, retiradaLoteToken }) {
  const qtd = Number(quantidade || 0);
  if (!Number.isFinite(qtd) || !(qtd > 0)) throw new Error('Quantidade inválida para retirada.');
  const pessoa = qrCode ? getPessoaByQr(qrCode) : getPessoaByCadastro(pessoaTipo, pessoaId);
  if (!pessoa) throw new Error('Funcionário não identificado, inativo ou inválido. Use o QR ou selecione um cadastro ativo.');
  // Retirada sem QR exige que o almoxarife digite e confirme o nome.
  if (!qrCode) {
    const normalizar = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
    if (!normalizar(nomeRetirante) || normalizar(nomeRetirante) !== normalizar(pessoa.nome)) {
      throw new Error('Na retirada manual, digite o nome completo conforme o cadastro da pessoa selecionada.');
    }
  }

  const resultado = db.transaction(() => {
    const reserva = db.prepare(`
      SELECT r.*,s.numero,s.setor_origem,si.unidade,${itemNameExpr('si')} item_nome,
        COALESCE(ei.saldo_atual,0) saldo_fisico,
        ${hasColumn('solicitacao_itens', 'valor_unitario_centavos') ? 'si.valor_unitario_centavos' : 'NULL'} valor_unitario_centavos,
        ${hasColumn('estoque_itens', 'custo_unit') ? 'ei.custo_unit' : 'NULL'} estoque_custo_unit
      FROM estoque_reservas r
      JOIN solicitacoes s ON s.id=r.solicitacao_id
      JOIN solicitacao_itens si ON si.id=r.solicitacao_item_id
      JOIN estoque_itens ei ON ei.id=r.estoque_item_id
      WHERE r.id=? AND r.status<>'CANCELADA'
    `).get(Number(reservaId));
    if (!reserva) throw new Error('Reserva não encontrada.');
    fluxoSolicitacaoService.assertRetiradaPermitida(reserva.solicitacao_id, reserva.os_id);

    if (setorConsumidor && !['RECICLAGEM','LOGISTICA','FRIGORIFICO','ADMINISTRATIVO'].includes(setorConsumidor)) throw new Error('Setor consumidor inválido.');
    const disponivelReserva = Math.max(Number(reserva.quantidade_reservada || 0) - Number(reserva.quantidade_retirada || 0), 0);
    if (!(disponivelReserva > 0)) throw new Error('Esta reserva já foi retirada integralmente.');
    if (qtd > disponivelReserva) throw new Error(`Quantidade acima da reserva disponível. Máximo: ${disponivelReserva}.`);
    if (qtd > Number(reserva.saldo_fisico || 0)) throw new Error('Saldo físico insuficiente no estoque.');

    const retiradaNova = Number(reserva.quantidade_retirada || 0) + qtd;
    const status = retiradaNova >= Number(reserva.quantidade_reservada || 0) ? 'RETIRADA' : 'PARCIAL';
    const reservaUpdate = db.prepare(`
      UPDATE estoque_reservas
      SET quantidade_retirada=?,status=?,updated_at=datetime('now')
      WHERE id=? AND quantidade_retirada=?
    `).run(retiradaNova, status, reserva.id, Number(reserva.quantidade_retirada || 0));
    if (!reservaUpdate.changes) throw new Error('Reserva alterada por outro usuário. Atualize a página e tente novamente.');

    const anterior = Number(reserva.saldo_fisico || 0);
    const posterior = anterior - qtd;
    const stockUpdate = db.prepare(`
      UPDATE estoque_itens SET saldo_atual=?,updated_at=datetime('now')
      WHERE id=? AND COALESCE(saldo_atual,0)=?
    `).run(posterior, reserva.estoque_item_id, anterior);
    if (!stockUpdate.changes) throw new Error('Saldo foi alterado por outro usuário. Atualize e tente novamente.');

    const custoUnit = Number(reserva.valor_unitario_centavos || 0) > 0
      ? Number(reserva.valor_unitario_centavos) / 100
      : Number(reserva.estoque_custo_unit || 0);
    const movimentoId = insertMovimento({
      tipo: 'SAIDA_REQUISICAO_INTERNA',
      empresa_consumidora: String(empresaConsumidora || reserva.setor_origem || '').trim(),
      setor_utilizacao: setorConsumidor || reserva.setor_origem || null,
      item_id: reserva.estoque_item_id,
      quantidade: qtd,
      origem: 'SOLICITACAO',
      os_id: reserva.os_id || null,
      equipamento_id: reserva.equipamento_id || null,
      solicitacao_id: reserva.solicitacao_id,
      solicitacao_item_id: reserva.solicitacao_item_id,
      usuario_id: entreguePorUserId || null,
      saldo_anterior: anterior,
      saldo_posterior: posterior,
      custo_unit: custoUnit || null,
      observacao: observacao || `Retirada ${reserva.numero || `#${reserva.solicitacao_id}`} por ${pessoa.nome}`,
      reserva_id: reserva.id,
      retirada_lote_token: retiradaLoteToken || null,
      retirado_por_colaborador_id: pessoa.identity_type === 'COLABORADOR' ? pessoa.colaborador_id : null,
      retirado_por_user_id: pessoa.user_id || null,
      entregue_por_user_id: entreguePorUserId || null,
      identificacao_origem: qrCode
        ? (pessoa.identity_type === 'USUARIO' ? 'QR_USUARIO' : 'QR_COLABORADOR')
        : (pessoa.identity_type === 'USUARIO' ? 'CADASTRO_USUARIO' : 'CADASTRO_COLABORADOR'),
    });

    const fluxo = fluxoSolicitacaoService.syncSolicitacaoEntregaStatus(reserva.solicitacao_id, { userId: entreguePorUserId });
    return {
      reservaId: reserva.id,
      movimentoId,
      pessoa,
      colaborador: pessoa,
      quantidade: qtd,
      saldoPosterior: posterior,
      status,
      solicitacaoId: Number(reserva.solicitacao_id),
      solicitacaoItemId: Number(reserva.solicitacao_item_id),
      solicitacaoStatus: fluxo.status,
    };
  })();

  return resultado;
}

function retirarSelecionados(data) {
  const solicitacaoId = Number(data.solicitacaoId);
  const token = String(data.operacaoToken || '');
  if (!Number.isSafeInteger(solicitacaoId) || solicitacaoId <= 0) throw new Error('Selecione uma solicitação.');
  if (!/^[\w-]{16,128}$/.test(token)) throw new Error('Operação inválida. Atualize a página e tente novamente.');
  if (!Array.isArray(data.itens) || !data.itens.length || data.itens.length > 200) throw new Error('Selecione de 1 a 200 materiais para retirar.');
  const itens = data.itens.map(i => ({ reservaId: Number(i.reservaId), quantidade: Number(String(i.quantidade).replace(',', '.')) }))
    .sort((a, b) => a.reservaId - b.reservaId);
  if (new Set(itens.map(i => i.reservaId)).size !== itens.length || itens.some(i => !Number.isSafeInteger(i.reservaId) || i.reservaId <= 0 || !Number.isFinite(i.quantidade) || i.quantidade <= 0)) {
    throw new Error('Seleção ou quantidade inválida.');
  }
  const pessoa = data.qrCode ? getPessoaByQr(data.qrCode) : getPessoaByCadastro(data.pessoaTipo, data.pessoaId);
  if (!pessoa) throw new Error('Identifique um funcionário ativo antes de confirmar a retirada.');
  const hash = require('node:crypto').createHash('sha256').update(JSON.stringify({ solicitacaoId, itens,
    pessoa: [pessoa.identity_type, pessoa.id], nomeRetirante: data.nomeRetirante || '', observacao: data.observacao || '' })).digest('hex');
  return db.transaction(() => {
    const anterior = db.prepare('SELECT * FROM estoque_retirada_operacoes WHERE token=?').get(token);
    if (anterior) {
      if (anterior.solicitacao_id !== solicitacaoId || anterior.usuario_id !== Number(data.entreguePorUserId) || anterior.payload_hash !== hash) throw new Error('Operação já utilizada para outra retirada.');
      return { ...JSON.parse(anterior.resultado_json), duplicado: true };
    }
    fluxoSolicitacaoService.assertRetiradaPermitida(solicitacaoId);
    for (const i of itens) {
      const reserva = getReserva(i.reservaId);
      if (!reserva || Number(reserva.solicitacao_id) !== solicitacaoId) throw new Error('Todos os materiais devem pertencer à solicitação selecionada.');
    }
    db.prepare('INSERT INTO estoque_retirada_operacoes(token,solicitacao_id,usuario_id,payload_hash) VALUES(?,?,?,?)')
      .run(token, solicitacaoId, data.entreguePorUserId, hash);
    const resultados = itens.map(i => retirarReserva({ ...data, ...i, retiradaLoteToken: token }));
    const resultado = { itens: resultados.length, movimentos: resultados.map(i => i.movimentoId), pessoaNome: pessoa.nome,
      solicitacaoId, solicitacaoStatus: resultados.at(-1).solicitacaoStatus };
    db.prepare('UPDATE estoque_retirada_operacoes SET resultado_json=? WHERE token=?').run(JSON.stringify(resultado), token);
    return resultado;
  })();
}

function historicoRetiradas(solicitacaoId) {
  if (!solicitacaoId || !hasColumn('estoque_movimentos', 'retirada_lote_token')) return [];
  return db.prepare(`SELECT m.id,m.created_at,m.quantidade,m.retirada_lote_token,i.nome,i.unidade,
      COALESCE(u.name,c.nome,'Não identificado no registro') retirante_nome,
      COALESCE(eu.name,au.name,'Não identificado no registro') entregador_nome
    FROM estoque_movimentos m JOIN estoque_itens i ON i.id=m.item_id
    LEFT JOIN colaboradores c ON c.id=m.retirado_por_colaborador_id
    LEFT JOIN users u ON u.id=m.retirado_por_user_id
    LEFT JOIN users eu ON eu.id=m.entregue_por_user_id
    LEFT JOIN users au ON au.id=m.usuario_id
    WHERE m.solicitacao_id=? AND m.tipo LIKE 'SAIDA%' ORDER BY m.id DESC LIMIT 30`).all(Number(solicitacaoId));
}

function consultarRetiradas(filters={}) {
  const data=hasColumn('estoque_movimentos','data_mov')?'COALESCE(m.data_mov,m.created_at)':'m.created_at';
  const {dbAliasesForSetor}=require('../compras/compras-setores');
  const where=["UPPER(m.tipo) LIKE 'SAIDA%'"]; const params=[];
  const q=String(filters.q||'').trim().slice(0,120), setor=String(filters.setor||'').trim();
  if(filters.solicitacaoId){where.push('m.solicitacao_id=?');params.push(Number(filters.solicitacaoId));}
  if(q){where.push("(i.nome LIKE ? OR i.codigo LIKE ? OR s.numero LIKE ? OR COALESCE(ru.name,c.nome,'') LIKE ? OR COALESCE(eu.name,au.name,'') LIKE ?)");params.push(...Array(5).fill('%'+q+'%'));}
  if(setor){const aliases=dbAliasesForSetor(setor);where.push(`COALESCE(m.setor_utilizacao,s.setor_origem,i.setor_utilizacao) COLLATE NOCASE IN (${aliases.map(()=>'?').join(',')})`);params.push(...aliases);}
  if(filters.inicio){where.push(`date(${data})>=date(?)`);params.push(filters.inicio);}
  if(filters.fim){where.push(`date(${data})<=date(?)`);params.push(filters.fim);}
  if(filters.tipo&&filters.tipo!=='SAIDA'){where.push('m.tipo=?');params.push(filters.tipo);}
  if(filters.item_id){where.push('m.item_id=?');params.push(Number(filters.item_id));}
  const joins=`FROM estoque_movimentos m JOIN estoque_itens i ON i.id=m.item_id
    LEFT JOIN solicitacoes s ON s.id=m.solicitacao_id LEFT JOIN equipamentos e ON e.id=m.equipamento_id
    LEFT JOIN colaboradores c ON c.id=m.retirado_por_colaborador_id
    LEFT JOIN users ru ON ru.id=m.retirado_por_user_id LEFT JOIN users eu ON eu.id=m.entregue_por_user_id
    LEFT JOIN users au ON au.id=m.usuario_id WHERE ${where.join(' AND ')}`;
  const total=Number(db.prepare(`SELECT COUNT(*) n ${joins}`).get(...params).n);
  const limite=Math.min(100,Math.max(1,Number(filters.limite)||25));
  const paginas=Math.max(1,Math.ceil(total/limite)), pagina=Math.min(paginas,Math.max(1,Math.trunc(Number(filters.pagina)||1)));
  const lista=db.prepare(`SELECT m.id,m.item_id,m.quantidade,m.solicitacao_id,m.retirada_lote_token,
    ${data} data_mov,i.nome item_nome,i.unidade,s.numero,s.status,e.nome equipamento_nome,
    COALESCE(m.setor_utilizacao,s.setor_origem,i.setor_utilizacao,'Não informado') setor,
    COALESCE(ru.name,c.nome,'Não identificado no registro') retirante_nome,
    COALESCE(eu.name,au.name,'Não identificado no registro') entregador_nome,
    m.retirado_por_user_id,m.retirado_por_colaborador_id,COALESCE(m.entregue_por_user_id,m.usuario_id) entregue_por_user_id
    ${joins} ORDER BY ${data} DESC,m.id DESC LIMIT ? OFFSET ?`).all(...params,limite,(pagina-1)*limite);
  return {lista,total,pagina,paginas,q,setor};
}

module.exports = {
  retirarSelecionados,
  historicoRetiradas,
  consultarRetiradas,
  normalizeQr,
  getColaboradorByQr,
  getPessoaByQr,
  getPessoaByCadastro,
  listPessoasAtivas,
  dashboard,
  resumoPorItem,
  listReservas,
  listSolicitacoes,
  getReserva,
  retirarReserva,
};
