const catalogo = require('../../modules/lubrificacao/lubrificacao.catalogo.v1');

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columns(db, table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)); }
  catch (_e) { return new Set(); }
}

function appendNote(existing, note) {
  const base = String(existing || '').trim();
  if (base.includes(note)) return base;
  return base ? `${base} ${note}` : note;
}

function selectEquipments(db) {
  const cols = columns(db, 'equipamentos');
  const expr = (name, fallback = "NULL") => cols.has(name) ? name : fallback;
  return db.prepare(`
    SELECT id,
           ${expr('codigo')} AS codigo,
           ${expr('tag')} AS tag,
           nome,
           ${expr('setor')} AS setor,
           ${expr('tipo')} AS tipo
    FROM equipamentos
    WHERE ${cols.has('ativo') ? 'COALESCE(ativo,1)=1 AND' : ''} COALESCE(nome,'')<>''
    ORDER BY id
  `).all();
}

function executionsByPlan(db) {
  if (!tableExists(db, 'pcm_lubrificacao_execucoes')) return new Map();
  const rows = db.prepare(`
    SELECT plano_id, COUNT(*) AS total
    FROM pcm_lubrificacao_execucoes
    GROUP BY plano_id
  `).all();
  return new Map(rows.map((row) => [Number(row.plano_id), Number(row.total || 0)]));
}

function isAuto(row) {
  return /^ROTEIRO_/i.test(String(row.origem_cadastro || '')) && !row.motor_id
    && String(row.familia_lubrificacao || '').toUpperCase() !== 'MOTORES_20CV';
}

function isBearing(point) {
  return ['BEARING_DE','BEARING_NDE','BEARING_EXTERNAL'].includes(String(point?.key || ''));
}

function isReducer(point) {
  return String(point?.key || '') === 'REDUCER_OIL';
}

function nextScheduledDate(db, weekdays) {
  const days = String(weekdays || '').split(',').map((v) => Number(v)).filter((v) => v >= 0 && v <= 6);
  if (!days.length) return null;
  return db.prepare(`
    WITH RECURSIVE seq(n) AS (
      SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<7
    )
    SELECT datetime('now','+' || n || ' day') AS dt
    FROM seq
    WHERE instr(',' || ? || ',', ',' || strftime('%w', datetime('now','+' || n || ' day')) || ',') > 0
    ORDER BY n LIMIT 1
  `).get(days.join(','))?.dt || null;
}

function canonicalSchedule(db, equipamento, point) {
  const familia = String(point.familia_lubrificacao || '').toUpperCase();
  const nome = catalogo.normalize(equipamento.nome);
  const setor = catalogo.normalize(equipamento.setor);

  if (familia === 'MOINHOS' && isBearing(point)) {
    return { frequencia_dias:null, dias_semana:'1,3,5', proxima:nextScheduledDate(db,'1,3,5') };
  }
  if (familia === 'EXAUSTORES' && isBearing(point) && (nome.includes('CALDEIRA') || setor.includes('CALDEIRA'))) {
    return { frequencia_dias:null, dias_semana:'1,4', proxima:nextScheduledDate(db,'1,4') };
  }
  return { frequencia_dias:7, dias_semana:null, proxima:db.prepare("SELECT datetime('now','+7 day') dt").get()?.dt || null };
}

function shouldPreserveCustomTechnicalData(row) {
  if (Number(row.validado_tecnicamente || 0) !== 1) return false;
  const product = String(row.tipo_lubrificante_texto || '').trim();
  if (!product) return false;
  return !(
    /A DEFINIR|PENDENTE|VALIDAR NO MANUAL/i.test(product)
    || product === 'Graxa de Lítio EP2'
    || product.startsWith('Lubrax Gear 680')
    || product === 'SKF LGWA 2'
    || product.startsWith('TotalEnergies Carter SH 680')
  );
}

