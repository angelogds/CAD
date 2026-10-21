module.exports = function up({ tableExists, addColumnIfMissing }) {
  if (!tableExists('escala_horas_extras')) return;
  addColumnIfMissing(
    'escala_horas_extras',
    'inicio_fixo_17h',
    'inicio_fixo_17h INTEGER NOT NULL DEFAULT 0 CHECK(inicio_fixo_17h IN (0,1))'
  );
};
