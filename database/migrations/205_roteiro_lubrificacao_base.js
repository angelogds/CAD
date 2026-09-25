const catalogo = require('../../modules/lubrificacao/lubrificacao.catalogo.v1');

function tableColumns(db, table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)); }
  catch (_e) { return new Set(); }
}

function selectEquipments(db) {
  const cols = tableColumns(db, 'equipamentos');
  if (!cols.size) return [];
  const expr = (name, fallback = "NULL") => cols.has(name) ? name : fallback;
  return db.prepare(`
    SELECT
      id,
      ${expr('codigo')} AS codigo,
      ${expr('tag')} AS tag,
      nome,
      ${expr('setor')} AS setor,
      ${expr('tipo')} AS tipo
    FROM equipamentos
    WHERE ${cols.has('ativo') ? 'COALESCE(ativo,1)=1 AND' : ''} COALESCE(nome,'') <> ''
    ORDER BY id
  `).all();
}

function insertDraft(db, equipamento, point) {
  const existing = db.prepare(`
    SELECT id, ponto_lubrificacao
    FROM pcm_lubrificacao_planos
    WHERE equipamento_id = ?
  `).all(equipamento.id);
  if (existing.some((row) => catalogo.equivalentPoint(row.ponto_lubrificacao, point))) return 0;

  db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id, ponto_lubrificacao, tipo_lubrificante_texto,
      quantidade, unidade, frequencia_dias, frequencia_semanas, frequencia_meses,
      frequencia_horas_operacao, observacao, proxima_execucao_em,
      metodo_aplicacao, ativo, familia_lubrificacao, rota_lubrificacao,
      ordem_rota, validado_tecnicamente, origem_cadastro, instrucoes_execucao,
      created_by, created_at, updated_at
    )
    VALUES (?, ?, 'A DEFINIR PELO PCM', NULL, NULL, NULL, NULL, NULL, NULL,
      ?, NULL, ?, 1, ?, ?, ?, 0, 'ROTEIRO_BASE_V1', ?, NULL, datetime('now'), datetime('now'))
  `).run(
    equipamento.id,
    point.ponto,
    'Rascunho automático gerado a partir da família do equipamento. Validar produto, quantidade, frequência, condição do ponto e responsável antes de liberar ao mecânico.',
    point.metodo,
    point.familia_lubrificacao,
    point.rota_lubrificacao,
    point.ordem_rota,
    point.instrucoes
  );
  return 1;
}

function linkMotors(db, equipamentos) {
  if (!tableColumns(db, 'motores').size) return { matched: 0, unmatched: 0 };
  const motors = db.prepare(`
    SELECT id, codigo, descricao, potencia_cv, local_instalacao
    FROM motores
    WHERE UPPER(COALESCE(status,'EM_USO'))='EM_USO'
      AND COALESCE(potencia_cv,0) >= 20
    ORDER BY id
  `).all();

  let matched = 0;
  let unmatched = 0;
  for (const motor of motors) {
    const equipamento = catalogo.encontrarEquipamentoDoMotor(motor, equipamentos);
    if (!equipamento) { unmatched += 1; continue; }

    const plans = db.prepare(`
      SELECT id, ponto_lubrificacao
      FROM pcm_lubrificacao_planos
      WHERE equipamento_id=?
        AND COALESCE(validado_tecnicamente,0)=0
        AND COALESCE(origem_cadastro,'')='ROTEIRO_BASE_V1'
        AND UPPER(COALESCE(ponto_lubrificacao,'')) LIKE 'MOTOR%'
      ORDER BY id
    `).all(equipamento.id);

    if (!plans.length) { unmatched += 1; continue; }

    for (const plan of plans) {
      db.prepare(`
        UPDATE pcm_lubrificacao_planos
        SET motor_id=?,
            observacao=COALESCE(observacao,'') || ?,
            updated_at=datetime('now')
        WHERE id=?
      `).run(
        motor.id,
        ` Motor associado por local de instalação: ${motor.codigo || motor.descricao || ('#' + motor.id)} - ${Number(motor.potencia_cv || 0)} CV. Confirmar associação no PCM.`,
        plan.id
      );
    }
    matched += 1;
  }
  return { matched, unmatched };
}

module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_lubrificacao_planos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      ponto_lubrificacao TEXT NOT NULL,
      tipo_lubrificante_texto TEXT,
      quantidade REAL,
      unidade TEXT,
      frequencia_dias INTEGER,
      frequencia_semanas INTEGER,
      frequencia_meses INTEGER,
      frequencia_horas_operacao INTEGER,
      observacao TEXT,
      proxima_execucao_em TEXT,
      metodo_aplicacao TEXT,
      responsavel_user_id INTEGER,
      estoque_item_id INTEGER,
      ativo INTEGER NOT NULL DEFAULT 1,
      ultima_execucao_em TEXT,
      familia_lubrificacao TEXT,
      rota_lubrificacao TEXT,
      ordem_rota INTEGER,
      validado_tecnicamente INTEGER NOT NULL DEFAULT 1,
      origem_cadastro TEXT NOT NULL DEFAULT 'LEGADO',
      instrucoes_execucao TEXT,
      motor_id INTEGER,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pcm_lubrificacao_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plano_id INTEGER NOT NULL,
      equipamento_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      quantidade_prevista REAL,
      quantidade_utilizada REAL,
      unidade TEXT,
      observacao TEXT,
      anomalia INTEGER NOT NULL DEFAULT 0,
      anomalia_descricao TEXT,
      proxima_execucao_em TEXT,
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(plano_id) REFERENCES pcm_lubrificacao_planos(id),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
      FOREIGN KEY(executor_user_id) REFERENCES users(id)
    );
  `);

  [
    ['metodo_aplicacao', 'metodo_aplicacao TEXT'],
    ['responsavel_user_id', 'responsavel_user_id INTEGER'],
    ['estoque_item_id', 'estoque_item_id INTEGER'],
    ['ativo', 'ativo INTEGER NOT NULL DEFAULT 1'],
    ['ultima_execucao_em', 'ultima_execucao_em TEXT'],
    ['familia_lubrificacao', 'familia_lubrificacao TEXT'],
    ['rota_lubrificacao', 'rota_lubrificacao TEXT'],
    ['ordem_rota', 'ordem_rota INTEGER'],
    ['validado_tecnicamente', 'validado_tecnicamente INTEGER NOT NULL DEFAULT 1'],
    ['origem_cadastro', "origem_cadastro TEXT NOT NULL DEFAULT 'LEGADO'"],
    ['instrucoes_execucao', 'instrucoes_execucao TEXT'],
    ['motor_id', 'motor_id INTEGER'],
  ].forEach(([name, ddl]) => addColumnIfMissing('pcm_lubrificacao_planos', name, ddl));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pcm_lubrificacao_validacao
      ON pcm_lubrificacao_planos(validado_tecnicamente, ativo);
    CREATE INDEX IF NOT EXISTS idx_pcm_lubrificacao_rota
      ON pcm_lubrificacao_planos(rota_lubrificacao, ordem_rota);
    CREATE INDEX IF NOT EXISTS idx_pcm_lubrificacao_motor
      ON pcm_lubrificacao_planos(motor_id);
  `);

  const equipamentos = tableExists('equipamentos') ? selectEquipments(db) : [];
  let classified = 0;
  let inserted = 0;
  for (const equipamento of equipamentos) {
    const points = catalogo.gerarPontosBase(equipamento);
    if (!points.length) continue;
    classified += 1;
    for (const point of points) inserted += insertDraft(db, equipamento, point);
  }

  const motorResult = linkMotors(db, equipamentos);
  console.log(
    `[LUBRIFICACAO V3] equipamentos classificados=${classified}; novos pontos base=${inserted}; motores >=20CV vinculados=${motorResult.matched}; motores >=20CV sem vinculo=${motorResult.unmatched}`
  );
};
