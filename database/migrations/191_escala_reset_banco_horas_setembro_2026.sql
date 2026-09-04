-- Reset administrativo do Banco de Horas para início da nova regra de compensação.
-- Data-base definida pela Manutenção/RH: 01/09/2026.
--
-- IMPORTANTE:
-- - não apaga horas extras, folgas, movimentos ou históricos anteriores;
-- - cria apenas um movimento compensatório por colaborador para levar o saldo atual a zero;
-- - é idempotente para o mesmo colaborador/data-base/descrição;
-- - preserva toda a rastreabilidade anterior para relatórios e auditoria.

WITH saldos AS (
  SELECT
    colaborador_id,
    SUM(
      CASE
        WHEN tipo IN ('CREDITO_HORA_EXTRA', 'AJUSTE_CREDITO') THEN COALESCE(minutos, 0)
        ELSE -COALESCE(minutos, 0)
      END
    ) AS saldo_minutos
  FROM escala_banco_horas_movimentos
  GROUP BY colaborador_id
),
resetar AS (
  SELECT colaborador_id, saldo_minutos
  FROM saldos
  WHERE saldo_minutos <> 0
    AND NOT EXISTS (
      SELECT 1
      FROM escala_banco_horas_movimentos m
      WHERE m.colaborador_id = saldos.colaborador_id
        AND m.data_movimento = '2026-09-01'
        AND m.descricao LIKE 'RESET INICIAL SETEMBRO/2026%'
    )
)
INSERT INTO escala_banco_horas_movimentos (
  user_id,
  colaborador_id,
  tipo,
  minutos,
  data_movimento,
  descricao,
  criado_por
)
SELECT
  NULL,
  colaborador_id,
  CASE WHEN saldo_minutos > 0 THEN 'AJUSTE_DEBITO' ELSE 'AJUSTE_CREDITO' END,
  ABS(saldo_minutos),
  '2026-09-01',
  'RESET INICIAL SETEMBRO/2026 — Banco de Horas zerado por decisão administrativa para início da nova regra de compensação. Histórico anterior preservado.',
  NULL
FROM resetar;
