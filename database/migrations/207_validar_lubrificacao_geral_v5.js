function hasTable(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function appendNote(existing, note) {
  const base = String(existing || '').trim();
  return base ? `${base} ${note}` : note;
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
  let decanterIgnorados = 0;
  let outrosPendentes = 0;

  const tx = db.transaction(() => {
    for (const item of pending) {
      const familia = String(item.familia_lubrificacao || '').toUpperCase();
      const nomeEquip = String(item.equipamento_nome || '').toUpperCase();
      const ponto = String(item.ponto_lubrificacao || '').toUpperCase();

      const isDecanter = familia === 'DECANTER' || nomeEquip.includes('DECANTER');
      if (isDecanter) {
        decanterIgnorados += 1;
        continue;
      }

      const isReducer =
        ponto.includes('REDUTOR') ||
        ponto.includes('MOTORREDUTOR') ||
        ponto.includes('CAIXA REDUTORA');

      const isBearing =
        ponto.includes('MANCAL') ||
        ponto.includes('ROLAMENTO') ||
        ponto.includes('RELUBRIFICA');

      if (isReducer) {
        const note = 'Validação V5: verificar/completar somente o nível com Óleo ISO VG 680. Troca total de óleo ficará para uma etapa futura do plano.';
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='Óleo ISO VG 680',
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
        `).run(appendNote(item.observacao, note), Number(item.id));
        redutores += 1;
        continue;
      }

      if (isBearing) {
        const note = 'Validação V5: padrão inicial 150 g por ponto. Mancais pequenos podem ser ajustados pelo PCM dentro da faixa de 100 a 150 g conforme o conjunto real.';
        db.prepare(`
          UPDATE pcm_lubrificacao_planos
          SET tipo_lubrificante_texto='Graxa de alta temperatura vermelha - padrão Manutenção',
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
        `).run(appendNote(item.observacao, note), Number(item.id));
        mancais += 1;
        continue;
      }

      outrosPendentes += 1;
    }
  });

  tx();

  console.log(
    `[LUBRIFICACAO V5] mancais validados=${mancais}; redutores validados=${redutores}; decanter mantidos pendentes=${decanterIgnorados}; outros pendentes=${outrosPendentes}`
  );
};
