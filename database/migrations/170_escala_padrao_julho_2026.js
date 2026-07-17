module.exports = ({ db, tableExists }) => {
  if (!tableExists('escala_semanas') || !tableExists('escala_alocacoes')) return;
  const nomes = ['Diogo', 'Emanuel', 'Júnior', 'Salviano', 'Luiz'];
  const colaboradores = db.prepare(`SELECT id,nome FROM colaboradores WHERE ativo=1`).all();
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const porNome = new Map(colaboradores.map((c) => [norm(c.nome), c]));
  if (!nomes.every((nome) => porNome.has(norm(nome)))) return;
  const id = (nome) => Number(porNome.get(norm(nome)).id);
  const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

  const tx = db.transaction(() => {
    db.prepare(`UPDATE escala_rodizio_config SET ativo=0,atualizado_em=datetime('now') WHERE ativo=1`).run();
    const configId = Number(db.prepare(`INSERT INTO escala_rodizio_config (nome,data_inicio,data_fim,tamanho_ciclo,modo_noturno,ativo) VALUES ('Rodízio noturno em duplas — julho/2026','2026-07-20',NULL,2,'dupla',1)`).run().lastInsertRowid);
    [['Emanuel','Júnior'],['Salviano','Luiz']].forEach((dupla, pos) => dupla.forEach((nome, ordem) => db.prepare(`INSERT INTO escala_rodizio_itens (config_id,posicao,colaborador_id,turno,ordem_noturno,ativo) VALUES (?,?,?,'NOITE',?,1)`).run(configId,pos+1,id(nome),ordem+1)));
    db.prepare(`INSERT INTO escala_diurno_fixos (config_id,colaborador_id,ativo) VALUES (?,?,1)`).run(configId,id('Diogo'));

    const semanas = db.prepare(`SELECT id,data_inicio,data_fim FROM escala_semanas WHERE data_inicio>='2026-07-20' ORDER BY data_inicio`).all();
    semanas.forEach((semana, indice) => {
      const noite = indice % 2 === 0 ? ['Emanuel','Júnior'] : ['Salviano','Luiz'];
      const retorno = indice % 2 === 0 ? ['Salviano','Luiz'] : ['Emanuel','Júnior'];
      const alternancia = Math.floor(indice / 2) % 2;
      db.prepare(`DELETE FROM escala_alocacoes WHERE semana_id=?`).run(semana.id);
      noite.forEach((nome) => db.prepare(`INSERT INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,'noturno',?,'Rodízio noturno em duplas')`).run(semana.id,id(nome)));
      ['Diogo',...retorno].forEach((nome) => db.prepare(`INSERT INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,'diurno',?,'Rodízio noturno em duplas')`).run(semana.id,id(nome)));
      db.prepare(`UPDATE escala_semanas SET origem='GERADA',ajuste_manual=0,rodizio_config_id=?,semana_indice=? WHERE id=?`).run(configId,indice%2,semana.id);
      db.prepare(`INSERT INTO escala_folgas_sabado (semana_id,data_sexta,colaborador_folga_id,motivo_folga,data_sabado,colaborador_fixo_id,parceiro_diogo_id,responsavel_id) VALUES (?,?,?,'PLANTAO_NOTURNO',?,?,?,NULL) ON CONFLICT(semana_id) DO NOTHING`).run(semana.id,addDays(semana.data_inicio,4),id(retorno[alternancia]),addDays(semana.data_inicio,5),id('Diogo'),id(retorno[1-alternancia]));
      noite.forEach((nome) => db.prepare(`INSERT OR IGNORE INTO escala_adicional_noturno (semana_id,colaborador_id,recebe_adicional,periodo_inicio,periodo_fim,situacao) VALUES (?,?,1,?,?,'PREVISTO')`).run(semana.id,id(nome),semana.data_inicio,semana.data_fim));
    });
  });
  tx();
};
