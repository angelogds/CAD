const db = require('../../database/db');
const aceiteService = require('./ferramental.aceite.service');

const ACTIVE_MAINTENANCE_ROLES = [
  'MECANICO',
  'MANUTENCAO',
  'MANUTENCAO_SUPERVISOR',
  'SUPERVISOR_MANUTENCAO',
  'ENCARREGADO_MANUTENCAO',
  'ENCARREGADO_DE_MANUTENCAO',
];

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function int(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map(int)
    .filter(Boolean))];
}

function assertSchema() {
  const required = [
    'ferramental_equipes',
    'ferramental_equipe_membros',
    'ferramental_armarios',
    'ferramental_armario_compartimentos',
    'ferramental_itens',
    'ferramental_custodias',
    'ferramental_movimentacoes',
  ];
  for (const table of required) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) throw new Error('A estrutura do Ferramental ainda não foi migrada. Reinicie a aplicação e tente novamente.');
  }
}

function nextCode(table, column, prefix, digits) {
  const rows = db.prepare(`SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ?`).all(`${prefix}%`);
  let max = 0;
  for (const row of rows) {
    const code = String(row.code || '');
    if (!code.startsWith(prefix)) continue;
    const number = Number(code.slice(prefix.length));
    if (Number.isFinite(number)) max = Math.max(max, number);
  }
  return `${prefix}${String(max + 1).padStart(digits, '0')}`;
}

function getUser(userId) {
  return db.prepare(`
    SELECT id, name, role, COALESCE(ativo,1) AS ativo, deleted_at
    FROM users
    WHERE id=?
    LIMIT 1
  `).get(Number(userId)) || null;
}

function listMaintenanceUsers() {
  assertSchema();
  const placeholders = ACTIVE_MAINTENANCE_ROLES.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, name, role, photo_path
    FROM users
    WHERE UPPER(REPLACE(REPLACE(TRIM(role), ' ', '_'), '-', '_')) IN (${placeholders})
      AND COALESCE(ativo,1)=1
      AND COALESCE(deleted_at,'')=''
    ORDER BY name COLLATE NOCASE
  `).all(...ACTIVE_MAINTENANCE_ROLES);
}

function assertActiveUser(userId) {
  const user = getUser(userId);
  if (!user || Number(user.ativo || 0) !== 1 || user.deleted_at) {
    throw new Error('Selecione um colaborador ativo.');
  }
  return user;
}

function teamMembers(teamId) {
  return db.prepare(`
    SELECT m.user_id, m.ordem, u.name, u.role
    FROM ferramental_equipe_membros m
    JOIN users u ON u.id=m.user_id
    WHERE m.equipe_id=?
    ORDER BY m.ordem, u.name COLLATE NOCASE
  `).all(Number(teamId));
}

function listTeams() {
  const teams = db.prepare(`
    SELECT e.*,
           (SELECT COUNT(*) FROM ferramental_custodias c WHERE c.equipe_id=e.id AND c.ativo=1) AS total_ferramentas
    FROM ferramental_equipes e
    WHERE e.ativo=1
    ORDER BY e.nome COLLATE NOCASE
  `).all();
  return teams.map((team) => ({ ...team, membros: teamMembers(team.id) }));
}

function listLockers() {
  const lockers = db.prepare(`
    SELECT a.*, u.name AS responsavel_nome
    FROM ferramental_armarios a
    JOIN users u ON u.id=a.owner_user_id
    WHERE a.ativo=1
    ORDER BY a.codigo COLLATE NOCASE
  `).all();
  const stmt = db.prepare(`
    SELECT c.*, a.codigo AS armario_codigo, a.owner_user_id, u.name AS responsavel_nome
    FROM ferramental_armario_compartimentos c
    JOIN ferramental_armarios a ON a.id=c.armario_id
    JOIN users u ON u.id=a.owner_user_id
    WHERE c.armario_id=?
    ORDER BY c.numero
  `);
  return lockers.map((locker) => ({ ...locker, compartimentos: stmt.all(locker.id) }));
}

function listToolItems() {
  return db.prepare(`
    SELECT f.*,
           c.id AS custodia_id,
           c.equipe_id,
           e.codigo AS equipe_codigo,
           e.nome AS equipe_nome,
           c.compartimento_id,
           ac.numero AS compartimento_numero,
           a.id AS armario_id,
           a.codigo AS armario_codigo,
           au.name AS armario_responsavel
    FROM ferramental_itens f
    LEFT JOIN ferramental_custodias c ON c.ferramenta_id=f.id AND c.ativo=1
    LEFT JOIN ferramental_equipes e ON e.id=c.equipe_id
    LEFT JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    LEFT JOIN ferramental_armarios a ON a.id=ac.armario_id
    LEFT JOIN users au ON au.id=a.owner_user_id
    WHERE f.ativo=1
    ORDER BY f.descricao COLLATE NOCASE, f.codigo_interno
  `).all().map((row) => ({
    ...row,
    responsaveis: row.equipe_id ? teamMembers(row.equipe_id) : [],
  }));
}

function createTeam({ nome, user_ids }, actorUserId) {
  assertSchema();
  const ids = uniqueIds(user_ids);
  if (ids.length < 1 || ids.length > 2) {
    throw new Error('Selecione um ou dois responsáveis para o ferramental.');
  }
  const users = ids.map(assertActiveUser);
  const code = nextCode('ferramental_equipes', 'codigo', 'FER-', 3);
  const teamName = clean(nome, 120) || users.map((u) => u.name).join(' + ');

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO ferramental_equipes (codigo,nome,created_by)
      VALUES (?,?,?)
    `).run(code, teamName, int(actorUserId));
    ids.forEach((userId, index) => {
      db.prepare(`
        INSERT INTO ferramental_equipe_membros (equipe_id,user_id,ordem)
        VALUES (?,?,?)
      `).run(result.lastInsertRowid, userId, index + 1);
    });
    return Number(result.lastInsertRowid);
  })();
}

