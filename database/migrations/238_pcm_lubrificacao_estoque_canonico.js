// Vínculo opt-in com o estoque físico. Nenhum saldo é migrado ou deduzido automaticamente.
module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing('pcm_lub_reposicao_itens', 'estoque_item_id', 'estoque_item_id INTEGER REFERENCES estoque_itens(id)');
  addColumnIfMissing('pcm_lub_reposicao_consumos', 'estoque_movimento_id', 'estoque_movimento_id INTEGER REFERENCES estoque_movimentos(id)');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_lub_consumo_movimento
    ON pcm_lub_reposicao_consumos(estoque_movimento_id)
    WHERE estoque_movimento_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_lub_reposicao_estoque_item
    ON pcm_lub_reposicao_itens(estoque_item_id)
    WHERE estoque_item_id IS NOT NULL;`);
};
