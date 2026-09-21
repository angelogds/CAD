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

function findEquivalent(rows, point) {
  return rows.find((row) => catalogo.equivalentPoint(row.ponto_lubrificacao, point)) || null;
}

function syncDraft(db, equipamento, point) {
  const rows = db.prepare(`
    SELECT *
    FROM pcm_lubrificacao_planos
    WHERE equipamento_id=?
    ORDER BY id
  `).all(Number(equipamento.id));

  const equivalent = findEquivalent(rows, point);
  if (equivalent) {
    if (
      Number(equivalent.validado_tecnicamente ?? 1) === 0 &&
      String(equivalent.origem_cadastro || '').startsWith('ROTEIRO_')
    ) {
      db.prepare(`
        UPDATE pcm_lubrificacao_planos
        SET ponto_lubrificacao=?,
            metodo_aplicacao=?,
            familia_lubrificacao=?,
            rota_lubrificacao=?,
            ordem_rota=?,
            instrucoes_execucao=?,
            ativo=1,
            updated_at=datetime('now')
        WHERE id=?
      `).run(
        point.ponto,
        point.metodo || null,
        point.familia_lubrificacao || null,
        point.rota_lubrificacao || null,
        Number(point.ordem_rota || 0) || null,
        point.instrucoes || null,
        Number(equivalent.id)
      );
    }
    return { inserted: 0, updated: 1 };
  }

  db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id, ponto_lubrificacao, tipo_lubrificante_texto,
      quantidade, unidade, frequencia_dias, frequencia_semanas, frequencia_meses,
      frequencia_horas_operacao, observacao, proxima_execucao_em,
      metodo_aplicacao, responsavel_user_id, ativo,
      familia_lubrificacao, rota_lubrificacao, ordem_rota,
      validado_tecnicamente, origem_cadastro, instrucoes_execucao,
      created_by, created_at, updated_at
    )
    VALUES (?, ?, 'A DEFINIR PELO PCM', NULL, NULL, NULL, NULL, NULL, NULL,
      ?, NULL, ?, NULL, 1, ?, ?, ?, 0, 'ROTEIRO_CORRECAO_V4', ?, NULL, datetime('now'), datetime('now'))
  `).run(
    Number(equipamento.id),
    point.ponto,
    'Ponto incluído pela correção V4 do roteiro. Validar produto, quantidade, frequência e responsável antes de liberar.',
    point.metodo || null,
    point.familia_lubrificacao || null,
    point.rota_lubrificacao || null,
    Number(point.ordem_rota || 0) || null,
    point.instrucoes || null
  );

  return { inserted: 1, updated: 0 };
}

function deactivateInvalidAutoMotorPoints(db) {
  const info = db.prepare(`
    UPDATE pcm_lubrificacao_planos
    SET ativo=0,
        observacao=TRIM(COALESCE(observacao,'') ||
          ' Correção V4: ponto de motor inativado porque a relubrificação de motor deve ser vinculada a motor em uso >=20 CV e validada pelo PCM.'),
        updated_at=datetime('now')
    WHERE COALESCE(validado_tecnicamente,1)=0
      AND COALESCE(origem_cadastro,'')='ROTEIRO_BASE_V1'
      AND motor_id IS NULL
      AND UPPER(COALESCE(ponto_lubrificacao,'')) LIKE 'MOTOR -%'
  `).run();
  return Number(info.changes || 0);
}

function deactivateInternalBearingTank(db, equipamentos) {
  let count = 0;
  for (const equipamento of equipamentos) {
    const rule = catalogo.classificarEquipamento(equipamento);
    if (!rule || rule.familia !== 'TANQUE_SERVICO_SECO') continue;
    const info = db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ativo=0,
          observacao=TRIM(COALESCE(observacao,'') ||
            ' Correção V4: mancal interno do tanque de serviço seco não recebe engraxamento; é lubrificado pelo óleo do tanque.'),
          updated_at=datetime('now')
      WHERE equipamento_id=?
        AND COALESCE(validado_tecnicamente,1)=0
        AND COALESCE(origem_cadastro,'') LIKE 'ROTEIRO_%'
        AND UPPER(COALESCE(ponto_lubrificacao,'')) LIKE '%MANCAL%INTERNO%'
    `).run(Number(equipamento.id));
    count += Number(info.changes || 0);
  }
  return count;
}