function createLocker({ owner_user_id, codigo, nome }, actorUserId) {
  assertSchema();
  const owner = assertActiveUser(int(owner_user_id));
  const existing = db.prepare('SELECT id FROM ferramental_armarios WHERE owner_user_id=? AND ativo=1 LIMIT 1').get(owner.id);
  if (existing) throw new Error('Este colaborador já possui um armário ativo cadastrado.');

  const code = clean(codigo, 40) || nextCode('ferramental_armarios', 'codigo', 'ARM-', 3);
  const lockerName = clean(nome, 120) || `Armário - ${owner.name}`;

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO ferramental_armarios (codigo,nome,owner_user_id,created_by)
      VALUES (?,?,?,?)
    `).run(code, lockerName, owner.id, int(actorUserId));
    const insertComp = db.prepare(`
      INSERT INTO ferramental_armario_compartimentos (armario_id,numero,finalidade)
      VALUES (?,?,?)
    `);
    for (let numero = 1; numero <= 8; numero += 1) {
      insertComp.run(result.lastInsertRowid, numero, numero <= 4 ? 'PESSOAL' : 'FERRAMENTAL');
    }
    return Number(result.lastInsertRowid);
  })();
}

function normalizeCondition(value) {
  const allowed = new Set(['NOVA','BOA','USADA','COM_DESGASTE','DANIFICADA']);
  const condition = clean(value, 30).toUpperCase();
  return allowed.has(condition) ? condition : 'BOA';
}

function createTool(data, actorUserId) {
  assertSchema();
  const descricao = clean(data.descricao, 180);
  if (!descricao) throw new Error('Informe a descrição da ferramenta.');

  const codigo = clean(data.codigo_interno, 50) || nextCode('ferramental_itens', 'codigo_interno', 'MNT-FER-', 4);
  const result = db.prepare(`
    INSERT INTO ferramental_itens (
      codigo_interno,descricao,categoria,marca,modelo,numero_serie,patrimonio,
      condicao,status,observacao,created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    codigo,
    descricao,
    clean(data.categoria, 80) || null,
    clean(data.marca, 80) || null,
    clean(data.modelo, 100) || null,
    clean(data.numero_serie, 120) || null,
    clean(data.patrimonio, 80) || null,
    normalizeCondition(data.condicao),
    'DISPONIVEL',
    clean(data.observacao, 600) || null,
    int(actorUserId)
  );
  return Number(result.lastInsertRowid);
}

