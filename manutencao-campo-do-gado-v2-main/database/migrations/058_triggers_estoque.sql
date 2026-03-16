
PRAGMA foreign_keys = ON;

-- Quando uma compra mudar para "recebida", gera movimentos de entrada no estoque
-- Regras:
-- - só gera se ainda não existirem movimentos vinculados àquela compra
-- - origem='compra' e referencia_id=compra_id

CREATE TRIGGER IF NOT EXISTS trg_compra_recebida_gera_estoque
AFTER UPDATE OF status ON compras
WHEN NEW.status = 'recebida' AND OLD.status <> 'recebida'
BEGIN
  INSERT INTO estoque_movimentos (item_id, tipo, quantidade, custo_unit, origem, referencia_id, observacao, created_at)
  SELECT
    ci.item_id,
    'entrada',
    ci.quantidade,
    ci.custo_unit,
    'compra',
    NEW.id,
    'Entrada automática via recebimento',
    datetime('now')
  FROM compra_itens ci
  WHERE ci.compra_id = NEW.id
    AND ci.item_id IS NOT NULL;
END;
