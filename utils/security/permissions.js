function normRole(r) {
  return String(r || "").trim().toUpperCase();
}

// ADMIN sempre passa
function isAdmin(user) {
  return normRole(user?.role) === "ADMIN";
}

// allowedRoles pode vir ["compras"] ou ["COMPRAS"] que funciona
function hasAnyRole(user, allowedRoles = []) {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const userRole = normRole(user.role);
  const allowed = new Set((allowedRoles || []).map(normRole));
  return allowed.has(userRole);
}

function canAccess(user, allowedRoles = []) {
  return hasAnyRole(user, allowedRoles);
}

module.exports = { hasAnyRole, canAccess, isAdmin, normRole };