function locationDescription(compartment) {
  if (!compartment) return 'Sem localização definida';
  return `${compartment.armario_codigo} / Compartimento ${compartment.numero}`;
}

function assignTool({ ferramenta_id, equipe_id, compartimento_id, observacao }, actorUserId) {
  assertSchema();
  const toolId = int(ferramenta_id);
  const teamId = int(equipe_id);
  const compartmentId = int(compartimento_id);
  if (!toolId || !teamId || !compartmentId) throw new Error('Ferramenta, responsáveis e compartimento são obrigatórios.');

  const tool = db.prepare('SELECT * FROM ferramental_itens WHERE id=? AND ativo=1 LIMIT 1').get(toolId);
  if (!tool) throw new Error('Ferramenta não encontrada.');
  if (String(tool.status) === 'BAIXADA') throw new Error('Ferramenta baixada não pode receber nova responsabilidade.');

  const team = db.prepare('SELECT * FROM ferramental_equipes WHERE id=? AND ativo=1 LIMIT 1').get(teamId);
  if (!team) throw new Error('Grupo de responsabilidade não encontrado.');
  const members = teamMembers(teamId);
  if (members.length < 1 || members.length > 2) throw new Error('O grupo deve possuir um ou dois responsáveis.');

  const compartment = db.prepare(`
    SELECT c.*, a.codigo AS armario_codigo, a.nome AS armario_nome, a.owner_user_id
    FROM ferramental_armario_compartimentos c
    JOIN ferramental_armarios a ON a.id=c.armario_id
    WHERE c.id=? AND a.ativo=1
    LIMIT 1
  `).get(compartmentId);
  if (!compartment) throw new Error('Compartimento de armário não encontrado.');
  if (String(compartment.finalidade) !== 'FERRAMENTAL') {
    throw new Error('Selecione um dos compartimentos inferiores reservados ao ferramental.');
  }
  const memberIds = new Set(members.map((member) => Number(member.user_id)));
  if (!memberIds.has(Number(compartment.owner_user_id))) {
    throw new Error('O ferramental compartilhado deve ficar no armário de um dos responsáveis selecionados.');
  }

  return db.transaction(() => {
    const previous = db.prepare(`
      SELECT c.*, ac.numero, a.codigo AS armario_codigo, e.nome AS equipe_nome
      FROM ferramental_custodias c
      LEFT JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
      LEFT JOIN ferramental_armarios a ON a.id=ac.armario_id
      LEFT JOIN ferramental_equipes e ON e.id=c.equipe_id
      WHERE c.ferramenta_id=? AND c.ativo=1
      LIMIT 1
    `).get(toolId);

    if (previous) {
      aceiteService.cancelPendingForCustody(previous.id);
      db.prepare(`
        UPDATE ferramental_custodias
        SET ativo=0, data_fim=datetime('now')
        WHERE id=?
      `).run(previous.id);
    }

    const result = db.prepare(`
      INSERT INTO ferramental_custodias (
        ferramenta_id,equipe_id,compartimento_id,entregue_por_user_id,observacao
      ) VALUES (?,?,?,?,?)
    `).run(toolId, teamId, compartmentId, int(actorUserId), clean(observacao, 600) || null);

    aceiteService.createPendingForCustody(result.lastInsertRowid, teamId);

    db.prepare(`
      UPDATE ferramental_itens
      SET status='EM_RESPONSABILIDADE', updated_at=datetime('now')
      WHERE id=?
    `).run(toolId);

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,origem_descricao,destino_descricao,
        equipe_id,compartimento_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      toolId,
      result.lastInsertRowid,
      previous ? 'TRANSFERENCIA' : 'ENTREGA',
      previous ? `${previous.equipe_nome || 'Responsabilidade anterior'} • ${previous.armario_codigo || '-'} / Compartimento ${previous.numero || '-'}` : 'Disponível / PCM',
      `${team.nome} • ${locationDescription(compartment)}`,
      teamId,
      compartmentId,
      int(actorUserId),
      clean(observacao, 600) || null
    );

    return Number(result.lastInsertRowid);
  })();
}

