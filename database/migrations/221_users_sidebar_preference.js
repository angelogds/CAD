module.exports = function up({ tableExists, addColumnIfMissing }) {
  if (!tableExists('users')) return;
  addColumnIfMissing(
    'users',
    'sidebar_mode',
    "sidebar_mode TEXT NOT NULL DEFAULT 'EXPANDED'"
  );
};
