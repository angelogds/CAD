module.exports.up = ({ addColumnIfMissing }) => {
  addColumnIfMissing('os', 'origem', 'origem TEXT');
  addColumnIfMissing('os', 'created_by', 'created_by INTEGER');
  addColumnIfMissing('os', 'created_at', 'created_at TEXT');
};