function syncMotors20Cv(db, equipamentos) {
  if (!tableColumns(db, 'motores').size) return { total: 0, vinculados: 0, sem_vinculo: 0, criados: 0 };

  const motors = db.prepare(`
    SELECT id,codigo,descricao,potencia_cv,local_instalacao
    FROM motores
    WHERE UPPER(COALESCE(status,'EM_USO'))='EM_USO'
      AND COALESCE(potencia_cv,0) >= 20
    ORDER BY id
  `).all();

  let vinculados = 0;
  let semVinculo = 0;
  let criados = 0;

  for (const motor of motors) {
    const equipamento = catalogo.encontrarEquipamentoDoMotor(motor, equipamentos);
    if (!equipamento) {
      semVinculo += 1;
      continue;
    }

    const draft = catalogo.pontoMotor20Cv(motor);
    const existingLinked = db.prepare(`
      SELECT id FROM pcm_lubrificacao_planos WHERE motor_id=? LIMIT 1
    `).get(Number(motor.id));

    if (existingLinked) {
      vinculados += 1;
      continue;
    }

    const candidates = db.prepare(`
      SELECT *
      FROM pcm_lubrificacao_planos
      WHERE equipamento_id=?
      ORDER BY id
    `).all(Number(equipamento.id));

    const reusable = candidates.find((row) =>
      Number(row.validado_tecnicamente ?? 1) === 0 &&
      String(row.origem_cadastro || '').startsWith('ROTEIRO_') &&
      catalogo.equivalentPoint(row.ponto_lubrificacao, draft)
    );

    if (reusable) {
      db.prepare(`
        UPDATE pcm_lubrificacao_planos
        SET ponto_lubrificacao=?,
            motor_id=?,
            familia_lubrificacao=?,
            rota_lubrificacao=?,
            ordem_rota=?,
            metodo_aplicacao=?,
            instrucoes_execucao=?,
            ativo=1,
            updated_at=datetime('now')
        WHERE id=?
      `).run(
        draft.ponto,
        Number(motor.id),
        draft.familia_lubrificacao,
        draft.rota_lubrificacao,
        draft.ordem_rota,
        draft.metodo,
        draft.instrucoes,
        Number(reusable.id)
      );
    } else {
      db.prepare(`
        INSERT INTO pcm_lubrificacao_planos (
          equipamento_id, ponto_lubrificacao, tipo_lubrificante_texto,
          quantidade, unidade, frequencia_dias, frequencia_semanas, frequencia_meses,
          frequencia_horas_operacao, observacao, proxima_execucao_em,
          metodo_aplicacao, responsavel_user_id, ativo,
          familia_lubrificacao, rota_lubrificacao, ordem_rota,
          validado_tecnicamente, origem_cadastro, instrucoes_execucao,
          motor_id, created_by, created_at, updated_at
        )
        VALUES (?, ?, 'A DEFINIR PELO PCM', NULL, NULL, NULL, NULL, NULL, NULL,
          ?, NULL, ?, NULL, 1, ?, ?, ?, 0, 'ROTEIRO_MOTOR_20CV', ?, ?, NULL, datetime('now'), datetime('now'))
      `).run(
        Number(equipamento.id),
        draft.ponto,
        'Motor em uso com potência cadastrada a partir de 20 CV. Confirmar ponto físico, graxa, quantidade e intervalo.',
        draft.metodo,
        draft.familia_lubrificacao,
        draft.rota_lubrificacao,
        draft.ordem_rota,
        draft.instrucoes,
        Number(motor.id)
      );
      criados += 1;
    }

    vinculados += 1;
  }

  return { total: motors.length, vinculados, sem_vinculo: semVinculo, criados };
}

module.exports = function up({ db, tableExists }) {
  if (!tableExists('pcm_lubrificacao_planos') || !tableExists('equipamentos')) return;

  const equipamentos = selectEquipments(db);
  let inserted = 0;
  let updated = 0;

  deactivateInvalidAutoMotorPoints(db);
  deactivateInternalBearingTank(db, equipamentos);

  for (const equipamento of equipamentos) {
    const points = catalogo.gerarPontosBase(equipamento);
    for (const point of points) {
      const result = syncDraft(db, equipamento, point);
      inserted += result.inserted;
      updated += result.updated;
    }
  }

  const motors = syncMotors20Cv(db, equipamentos);

  console.log(
    `[LUBRIFICACAO V4] pontos novos=${inserted}; rascunhos alinhados=${updated}; motores >=20CV vinculados=${motors.vinculados}; motores >=20CV sem vinculo=${motors.sem_vinculo}`
  );
};
