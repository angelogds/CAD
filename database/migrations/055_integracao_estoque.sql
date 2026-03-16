PRAGMA foreign_keys = ON;

-- View para saldo atual por item (derivado de movimentos)
CREATE VIEW IF NOT EXISTS vw_estoque_saldo AS
SELECT
  i.id AS item_id,
  i.codigo,
  i.nome,
  i.unidade,
  COALESCE(SUM(
    CASE
      WHEN m.tipo = 'entrada' THEN m.quantidade
      WHEN m.tipo = 'saida' THEN -m.quantidade
      ELSE 0
    END
  ), 0) AS saldo
FROM estoque_itens i
LEFT JOIN estoque_movimentos m ON m.item_id = i.id
GROUP BY i.id;

-- View para compras + itens (para listagens)
CREATE VIEW IF NOT EXISTS vw_compras_itens AS
SELECT
  c.id AS compra_id,
  c.status,
  c.fornecedor,
  c.data_compra,
  c.data_recebimento,
  ci.id AS compra_item_id,
  ci.descricao,
  ci.quantidade,
  ci.custo_unit,
  ci.unidade
FROM compras c
LEFT JOIN compra_itens ci ON ci.compra_id = c.id;
