const db = require('../../database/db');

function list(filters = {}) {
  const where = [];
  const params = {};

  if (filters.q) {
    where.push('(f.nome LIKE @q OR COALESCE(f.cnpj, "") LIKE @q OR COALESCE(f.cidade, "") LIKE @q)');
    params.q = `%${filters.q}%`;
  }

  if (filters.ativo === '1' || filters.ativo === '0') {
    where.push('f.ativo = @ativo');
    params.ativo = Number(filters.ativo);
  }

  const sql = `
    SELECT
      f.*,
      COUNT(DISTINCT c.id) AS total_cotacoes,
      ROUND(AVG(CASE WHEN c.prazo_entrega_dias IS NOT NULL THEN c.prazo_entrega_dias END), 1) AS prazo_medio_cotado
    FROM fornecedores f
    LEFT JOIN compras_cotacoes c ON c.fornecedor_id = f.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY f.id
    ORDER BY f.nome ASC
  `;

  return db.prepare(sql).all(params);
}

function getById(id) {
  return db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id);
}

function create(data) {
  const stmt = db.prepare(`
    INSERT INTO fornecedores (nome, cnpj, telefone, email, cidade, observacoes, ativo)
    VALUES (@nome, @cnpj, @telefone, @email, @cidade, @observacoes, @ativo)
  `);

  const info = stmt.run({
    nome: String(data.nome || '').trim(),
    cnpj: (data.cnpj || '').trim() || null,
    telefone: (data.telefone || '').trim() || null,
    email: (data.email || '').trim() || null,
    cidade: (data.cidade || '').trim() || null,
    observacoes: (data.observacoes || '').trim() || null,
    ativo: data.ativo === '0' ? 0 : 1,
  });

  return info.lastInsertRowid;
}

function update(id, data) {
  const stmt = db.prepare(`
    UPDATE fornecedores
    SET nome = @nome,
        cnpj = @cnpj,
        telefone = @telefone,
        email = @email,
        cidade = @cidade,
        observacoes = @observacoes,
        ativo = @ativo,
        updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({
    id,
    nome: String(data.nome || '').trim(),
    cnpj: (data.cnpj || '').trim() || null,
    telefone: (data.telefone || '').trim() || null,
    email: (data.email || '').trim() || null,
    cidade: (data.cidade || '').trim() || null,
    observacoes: (data.observacoes || '').trim() || null,
    ativo: data.ativo === '0' ? 0 : 1,
  });
}

module.exports = { list, getById, create, update };
