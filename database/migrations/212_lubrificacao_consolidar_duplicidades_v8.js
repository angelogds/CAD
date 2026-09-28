const catalogo = require('../../modules/lubrificacao/lubrificacao.catalogo.v1');

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function hasColumn(db, table, column) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column); }
  catch (_e) { return false; }
}

function appendNote(existing, note) {
  const base = String(existing || '').trim();
  if (base.includes(note)) return base;
  return base ? `${base} ${note}` : note;
}

function normalize(value) {
  return catalogo.normalize(value);
}

function executionCounts(db) {
  if (!tableExists(db, 'pcm_lubrificacao_execucoes')) return new Map();
  return new Map(db.prepare(`
    SELECT plano_id,COUNT(*) AS total
    FROM pcm_lubrificacao_execucoes
    GROUP BY plano_id
  `).all().map((row) => [Number(row.plano_id), Number(row.total || 0)]));
}

function pickSurvivor(rows, canonicalPoint, counts) {
  return [...rows].sort((a,b) => {
    const execA = counts.get(Number(a.id)) || 0;
    const execB = counts.get(Number(b.id)) || 0;
    if (execA !== execB) return execB - execA;

    const manualA = /^ROTEIRO_/i.test(String(a.origem_cadastro || '')) ? 0 : 1;
    const manualB = /^ROTEIRO_/i.test(String(b.origem_cadastro || '')) ? 0 : 1;
    if (manualA !== manualB) return manualB - manualA;

    const validA = Number(a.validado_tecnicamente || 0);
    const validB = Number(b.validado_tecnicamente || 0);
    if (validA !== validB) return validB - validA;

    if (canonicalPoint) {
      const exactA = normalize(a.ponto_lubrificacao) === normalize(canonicalPoint.ponto) ? 1 : 0;
      const exactB = normalize(b.ponto_lubrificacao) === normalize(canonicalPoint.ponto) ? 1 : 0;
      if (exactA !== exactB) return exactB - exactA;
    }

    return Number(a.id) - Number(b.id);
  })[0];
}

function consolidateGroup(db, equipamento, rows, canonicalPoint, counts, touched) {
  const active = rows.filter((row) => !touched.has(Number(row.id)));
  if (active.length < 2) return 0;

  const survivor = pickSurvivor(active, canonicalPoint, counts);
  const duplicates = active.filter((row) => Number(row.id) !== Number(survivor.id));
  if (!duplicates.length) return 0;

  const ids = [Number(survivor.id), ...duplicates.map((row) => Number(row.id))];
  const placeholders = ids.map(() => '?').join(',');
  const dates = db.prepare(`
    SELECT MAX(ultima_execucao_em) AS ultima,
           MAX(proxima_execucao_em) AS proxima
    FROM pcm_lubrificacao_planos
    WHERE id IN (${placeholders})
  `).get(...ids);

  if (canonicalPoint) {
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ponto_lubrificacao=?,
          familia_lubrificacao=?,
          rota_lubrificacao=?,
          ordem_rota=?,
          instrucoes_execucao=COALESCE(NULLIF(TRIM(instrucoes_execucao),''),?),
          ultima_execucao_em=COALESCE(?,ultima_execucao_em),
          proxima_execucao_em=COALESCE(?,proxima_execucao_em),
          observacao=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      canonicalPoint.ponto,
      canonicalPoint.familia_lubrificacao || survivor.familia_lubrificacao || null,
      canonicalPoint.rota_lubrificacao || survivor.rota_lubrificacao || null,
      Number(canonicalPoint.ordem_rota || 0) || survivor.ordem_rota || null,
      canonicalPoint.instrucoes || null,
      dates?.ultima || null,
      dates?.proxima || null,
      appendNote(survivor.observacao,'Consolidação V8: este registro foi mantido como ponto principal após remoção de duplicidades ativas.'),
      Number(survivor.id)
    );
  } else {
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ultima_execucao_em=COALESCE(?,ultima_execucao_em),
          proxima_execucao_em=COALESCE(?,proxima_execucao_em),
          observacao=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      dates?.ultima || null,
      dates?.proxima || null,
      appendNote(survivor.observacao,'Consolidação V8: este registro foi mantido como ponto principal após remoção de duplicidades ativas.'),
      Number(survivor.id)
    );
  }

  if (tableExists(db,'pcm_lubrificacao_execucoes')) {
    const move = db.prepare('UPDATE pcm_lubrificacao_execucoes SET plano_id=?,equipamento_id=? WHERE plano_id=?');
    duplicates.forEach((dup) => move.run(Number(survivor.id), Number(equipamento.id), Number(dup.id)));
  }

  const disable = db.prepare(`
    UPDATE pcm_lubrificacao_planos
    SET ativo=0,
        observacao=?,
        updated_at=datetime('now')
    WHERE id=?
  `);
  duplicates.forEach((dup) => {
    disable.run(
      appendNote(dup.observacao,`Consolidação V8: duplicidade inativada e consolidada no ponto #${survivor.id}. Histórico preservado.`),
      Number(dup.id)
    );
    touched.add(Number(dup.id));
  });

  touched.add(Number(survivor.id));
  return duplicates.length;
}

