module.exports.up = ({ db, tableExists, addColumnIfMissing, columnExists }) => {
  if (!tableExists('solicitacoes')) return;

  const cols = [
    ['aprovada_diretoria_em', 'aprovada_diretoria_em DATETIME'],
    ['devolvida_revisao_em', 'devolvida_revisao_em DATETIME'],
    ['reprovada_em', 'reprovada_em DATETIME'],
    ['separada_retirada_em', 'separada_retirada_em DATETIME'],
    ['entregue_solicitante_em', 'entregue_solicitante_em DATETIME'],
    ['cancelada_em', 'cancelada_em DATETIME'],
    ['motor_id', 'motor_id INTEGER'],
    ['tipo_origem', "tipo_origem TEXT DEFAULT 'SOLICITACAO'"],
  ];
  cols.forEach(([c, d]) => addColumnIfMissing('solicitacoes', c, d));

  if (tableExists('solicitacao_itens')) {
    addColumnIfMissing('solicitacao_itens', 'status_item', "status_item TEXT DEFAULT 'PENDENTE'");
    addColumnIfMissing('solicitacao_itens', 'qtd_recebida_total', 'qtd_recebida_total REAL DEFAULT 0');
    addColumnIfMissing('solicitacao_itens', 'observacao_item', 'observacao_item TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS solicitacao_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL,
      user_id INTEGER,
      status_anterior TEXT,
      status_novo TEXT,
      acao TEXT NOT NULL,
      observacao TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_solicitacao_logs_solicitacao ON solicitacao_logs (solicitacao_id, created_at);

    CREATE TABLE IF NOT EXISTS notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      origem_tipo TEXT NOT NULL,
      origem_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      status_referencia TEXT,
      lida INTEGER NOT NULL DEFAULT 0,
      lida_em DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida ON notificacoes (user_id, lida, created_at);
  `);

  if (tableExists('compras_cotacoes')) {
    addColumnIfMissing('compras_cotacoes', 'fornecedor_nome', 'fornecedor_nome TEXT');
    addColumnIfMissing('compras_cotacoes', 'condicao_pagamento', 'condicao_pagamento TEXT');
    addColumnIfMissing('compras_cotacoes', 'created_by', 'created_by INTEGER');
  }

  if (tableExists('fornecedores')) {
    addColumnIfMissing('fornecedores', 'tipo_material_servico', 'tipo_material_servico TEXT');
    addColumnIfMissing('fornecedores', 'lead_time_medio_dias', 'lead_time_medio_dias INTEGER');
    addColumnIfMissing('fornecedores', 'qualidade_media_entrega', 'qualidade_media_entrega REAL');
  }
};
