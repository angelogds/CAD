function hasTable(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function hasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  } catch (_e) {
    return false;
  }
}

function appendNoteOnce(existing, note) {
  const base = String(existing || '').trim();
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base} ${note}`;
}

function normalizeWeekdays(value) {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((v) => Number(String(v).trim()))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
  )].sort((a, b) => a - b);
}

function nextScheduledDate(db, weekdays, includeToday = true) {
  const days = normalizeWeekdays(weekdays);
  if (!days.length) return null;
  const start = includeToday ? 0 : 1;
  const row = db.prepare(`
    WITH RECURSIVE seq(n) AS (
      SELECT ?
      UNION ALL
      SELECT n + 1 FROM seq WHERE n < 7
    )
    SELECT datetime('now', '+' || n || ' day') AS dt
    FROM seq
    WHERE instr(',' || ? || ',', ',' || strftime('%w', datetime('now', '+' || n || ' day')) || ',') > 0
    ORDER BY n
    LIMIT 1
  `).get(start, days.join(','));
  return row?.dt || null;
}

module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!(tableExists ? tableExists('pcm_lubrificacao_planos') : hasTable(db, 'pcm_lubrificacao_planos'))) return;
  if (!(tableExists ? tableExists('equipamentos') : hasTable(db, 'equipamentos'))) return;

  if (typeof addColumnIfMissing === 'function') {
    addColumnIfMissing(
      'pcm_lubrificacao_planos',
      'dias_semana_lubrificacao',
      'dias_semana_lubrificacao TEXT'
    );
  } else if (!hasColumn(db, 'pcm_lubrificacao_planos', 'dias_semana_lubrificacao')) {
    db.exec('ALTER TABLE pcm_lubrificacao_planos ADD COLUMN dias_semana_lubrificacao TEXT');
  }

  const pending = db.prepare(`
    SELECT
      l.id,
      l.equipamento_id,
      l.ponto_lubrificacao,
      l.familia_lubrificacao,
      l.origem_cadastro,
      l.observacao,
      e.nome AS equipamento_nome,
      e.tipo AS equipamento_tipo,
      e.setor AS equipamento_setor
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id = l.equipamento_id
    WHERE COALESCE(l.ativo,1)=1
      AND COALESCE(l.validado_tecnicamente,0)=0
      AND COALESCE(l.origem_cadastro,'') LIKE 'ROTEIRO_%'
    ORDER BY l.id
  `).all();

  let mancais = 0;
  let redutores = 0;
  let moinhosProgramados = 0;
  let exaustoresProgramados = 0;
  let decanterMancaisPreparados = 0;
  let decanterRedutoresPreparados = 0;
  let outrosPendentes = 0;

  const tx = db.transaction(() => {
    for (const item of pending) {
      const familia = String(item.familia_lubrificacao || '').toUpperCase();
      const nomeEquip = String(item.equipamento_nome || '').toUpperCase();
      const ponto = String(item.ponto_lubrificacao || '').toUpperCase();

      const isReducer =
        ponto.includes('REDUTOR') ||
        ponto.includes('MOTORREDUTOR') ||
        ponto.includes('CAIXA REDUTORA');

      const isBearing =
        ponto.includes('MANCAL') ||
        ponto.includes('ROLAMENTO') ||
        ponto.includes('RELUBRIFICA');

      const isDecanter = familia === 'DECANTER' || nomeEquip.includes('DECANTER');
      const isMoinho = familia === 'MOINHOS' || nomeEquip.includes('MOINHO');
      const isExaustor = familia === 'EXAUSTORES' || nomeEquip.includes('EXAUSTOR');

      if (isDecanter && isReducer) {
        const note = 'Produto do Decanter FAST confirmado: TotalEnergies Carter SH 680, óleo sintético ISO VG 680 para redutor/engrenagem, incolor, com proteção para micropitting. Quantidade e frequência permanecem pendentes de validação final.';
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='TotalEnergies Carter SH 680 - Óleo Sintético ISO VG 680 - Redutor/Engrenagem - Micropitting - Incolor',
              quantidade=NULL,
              unidade=NULL,
              frequencia_dias=NULL,
              frequencia_semanas=NULL,
              frequencia_meses=NULL,
              frequencia_horas_operacao=NULL,
              dias_semana_lubrificacao=NULL,
              metodo_aplicacao='Verificar / completar nível',
              proxima_execucao_em=NULL,
              observacao=?,
              updated_at=datetime('now')
          WHERE id=?
            AND COALESCE(validado_tecnicamente,0)=0
        `).run(appendNoteOnce(item.observacao, note), Number(item.id));
        decanterRedutoresPreparados += 1;
        continue;
      }

      if (isDecanter && isBearing) {
        const note = 'Produto do Decanter FAST confirmado: SKF LGWA 2. Quantidade e frequência permanecem pendentes de validação final.';
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='SKF LGWA 2',
              quantidade=NULL,
              unidade=NULL,
              frequencia_dias=NULL,
              frequencia_semanas=NULL,
              frequencia_meses=NULL,
              frequencia_horas_operacao=NULL,
              dias_semana_lubrificacao=NULL,
              metodo_aplicacao='Engraxar',
              proxima_execucao_em=NULL,
              observacao=?,
              updated_at=datetime('now')
          WHERE id=?
            AND COALESCE(validado_tecnicamente,0)=0
        `).run(appendNoteOnce(item.observacao, note), Number(item.id));
        decanterMancaisPreparados += 1;
        continue;
      }

      if (isReducer) {
        const note = 'Validação V5: usar Lubrax Gear 680 (óleo para engrenagens/redutores, ISO VG 680). Nesta etapa, verificar/completar somente o nível. Troca total de óleo ficará para uma etapa futura do plano.';
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680',
              quantidade=NULL,
              unidade=NULL,
              frequencia_dias=7,
              frequencia_semanas=NULL,
              frequencia_meses=NULL,
              frequencia_horas_operacao=NULL,
              dias_semana_lubrificacao=NULL,
              metodo_aplicacao='Verificar / completar nível',
              proxima_execucao_em=datetime('now','+7 day'),
              observacao=?,
              validado_tecnicamente=1,
              updated_at=datetime('now')
          WHERE id=?
            AND COALESCE(validado_tecnicamente,0)=0
        `).run(appendNoteOnce(item.observacao, note), Number(item.id));
        redutores += 1;
        continue;
      }

      if (isBearing) {
        let frequenciaDias = 7;
        let diasSemana = null;
        let proxima = db.prepare("SELECT datetime('now','+7 day') AS dt").get()?.dt || null;
        let scheduleNote = '';

        if (isMoinho) {
          frequenciaDias = null;
          diasSemana = '1,3,5';
          proxima = nextScheduledDate(db, diasSemana, true);
          scheduleNote = ' Programação especial do moinho: segunda, quarta e sexta.';
          moinhosProgramados += 1;
        } else if (isExaustor) {
          frequenciaDias = null;
          diasSemana = '1,4';
          proxima = nextScheduledDate(db, diasSemana, true);
          scheduleNote = ' Programação especial dos exaustores de caldeira: segunda e quinta (duas vezes por semana).';
          exaustoresProgramados += 1;
        }

        const note = `Validação V5: usar Graxa de Lítio EP2. Padrão inicial 150 g por ponto; mancais pequenos podem ser ajustados pelo PCM dentro da faixa de 100 a 150 g conforme o conjunto real.${scheduleNote}`;
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='Graxa de Lítio EP2',
              quantidade=150,
              unidade='g',
              frequencia_dias=?,
              frequencia_semanas=NULL,
              frequencia_meses=NULL,
              frequencia_horas_operacao=NULL,
              dias_semana_lubrificacao=?,
              metodo_aplicacao='Engraxar',
              proxima_execucao_em=?,
              observacao=?,
              validado_tecnicamente=1,
              updated_at=datetime('now')
          WHERE id=?
            AND COALESCE(validado_tecnicamente,0)=0
        `).run(
          frequenciaDias,
          diasSemana,
          proxima,
          appendNoteOnce(item.observacao, note),
          Number(item.id)
        );
        mancais += 1;
        continue;
      }

      outrosPendentes += 1;
    }
  });

  tx();

  console.log(
    `[LUBRIFICACAO V5] mancais validados=${mancais}; redutores validados=${redutores}; moinhos programados=${moinhosProgramados}; exaustores programados=${exaustoresProgramados}; decanter mancais preparados=${decanterMancaisPreparados}; decanter redutores preparados=${decanterRedutoresPreparados}; outros pendentes=${outrosPendentes}`
  );
};
