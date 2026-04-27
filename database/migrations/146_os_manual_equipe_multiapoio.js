module.exports.up = ({ addColumnIfMissing }) => {
  addColumnIfMissing("os", "executor_secundario_colaborador_id", "executor_secundario_colaborador_id INTEGER REFERENCES colaboradores(id)");
  addColumnIfMissing("os", "auxiliar_secundario_colaborador_id", "auxiliar_secundario_colaborador_id INTEGER REFERENCES colaboradores(id)");
};
