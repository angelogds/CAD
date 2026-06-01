CREATE TABLE IF NOT EXISTS os_andamento_motivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  texto_padrao TEXT NOT NULL,
  exige_observacao INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS os_andamento_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  motivo_codigo TEXT NOT NULL,
  motivo_nome TEXT NOT NULL,
  texto_padrao TEXT NOT NULL,
  observacao_mecanico TEXT,
  texto_ia TEXT,
  status_os_no_momento TEXT,
  registrado_por INTEGER,
  registrado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_os_andamento_historico_os ON os_andamento_historico(os_id);
CREATE INDEX IF NOT EXISTS idx_os_andamento_historico_data ON os_andamento_historico(registrado_em);
CREATE INDEX IF NOT EXISTS idx_os_andamento_historico_motivo ON os_andamento_historico(motivo_codigo);

-- As colunas-resumo da tabela os são adicionadas de forma idempotente pelo migrador
-- antes da aplicação deste arquivo, preservando bancos que receberam versões preliminares.

INSERT OR IGNORE INTO os_andamento_motivos (codigo, nome, texto_padrao, exige_observacao, ordem) VALUES
('FALTA_MATERIAL', 'Falta de material', 'OS mantida em andamento por falta de material necessário para execução do serviço. A situação deverá ser comunicada ao encarregado de manutenção para solicitação, compra ou retirada no almoxarifado. A execução será retomada após chegada e liberação do material.', 0, 1),
('AGUARDANDO_COMPRA', 'Aguardando compra', 'OS mantida em andamento porque o item necessário ainda depende do processo de compra. A manutenção fica aguardando retorno do setor de compras para dar continuidade ao serviço.', 0, 2),
('MATERIAL_CHEGOU', 'Material chegou', 'Material necessário para continuidade da OS recebido/disponibilizado. Serviço liberado para retomada da execução pela equipe de manutenção.', 0, 3),
('FALTA_MAO_DE_OBRA', 'Falta de mão de obra capacitada', 'OS mantida em andamento por indisponibilidade de mão de obra capacitada ou equipe suficiente para execução segura do serviço. A atividade deverá ser reprogramada conforme disponibilidade da equipe.', 0, 4),
('EQUIPAMENTO_EM_PRODUCAO', 'Equipamento em produção / sem parada liberada', 'OS mantida em andamento porque o equipamento permanece em operação e ainda não houve liberação de parada pela produção. A execução deverá ocorrer após liberação operacional segura.', 0, 5),
('AGUARDANDO_TERCEIRO', 'Aguardando serviço terceirizado', 'OS mantida em andamento por dependência de serviço terceirizado, fabricação externa, tornearia, soldagem especializada ou suporte externo. A manutenção acompanhará o retorno para dar continuidade ao serviço.', 0, 6),
('AGUARDANDO_PECA_TORNEARIA', 'Aguardando peça de tornearia', 'OS mantida em andamento porque depende de peça em fabricação ou recuperação na tornearia. Após retorno da peça, a equipe deverá retomar a montagem e concluir a OS.', 0, 7),
('FALTA_FERRAMENTA', 'Falta de ferramenta ou recurso adequado', 'OS mantida em andamento por falta de ferramenta, equipamento auxiliar ou recurso adequado para execução segura do serviço.', 0, 8),
('SERVICO_COMPLEXO_CONTINUIDADE', 'Serviço demanda continuação', 'OS mantida em andamento porque o serviço demanda mais tempo de execução, desmontagem, montagem, ajuste, teste ou acompanhamento operacional. A atividade continuará na próxima programação da manutenção.', 0, 9),
('RISCO_SEGURANCA', 'Risco de segurança / aguardando bloqueio', 'OS mantida em andamento porque a execução exige condição segura, bloqueio, liberação da área ou eliminação de risco operacional. O serviço somente deverá prosseguir após liberação segura.', 0, 10),
('AGUARDANDO_APROVACAO', 'Aguardando aprovação do encarregado', 'OS mantida em andamento aguardando avaliação, orientação ou aprovação do encarregado de manutenção para definição da melhor forma de execução.', 0, 11),
('OUTRO', 'Outro motivo', 'OS mantida em andamento por motivo operacional informado pela equipe. A observação complementar deverá detalhar a situação para registro no relatório.', 1, 12);
