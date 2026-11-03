module.exports=({db,tableExists})=>{
  if(!tableExists('escala_horas_extras'))return;
  const invalida=contexto=>['latitude','longitude','precisao'].map(c=>`NEW.${c}_${contexto} IS NULL OR typeof(NEW.${c}_${contexto}) NOT IN ('integer','real')`).join(' OR ')+` OR ABS(NEW.latitude_${contexto})>90 OR ABS(NEW.longitude_${contexto})>180 OR NEW.precisao_${contexto}<0`;
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_escala_hora_extra_gps_inicio
    BEFORE INSERT ON escala_horas_extras WHEN ${invalida('inicio')}
    BEGIN SELECT RAISE(ABORT,'Localização obrigatória para iniciar a hora extra.'); END;
    CREATE TRIGGER IF NOT EXISTS trg_escala_hora_extra_gps_fim
    BEFORE UPDATE OF status ON escala_horas_extras
    WHEN OLD.status='EM_ANDAMENTO' AND NEW.status='PENDENTE_APROVACAO' AND (${invalida('fim')})
    BEGIN SELECT RAISE(ABORT,'Localização obrigatória para finalizar a hora extra.'); END;`);
};
