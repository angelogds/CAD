function hasTable(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function appendNoteOnce(existing, note) {
  const base = String(existing || '').trim();
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base} ${note}`;
}

module.exports = function up({ db, tableExists }) {
  if (!(tableExists ? tableExists('pcm_lubrificacao_planos') : hasTable(db, 'pcm_lubrificacao_planos'))) return;
  if (!(tableExists ? tableExists('equipamentos') : hasTable(db, 'equipamentos'))) return;

  const pending = db.prepare(`
    SELECT
      l.id,
      l.equipamento_id,
      l.ponto_lubrificacao,
      l.familia_lubrificacao,
      l.origem_cadastro,
      l.observacao,
      e.nome AS equipamento_nome,
      e.tipo AS equipamento_tipo
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id = l.equipamento_id
    WHERE COALESCE(l.ativo,1)=1
      AND COALESCE(l.validado_tecnicamente,0)=0
      AND COALESCE(l.origem_cadastro,'') LIKE 'ROTEIRO_%'
    ORDER BY l.id
  `).all();

  let mancais = 0;
  let redutores = 0;
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
        const note = 'Validação V5: usar Graxa de Lítio EP2. Padrão inicial 150 g por ponto; mancais pequenos podem ser ajustados pelo PCM dentro da faixa de 100 a 150 g conforme o conjunto real.';
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='Graxa de Lítio EP2',
              quantidade=150,
              unidade='g',
              frequencia_dias=7,
              frequencia_semanas=NULL,
              frequencia_meses=NULL,
              frequencia_horas_operacao=NULL,
              metodo_aplicacao='Engraxar',
              proxima_execucao_em=datetime('now','+7 day'),
              observacao=?,
              validado_tecnicamente=1,
              updated_at=datetime('now')
          WHERE id=?
            AND COALESCE(validado_tecnicamente,0)=0
        `).run(appendNoteOnce(item.observacao, note), Number(item.id));
        mancais += 1;
        continue;
      }

      outrosPendentes += 1;
    }
  });

  tx();

  console.log(
    `[LUBRIFICACAO V5] mancais validados=${mancais}; redutores validados=${redutores}; decanter mancais preparados=${decanterMancaisPreparados}; decanter redutores preparados=${decanterRedutoresPreparados}; outros pendentes=${outrosPendentes}`
  );
};
