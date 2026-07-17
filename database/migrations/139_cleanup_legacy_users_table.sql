-- A tabela é deliberadamente preservada: instalações antigas ainda podem possuir
-- FKs de módulos legados apontando para ela. Removê-la interrompia a sequência de
-- migrations. Uma limpeza futura só poderá ocorrer após auditoria/recriação das FKs.
SELECT 1;
