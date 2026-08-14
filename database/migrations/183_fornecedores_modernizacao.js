module.exports.up = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('fornecedores')) return;

  [
    ['nome_fantasia', 'nome_fantasia TEXT'], ['razao_social', 'razao_social TEXT'],
    ['cnpj_normalizado', 'cnpj_normalizado TEXT'], ['responsavel_comercial', 'responsavel_comercial TEXT'],
    ['whatsapp', 'whatsapp TEXT'], ['uf', 'uf TEXT'], ['endereco', 'endereco TEXT'],
    ['situacao', "situacao TEXT NOT NULL DEFAULT 'ATIVO'"], ['favorito', 'favorito INTEGER NOT NULL DEFAULT 0'],
    ['condicao_pagamento', 'condicao_pagamento TEXT'], ['pedido_minimo_centavos', 'pedido_minimo_centavos INTEGER'],
    ['frete', 'frete TEXT'], ['validade_proposta_dias', 'validade_proposta_dias INTEGER'],
    ['garantia', 'garantia TEXT'], ['regiao_atendida', 'regiao_atendida TEXT'],
    ['marcas', 'marcas TEXT'], ['especialidade', 'especialidade TEXT'],
    ['observacoes_comerciais', 'observacoes_comerciais TEXT'],
  ].forEach(([name, ddl]) => addColumnIfMissing('fornecedores', name, ddl));

  db.exec(`
    UPDATE fornecedores SET nome_fantasia=COALESCE(NULLIF(nome_fantasia,''), nome),
      situacao=CASE WHEN ativo=1 THEN 'ATIVO' ELSE 'INATIVO' END,
      cnpj_normalizado=CASE WHEN cnpj IS NULL THEN NULL ELSE replace(replace(replace(replace(cnpj,'.',''),'/',''),'-',''),' ','') END
      WHERE nome_fantasia IS NULL OR situacao IS NULL OR (cnpj IS NOT NULL AND cnpj_normalizado IS NULL);

    CREATE TABLE IF NOT EXISTS fornecedor_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, nome_normalizado TEXT NOT NULL UNIQUE,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fornecedor_categoria_vinculos (
      fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
      categoria_id INTEGER NOT NULL REFERENCES fornecedor_categorias(id) ON DELETE CASCADE,
      PRIMARY KEY (fornecedor_id, categoria_id)
    );
    CREATE TABLE IF NOT EXISTS fornecedor_produtos_servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, nome_normalizado TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'PRODUTO' CHECK(tipo IN ('PRODUTO','SERVICO','MARCA')),
      UNIQUE(nome_normalizado, tipo)
    );
    CREATE TABLE IF NOT EXISTS fornecedor_produto_vinculos (
      fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
      produto_servico_id INTEGER NOT NULL REFERENCES fornecedor_produtos_servicos(id) ON DELETE CASCADE,
      PRIMARY KEY (fornecedor_id, produto_servico_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fornecedor_cnpj_normalizado ON fornecedores(cnpj_normalizado);
    CREATE INDEX IF NOT EXISTS idx_fornecedor_nome_fantasia ON fornecedores(nome_fantasia);
    CREATE INDEX IF NOT EXISTS idx_fornecedor_situacao ON fornecedores(situacao);
    CREATE INDEX IF NOT EXISTS idx_fornecedor_local ON fornecedores(cidade, uf);
    CREATE INDEX IF NOT EXISTS idx_fornecedor_categoria_nome ON fornecedor_categorias(nome_normalizado);
    CREATE INDEX IF NOT EXISTS idx_fornecedor_produto_nome ON fornecedor_produtos_servicos(nome_normalizado);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedor_cnpj_ativo ON fornecedores(cnpj_normalizado)
      WHERE cnpj_normalizado IS NOT NULL AND cnpj_normalizado<>'' AND situacao='ATIVO';
    INSERT OR IGNORE INTO fornecedor_categorias(nome,nome_normalizado) VALUES
      ('Válvulas','valvula'),('Rolamentos','rolamento'),('Motores','motor'),('Correias','correia'),
      ('Material elétrico','material eletrico'),('Hidráulica','hidraulica'),('Caldeiraria','caldeiraria'),
      ('Usinagem','usinagem'),('Soldagem','soldagem'),('EPI','epi'),('Instrumentação','instrumentacao'),
      ('Automação','automacao'),('Serviços terceirizados','servicos terceirizado'),('Outros','outro');
  `);
};