function updateAutoCanonical(db, row, equipamento, point) {
  const note = 'Saneamento V7: classificação e ponto canônico revisados sem apagar histórico.';
  const preserveTechnical = shouldPreserveCustomTechnicalData(row);
  const familia = String(point.familia_lubrificacao || '').toUpperCase();
  const isDecanter = familia === 'DECANTER';

  const base = {
    ponto: point.ponto,
    metodo: point.metodo || row.metodo_aplicacao || null,
    familia: point.familia_lubrificacao,
    rota: point.rota_lubrificacao,
    ordem: Number(point.ordem_rota || 0) || null,
    instrucoes: point.instrucoes || row.instrucoes_execucao || null,
    observacao: appendNote(row.observacao, note),
  };

  if (preserveTechnical) {
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ponto_lubrificacao=?, metodo_aplicacao=?, familia_lubrificacao=?,
          rota_lubrificacao=?, ordem_rota=?, instrucoes_execucao=?,
          observacao=?, updated_at=datetime('now')
      WHERE id=?
    `).run(base.ponto,base.metodo,base.familia,base.rota,base.ordem,base.instrucoes,base.observacao,Number(row.id));
    return;
  }

  if (isDecanter && isBearing(point)) {
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ponto_lubrificacao=?, tipo_lubrificante_texto='SKF LGWA 2',
          quantidade=NULL, unidade=NULL, frequencia_dias=NULL, frequencia_semanas=NULL,
          frequencia_meses=NULL, frequencia_horas_operacao=NULL, dias_semana_lubrificacao=NULL,
          proxima_execucao_em=NULL, metodo_aplicacao='Engraxar',
          familia_lubrificacao=?, rota_lubrificacao=?, ordem_rota=?, instrucoes_execucao=?,
          validado_tecnicamente=0, observacao=?, updated_at=datetime('now')
      WHERE id=?
    `).run(base.ponto,base.familia,base.rota,base.ordem,base.instrucoes,base.observacao,Number(row.id));
    return;
  }

  if (isDecanter && isReducer(point)) {
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ponto_lubrificacao=?,
          tipo_lubrificante_texto='TotalEnergies Carter SH 680 - Óleo Sintético ISO VG 680 - Redutor/Engrenagem - Micropitting - Incolor',
          quantidade=NULL, unidade=NULL, frequencia_dias=NULL, frequencia_semanas=NULL,
          frequencia_meses=NULL, frequencia_horas_operacao=NULL, dias_semana_lubrificacao=NULL,
          proxima_execucao_em=NULL, metodo_aplicacao='Verificar / completar nível',
          familia_lubrificacao=?, rota_lubrificacao=?, ordem_rota=?, instrucoes_execucao=?,
          validado_tecnicamente=0, observacao=?, updated_at=datetime('now')
      WHERE id=?
    `).run(base.ponto,base.familia,base.rota,base.ordem,base.instrucoes,base.observacao,Number(row.id));
    return;
  }

  if (isBearing(point)) {
    const schedule = canonicalSchedule(db, equipamento, point);
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ponto_lubrificacao=?, tipo_lubrificante_texto='Graxa de Lítio EP2',
          quantidade=150, unidade='g', frequencia_dias=?, frequencia_semanas=NULL,
          frequencia_meses=NULL, frequencia_horas_operacao=NULL, dias_semana_lubrificacao=?,
          proxima_execucao_em=?, metodo_aplicacao='Engraxar',
          familia_lubrificacao=?, rota_lubrificacao=?, ordem_rota=?, instrucoes_execucao=?,
          validado_tecnicamente=1, observacao=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      base.ponto,schedule.frequencia_dias,schedule.dias_semana,schedule.proxima,
      base.familia,base.rota,base.ordem,base.instrucoes,base.observacao,Number(row.id)
    );
    return;
  }

  if (isReducer(point)) {
    const schedule = canonicalSchedule(db, equipamento, point);
    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ponto_lubrificacao=?,
          tipo_lubrificante_texto='Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680',
          quantidade=NULL, unidade=NULL, frequencia_dias=?, frequencia_semanas=NULL,
          frequencia_meses=NULL, frequencia_horas_operacao=NULL, dias_semana_lubrificacao=NULL,
          proxima_execucao_em=COALESCE(proxima_execucao_em,?),
          metodo_aplicacao='Verificar / completar nível',
          familia_lubrificacao=?, rota_lubrificacao=?, ordem_rota=?, instrucoes_execucao=?,
          validado_tecnicamente=1, observacao=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      base.ponto,schedule.frequencia_dias || 7,schedule.proxima,
      base.familia,base.rota,base.ordem,base.instrucoes,base.observacao,Number(row.id)
    );
  }
}

function insertCanonical(db, equipamento, point) {
  const familia = String(point.familia_lubrificacao || '').toUpperCase();
  const decanter = familia === 'DECANTER';
  const bearing = isBearing(point);
  const reducer = isReducer(point);
  const schedule = canonicalSchedule(db, equipamento, point);

  let product = 'A DEFINIR PELO PCM';
  let qty = null;
  let unit = null;
  let freq = null;
  let days = null;
  let method = point.metodo || null;
  let next = null;
  let validated = 0;

  if (decanter && bearing) product = 'SKF LGWA 2';
  else if (decanter && reducer) product = 'TotalEnergies Carter SH 680 - Óleo Sintético ISO VG 680 - Redutor/Engrenagem - Micropitting - Incolor';
  else if (bearing) {
    product = 'Graxa de Lítio EP2'; qty = 150; unit = 'g';
    freq = schedule.frequencia_dias; days = schedule.dias_semana; next = schedule.proxima; validated = 1;
  } else if (reducer) {
    product = 'Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680';
    freq = 7; next = schedule.proxima; validated = 1;
  }

  db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id,ponto_lubrificacao,tipo_lubrificante_texto,quantidade,unidade,
      frequencia_dias,frequencia_semanas,frequencia_meses,frequencia_horas_operacao,
      observacao,proxima_execucao_em,metodo_aplicacao,ativo,familia_lubrificacao,
      rota_lubrificacao,ordem_rota,validado_tecnicamente,origem_cadastro,
      instrucoes_execucao,created_at,updated_at,dias_semana_lubrificacao
    ) VALUES (?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,1,?,?,?,?, 'ROTEIRO_SANEAMENTO_V7', ?,datetime('now'),datetime('now'),?)
  `).run(
    Number(equipamento.id),point.ponto,product,qty,unit,freq,
    'Saneamento V7: ponto canônico criado para completar o roteiro real do equipamento.',
    next,method,point.familia_lubrificacao,point.rota_lubrificacao,
    Number(point.ordem_rota || 0) || null,validated,point.instrucoes || null,days
  );
}

