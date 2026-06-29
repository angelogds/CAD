module.exports = ({ addColumnIfMissing }) => {
  addColumnIfMissing('escala_semanas', 'origem', "origem TEXT DEFAULT 'GERADA'");
  addColumnIfMissing('escala_semanas', 'ajuste_manual', 'ajuste_manual INTEGER DEFAULT 0');
  addColumnIfMissing('escala_semanas', 'rodizio_config_id', 'rodizio_config_id INTEGER');
  addColumnIfMissing('escala_semanas', 'semana_indice', 'semana_indice INTEGER');
  addColumnIfMissing('escala_semanas', 'observacao', 'observacao TEXT');
  addColumnIfMissing('escala_semanas', 'status', "status TEXT DEFAULT 'ATIVA'");
};
