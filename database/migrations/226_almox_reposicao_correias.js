module.exports = ({db, tableExists, addColumnIfMissing}) => {
  db.transaction(() => {
    for (const [name, ddl] of Object.entries({ponto_reposicao:'REAL', saldo_alvo:'REAL', prazo_reposicao_dias:'REAL NOT NULL DEFAULT 0', unidade_compra:'TEXT', fator_compra:'REAL', rateio_setores_json:"TEXT NOT NULL DEFAULT '{}'", classificacao_pendente:'INTEGER NOT NULL DEFAULT 0'})) {
      addColumnIfMissing('estoque_itens', name, `${name} ${ddl}`);
    }
    addColumnIfMissing('estoque_itens','categoria_id','categoria_id INTEGER REFERENCES estoque_categorias(id)');
    addColumnIfMissing('solicitacao_itens', 'rateio_setores_json', "rateio_setores_json TEXT NOT NULL DEFAULT '{}'");
    addColumnIfMissing('estoque_movimentos', 'empresa_consumidora', 'empresa_consumidora TEXT');
    addColumnIfMissing('estoque_movimentos', 'mecanico_user_id', 'mecanico_user_id INTEGER REFERENCES users(id)');
    db.exec(`CREATE TABLE IF NOT EXISTS almox_recebimento_operacoes(token TEXT PRIMARY KEY,solicitacao_id INTEGER NOT NULL,item_id INTEGER NOT NULL,movimento_id INTEGER NOT NULL REFERENCES estoque_movimentos(id));
      CREATE TABLE IF NOT EXISTS estoque_classificacao_regras (
      id INTEGER PRIMARY KEY, termo TEXT NOT NULL UNIQUE, categoria_id INTEGER NOT NULL REFERENCES estoque_categorias(id),
      endereco_zona TEXT,endereco_estante TEXT,endereco_prateleira TEXT,endereco_posicao TEXT);
      CREATE TABLE IF NOT EXISTS estoque_reposicao_vinculos (
        estoque_item_id INTEGER NOT NULL REFERENCES estoque_itens(id), solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(estoque_item_id,solicitacao_id));
      CREATE TABLE IF NOT EXISTS correias_pedidos (
        id INTEGER PRIMARY KEY, operacao_token TEXT UNIQUE, equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id), estoque_item_id INTEGER NOT NULL REFERENCES estoque_itens(id),
        preventiva_execucao_id INTEGER REFERENCES preventiva_execucoes(id), mecanico_user_id INTEGER NOT NULL REFERENCES users(id),
        quantidade REAL NOT NULL CHECK(quantidade>0), quantidade_devolvida REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'SOLICITADA',
        movimento_id INTEGER REFERENCES estoque_movimentos(id), troca_em TEXT, observacao TEXT,
        empresa_consumidora TEXT NOT NULL, setor_consumidor TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_correias_pedido_exec ON correias_pedidos(preventiva_execucao_id,estoque_item_id) WHERE preventiva_execucao_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS correias_config_equipamento (
        equipamento_id INTEGER PRIMARY KEY REFERENCES equipamentos(id), prazo_falha_dias REAL CHECK(prazo_falha_dias>0));
      CREATE TABLE IF NOT EXISTS correias_alertas (
        id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL UNIQUE REFERENCES correias_pedidos(id),
        pedido_anterior_id INTEGER REFERENCES correias_pedidos(id), equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id),
        intervalo_dias REAL NOT NULL, prazo_falha_dias REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_reposicao_solicitacao ON estoque_reposicao_vinculos(solicitacao_id); CREATE INDEX IF NOT EXISTS idx_correias_pedidos_item_status ON correias_pedidos(estoque_item_id,status); CREATE INDEX IF NOT EXISTS idx_correias_pedidos_equipamento ON correias_pedidos(equipamento_id,troca_em);');
    if (tableExists('estoque_reservas')) db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_reposicao_estoque_livre_insert AFTER INSERT ON estoque_reservas
      WHEN EXISTS(SELECT 1 FROM estoque_reposicao_vinculos WHERE solicitacao_id=NEW.solicitacao_id)
      BEGIN UPDATE estoque_reservas SET status='CANCELADA',origem='REPOSICAO_ESTOQUE' WHERE id=NEW.id; END;
      CREATE TRIGGER IF NOT EXISTS trg_reposicao_estoque_livre_update AFTER UPDATE OF quantidade_reservada ON estoque_reservas
      WHEN EXISTS(SELECT 1 FROM estoque_reposicao_vinculos WHERE solicitacao_id=NEW.solicitacao_id)
      BEGIN UPDATE estoque_reservas SET status='CANCELADA',origem='REPOSICAO_ESTOQUE' WHERE id=NEW.id; END;`);
    if (tableExists('estoque_itens') && tableExists('estoque_reservas')) db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_estoque_proteger_reserva_correias
      BEFORE UPDATE OF saldo_atual ON estoque_itens
      WHEN NEW.saldo_atual < COALESCE((SELECT SUM(MAX(quantidade_reservada-quantidade_retirada,0)) FROM estoque_reservas WHERE estoque_item_id=NEW.id AND status<>'CANCELADA'),0)
        + COALESCE((SELECT SUM(quantidade) FROM correias_pedidos WHERE estoque_item_id=NEW.id AND status IN ('SOLICITADA','SEPARADA')),0)
      BEGIN SELECT RAISE(ABORT,'Saldo reservado para solicitações e correias não pode ser consumido.'); END;`);
    if (tableExists('estoque_categorias')) {
      const groups = {'SOLDAS':['ELETRODO','ARAME MIG','ARAME TUBULAR','ARAME SOLIDO'], 'ABRASIVOS':['DISCO DE CORTE','DISCO CORTE','DISCO DE DESBASTE','DISCO DESBASTE','DISCO FLAP'], 'MATERIAIS ELÉTRICOS':['FITA ISOLANTE','BOTOEIRA','CONTATOR','INVERSOR'], 'PINTURA':['TINTA'], 'ROLAMENTOS':['ROLAMENTO','MANCAL','RETENTOR'], 'LUBRIFICANTES':['OLEO','GRAXA'], 'CORREIAS':['CORREIA']};
      for (const [nome, termos] of Object.entries(groups)) {
        let cat=db.prepare('SELECT id FROM estoque_categorias WHERE UPPER(nome)=UPPER(?) AND parent_id IS NULL AND ativo=1').get(nome);
        if (!cat) cat={id:Number(db.prepare('INSERT INTO estoque_categorias(nome,ativo) VALUES(?,1)').run(nome).lastInsertRowid)};
        for (const termo of termos) db.prepare('INSERT OR IGNORE INTO estoque_classificacao_regras(termo,categoria_id) VALUES(?,?)').run(termo,cat.id);
      }
    }
  })();
};