module.exports = function up({ db }) {
  if (!tableExists(db,'equipamentos') || !tableExists(db,'pcm_lubrificacao_planos')) return;
  const planCols = columns(db,'pcm_lubrificacao_planos');
  if (!planCols.has('origem_cadastro') || !planCols.has('familia_lubrificacao')) return;

  const executions = executionsByPlan(db);
  const equipamentos = selectEquipments(db);
  let renomeados = 0;
  let criados = 0;
  let inativados = 0;

  db.transaction(() => {
    for (const equipamento of equipamentos) {
      const expected = catalogo.gerarPontosBase(equipamento);
      if (!expected.length) continue;

      const rows = db.prepare(`
        SELECT *
        FROM pcm_lubrificacao_planos
        WHERE equipamento_id=? AND COALESCE(ativo,1)=1
        ORDER BY id
      `).all(Number(equipamento.id));

      const used = new Set();

      for (const point of expected) {
        const candidates = rows
          .filter((row) => !used.has(Number(row.id)) && catalogo.equivalentPoint(row.ponto_lubrificacao, point))
          .sort((a,b) => {
            const manualA = isAuto(a) ? 0 : 1;
            const manualB = isAuto(b) ? 0 : 1;
            if (manualA !== manualB) return manualB - manualA;
            const exactA = catalogo.normalize(a.ponto_lubrificacao) === catalogo.normalize(point.ponto) ? 1 : 0;
            const exactB = catalogo.normalize(b.ponto_lubrificacao) === catalogo.normalize(point.ponto) ? 1 : 0;
            if (exactA !== exactB) return exactB - exactA;
            const execA = executions.get(Number(a.id)) || 0;
            const execB = executions.get(Number(b.id)) || 0;
            if (execA !== execB) return execB - execA;
            return Number(a.id) - Number(b.id);
          });

        const chosen = candidates[0] || null;
        if (chosen) {
          used.add(Number(chosen.id));
          if (isAuto(chosen)) {
            updateAutoCanonical(db, chosen, equipamento, point);
            renomeados += 1;
          }
        } else {
          insertCanonical(db, equipamento, point);
          criados += 1;
        }
      }

      for (const row of rows) {
        if (used.has(Number(row.id)) || !isAuto(row)) continue;
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET ativo=0,
              observacao=?,
              updated_at=datetime('now')
          WHERE id=?
        `).run(
          appendNote(row.observacao,'Saneamento V7: ponto automático desativado por não pertencer à família canônica atual do equipamento. Histórico preservado.'),
          Number(row.id)
        );
        inativados += 1;
      }
    }
  })();

  console.log(`[LUBRIFICACAO V7] canônicos revisados=${renomeados}; criados=${criados}; automáticos incorretos/duplicados inativados=${inativados}`);
};