module.exports = function up({ db }) {
  if (!tableExists(db,'equipamentos') || !tableExists(db,'pcm_lubrificacao_planos')) return;

  const eqCols = new Set(db.prepare('PRAGMA table_info(equipamentos)').all().map((row) => row.name));
  const expr = (name, fallback='NULL') => eqCols.has(name) ? name : fallback;
  const equipamentos = db.prepare(`
    SELECT id,${expr('codigo')} AS codigo,${expr('tag')} AS tag,nome,
           ${expr('setor')} AS setor,${expr('tipo')} AS tipo
    FROM equipamentos
    WHERE ${eqCols.has('ativo') ? 'COALESCE(ativo,1)=1 AND' : ''} COALESCE(nome,'')<>''
    ORDER BY id
  `).all();

  const counts = executionCounts(db);
  let inativados = 0;
  let grupos = 0;

  db.transaction(() => {
    for (const equipamento of equipamentos) {
      const rows = db.prepare(`
        SELECT *
        FROM pcm_lubrificacao_planos
        WHERE equipamento_id=? AND COALESCE(ativo,1)=1
        ORDER BY id
      `).all(Number(equipamento.id));
      if (rows.length < 2) continue;

      const touched = new Set();
      const expected = catalogo.gerarPontosBase(equipamento);

      for (const point of expected) {
        const group = rows.filter((row) => catalogo.equivalentPoint(row.ponto_lubrificacao, point));
        if (group.length > 1) {
          const qty = consolidateGroup(db,equipamento,group,point,counts,touched);
          if (qty) { inativados += qty; grupos += 1; }
        }
      }

      const remaining = rows.filter((row) => !touched.has(Number(row.id)));
      const exactGroups = new Map();
      for (const row of remaining) {
        const key = normalize(row.ponto_lubrificacao);
        if (!key) continue;
        if (!exactGroups.has(key)) exactGroups.set(key,[]);
        exactGroups.get(key).push(row);
      }

      for (const group of exactGroups.values()) {
        if (group.length < 2) continue;
        const qty = consolidateGroup(db,equipamento,group,null,counts,touched);
        if (qty) { inativados += qty; grupos += 1; }
      }
    }

    if (hasColumn(db,'pcm_lubrificacao_planos','ativo')) {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pcm_lubrificacao_ponto_ativo_exato
        ON pcm_lubrificacao_planos(equipamento_id, lower(trim(ponto_lubrificacao)))
        WHERE ativo=1
      `);
    }
  })();

  console.log(`[LUBRIFICACAO V8] grupos consolidados=${grupos}; pontos duplicados inativados=${inativados}`);
};