function dashboard() {
  assertSchema();
  const ferramentas = listToolItems();
  const equipes = listTeams();
  const armarios = listLockers();
  return {
    usuarios: listMaintenanceUsers(),
    equipes,
    armarios,
    ferramentas,
    resumo: {
      ferramentas: ferramentas.length,
      sobResponsabilidade: ferramentas.filter((item) => item.status === 'EM_RESPONSABILIDADE').length,
      disponiveis: ferramentas.filter((item) => item.status === 'DISPONIVEL').length,
      equipes: equipes.length,
      armarios: armarios.length,
    },
  };
}

function listOwnTools(userId) {
  assertSchema();
  const id = int(userId);
  if (!id) throw new Error('Usuário inválido.');

  const rows = db.prepare(`
    SELECT DISTINCT
      f.*,
      c.id AS custodia_id,
      c.equipe_id,
      e.codigo AS equipe_codigo,
      e.nome AS equipe_nome,
      ac.numero AS compartimento_numero,
      a.codigo AS armario_codigo,
      a.nome AS armario_nome,
      au.name AS armario_responsavel,
      c.data_inicio
    FROM ferramental_equipe_membros me
    JOIN ferramental_equipes e ON e.id=me.equipe_id AND e.ativo=1
    JOIN ferramental_custodias c ON c.equipe_id=e.id AND c.ativo=1
    JOIN ferramental_itens f ON f.id=c.ferramenta_id AND f.ativo=1
    JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    JOIN ferramental_armarios a ON a.id=ac.armario_id
    JOIN users au ON au.id=a.owner_user_id
    WHERE me.user_id=?
    ORDER BY e.nome COLLATE NOCASE, f.descricao COLLATE NOCASE
  `).all(id);

  const teams = new Map();
  for (const row of rows) {
    if (!teams.has(row.equipe_id)) {
      const members = teamMembers(row.equipe_id);
      teams.set(row.equipe_id, {
        id: row.equipe_id,
        codigo: row.equipe_codigo,
        nome: row.equipe_nome,
        membros: members,
        ferramentas: [],
      });
    }
    teams.get(row.equipe_id).ferramentas.push(row);
  }

  return {
    usuario: getUser(id),
    equipes: [...teams.values()],
    ferramentas: rows,
    resumo: {
      total: rows.length,
      compartilhadas: [...teams.values()].reduce(
        (total, team) => total + (team.membros.length > 1 ? team.ferramentas.length : 0),
        0
      ),
      grupos: teams.size,
    },
  };
}

function getTeamSheet(teamId) {
  assertSchema();
  const id = int(teamId);
  const equipe = db.prepare('SELECT * FROM ferramental_equipes WHERE id=? AND ativo=1 LIMIT 1').get(id);
  if (!equipe) throw new Error('Grupo de responsabilidade não encontrado.');
  const membros = teamMembers(id);
  const ferramentas = listToolItems().filter((item) => Number(item.equipe_id) === id);
  return { equipe: { ...equipe, membros }, ferramentas };
}

function getUserSheet(userId) {
  return listOwnTools(userId);
}

module.exports = {
  dashboard,
  listMaintenanceUsers,
  listTeams,
  listLockers,
  listToolItems,
  listOwnTools,
  getTeamSheet,
  getUserSheet,
  createTeam,
  createLocker,
  createTool,
  assignTool,
};
