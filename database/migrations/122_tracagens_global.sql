ALTER TABLE tracagens ADD COLUMN modulo_origem TEXT;
ALTER TABLE tracagens ADD COLUMN dados_calculo_json TEXT;
ALTER TABLE tracagens ADD COLUMN criado_por INTEGER;

UPDATE tracagens
SET modulo_origem = COALESCE(modulo_origem, replace(tipo, '-', '_')),
    dados_calculo_json = COALESCE(dados_calculo_json, json_object('parametros', json(parametros_json), 'resultados', json(resultado_json))),
    criado_por = COALESCE(criado_por, usuario_id)
WHERE 1=1;

CREATE INDEX IF NOT EXISTS idx_tracagens_modulo_origem ON tracagens(modulo_origem);
CREATE INDEX IF NOT EXISTS idx_tracagens_criado_por ON tracagens(criado_por);
