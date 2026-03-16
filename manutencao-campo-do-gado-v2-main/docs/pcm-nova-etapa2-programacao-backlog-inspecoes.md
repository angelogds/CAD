# PCM – Nova Etapa 2 (Programação Semanal, Backlog, Horas, Inspeções e Indicadores Avançados)

## 1) Objetivo da Etapa 2 desta rodada

Evoluir o PCM para gestão tática/operacional da execução semanal e governança de desempenho, sem reescrever módulos existentes.

Escopo desta etapa:
1. Programação semanal da equipe de manutenção.
2. Backlog consolidado e priorizado.
3. Controle de horas por mecânico/equipe em OS.
4. Rotas de inspeção com checklist e geração de anomalias/OS.
5. Relatórios e indicadores avançados para operação e diretoria.

Base reaproveitada:
- `equipamentos`, `os`, `preventiva`, `demandas`, `estoque/almoxarifado`, `compras`.
- PCM já existente: dashboard, plano mestre, falhas.
- Nova Etapa 1 da rodada: BOM, criticidade, plano de lubrificação, peças críticas.

---

## 2) Modelo de dados (tabelas, campos e relacionamentos)

## 2.1 Programação Semanal

### Tabela: `pcm_programacao_semana`
Cabeçalho da semana programada.

Campos:
- `id` (PK)
- `semana_ref` (TEXT, ex.: `2026-W12`)
- `data_inicio` (TEXT, segunda-feira)
- `data_fim` (TEXT, domingo)
- `status` (TEXT: `RASCUNHO`, `PUBLICADA`, `ENCERRADA`)
- `observacao` (TEXT)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Índices:
- `idx_pcm_prog_semana_ref` (`semana_ref`, UNIQUE)
- `idx_pcm_prog_status` (`status`)

### Tabela: `pcm_programacao_itens`
Itens da agenda semanal (cada OS/atividade atribuída a pessoa/equipe + dia).

Campos:
- `id` (PK)
- `programacao_semana_id` (FK -> `pcm_programacao_semana.id`, NOT NULL)
- `os_id` (FK opcional -> `os.id`)
- `pcm_plano_id` (FK opcional -> `pcm_planos.id`)
- `demanda_id` (FK opcional -> `demandas.id`)
- `equipamento_id` (FK -> `equipamentos.id`, NOT NULL)
- `setor` (TEXT)
- `responsavel_user_id` (FK opcional -> `users.id`)
- `equipe_nome` (TEXT, fallback quando não houver equipe estruturada)
- `data_planejada` (TEXT, NOT NULL)
- `turno` (TEXT: `MANHA`, `TARDE`, `NOITE`, opcional)
- `estimativa_horas` (REAL, NOT NULL)
- `tipo_manutencao` (TEXT: `PREVENTIVA`, `CORRETIVA`, `INSPECAO`, `LUBRIFICACAO`, `PREDITIVA`)
- `prioridade` (TEXT: `BAIXA`, `MEDIA`, `ALTA`, `EMERGENCIA`)
- `situacao` (TEXT: `PLANEJADA`, `EM_EXECUCAO`, `CONCLUIDA`, `ADIADA`, `NAO_REALIZADA`)
- `ordem_no_dia` (INTEGER, opcional)
- `inicio_previsto` (TEXT, opcional)
- `fim_previsto` (TEXT, opcional)
- `motivo_adiamento` (TEXT, opcional)
- `created_at`, `updated_at`

Regras:
- Exigir **pelo menos um vínculo de origem**: `os_id` ou `pcm_plano_id` ou `demanda_id`.
- Itens `CONCLUIDA` podem ser sincronizados com status da OS.

Índices:
- `idx_pcm_prog_itens_semana` (`programacao_semana_id`)
- `idx_pcm_prog_itens_data_resp` (`data_planejada`, `responsavel_user_id`)
- `idx_pcm_prog_itens_situacao` (`situacao`)
- `idx_pcm_prog_itens_tipo` (`tipo_manutencao`)

---

## 2.2 Backlog consolidado (visão lógica)

> Recomendação: criar como **VIEW materializável lógica** (consulta consolidada), não tabela física obrigatória.

### View sugerida: `vw_pcm_backlog_manutencao`
Fontes:
1. OS corretivas abertas (`os.status != CONCLUIDA`, `os.tipo = CORRETIVA`).
2. Preventivas atrasadas (`pcm_planos` com data prevista vencida e sem execução).
3. Preventivas planejadas não executadas (janela futura + sem vínculo concluído).
4. Demandas aprovadas sem OS (`demandas.status = APROVADA` e sem `os_id`).

Campos de saída da view:
- `origem` (`OS`, `PLANO_PREVENTIVA`, `DEMANDA_APROVADA`)
- `origem_id` (id da entidade)
- `os_id` (quando aplicável)
- `equipamento_id`
- `equipamento_nome`
- `setor`
- `tipo_manutencao`
- `data_abertura`
- `data_prevista`
- `prioridade`
- `criticidade` (via `pcm_equipamento_criticidade.nivel_criticidade`)
- `dias_em_atraso`
- `status_origem`
- `disponivel_para_programacao` (0/1)

Filtros esperados:
- criticidade, setor, tipo, prioridade, faixa de atraso, origem.

---

## 2.3 Controle de horas por mecânico/equipe

### Tabela: `pcm_os_apontamentos_horas`
Registro de apontamento de esforço por pessoa/equipe em OS.

Campos:
- `id` (PK)
- `os_id` (FK -> `os.id`, NOT NULL)
- `equipamento_id` (FK -> `equipamentos.id`, redundância analítica)
- `user_id` (FK opcional -> `users.id`)
- `equipe_nome` (TEXT, opcional)
- `data_trabalho` (TEXT, NOT NULL)
- `horas_trabalhadas` (REAL, NOT NULL)
- `tipo_atividade` (TEXT: `MECANICA`, `ELETRICA`, `LUBRIFICACAO`, `INSPECAO`, `OUTRA`)
- `tipo_manutencao` (TEXT: `PREVENTIVA`, `CORRETIVA`, `INSPECAO`, `LUBRIFICACAO`, `PREDITIVA`)
- `observacao` (TEXT)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Regras:
- Pelo menos um responsável: `user_id` ou `equipe_nome`.
- `horas_trabalhadas > 0`.
- Ao concluir OS, exigir ao menos um apontamento (regra configurável).

Índices:
- `idx_pcm_horas_os` (`os_id`)
- `idx_pcm_horas_user_data` (`user_id`, `data_trabalho`)
- `idx_pcm_horas_tipo` (`tipo_manutencao`, `tipo_atividade`)
- `idx_pcm_horas_equip` (`equipamento_id`)

---

## 2.4 Rotas de inspeção e checklists

### Tabela: `pcm_rotas_inspecao`
Cadastro da rota.

Campos:
- `id` (PK)
- `nome_rota` (TEXT, NOT NULL)
- `descricao` (TEXT)
- `frequencia` (TEXT: `SEMANAL`, `QUINZENAL`, `MENSAL`, `BIMESTRAL`, `PERSONALIZADA`)
- `frequencia_dias` (INTEGER, opcional)
- `responsavel_user_id` (FK opcional -> `users.id`)
- `equipe_nome` (TEXT, opcional)
- `ativo` (INTEGER 0/1, default 1)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

### Tabela: `pcm_rotas_equipamentos`
Equipamentos incluídos na rota.

Campos:
- `id` (PK)
- `rota_id` (FK -> `pcm_rotas_inspecao.id`, NOT NULL)
- `equipamento_id` (FK -> `equipamentos.id`, NOT NULL)
- `ordem_visita` (INTEGER)
- `ativo` (INTEGER 0/1)

Índice/constraint:
- UNIQUE (`rota_id`, `equipamento_id`)

### Tabela: `pcm_checklists_modelos`
Modelo de checklist por equipamento/rota.

Campos:
- `id` (PK)
- `rota_id` (FK -> `pcm_rotas_inspecao.id`)
- `equipamento_id` (FK -> `equipamentos.id`)
- `nome_modelo` (TEXT)
- `ativo` (INTEGER 0/1)
- `created_at`, `updated_at`

### Tabela: `pcm_checklists_itens`
Itens de verificação.

Campos:
- `id` (PK)
- `checklist_modelo_id` (FK -> `pcm_checklists_modelos.id`, NOT NULL)
- `descricao_item` (TEXT, NOT NULL)
- `categoria_item` (TEXT: `RUIDO`, `TEMPERATURA`, `VIBRACAO`, `VAZAMENTO`, `OUTRA`)
- `obrigatorio` (INTEGER 0/1)
- `ordem` (INTEGER)
- `ativo` (INTEGER 0/1)

### Tabela: `pcm_inspecoes_execucoes`
Execução da rota/checklist.

Campos:
- `id` (PK)
- `rota_id` (FK -> `pcm_rotas_inspecao.id`, NOT NULL)
- `equipamento_id` (FK -> `equipamentos.id`, NOT NULL)
- `executado_por_user_id` (FK -> `users.id`)
- `data_execucao` (TEXT, NOT NULL)
- `status_execucao` (TEXT: `CONCLUIDA`, `PARCIAL`, `CANCELADA`)
- `observacoes_gerais` (TEXT)
- `created_at`

### Tabela: `pcm_inspecoes_respostas`
Resposta por item de checklist.

Campos:
- `id` (PK)
- `inspecao_execucao_id` (FK -> `pcm_inspecoes_execucoes.id`, NOT NULL)
- `checklist_item_id` (FK -> `pcm_checklists_itens.id`, NOT NULL)
- `resultado` (TEXT: `NORMAL`, `ATENCAO`, `CRITICO`)
- `observacao` (TEXT)
- `foto_path` (TEXT, opcional)
- `sugerir_acao` (INTEGER 0/1)
- `os_gerada_id` (FK opcional -> `os.id`)
- `demanda_gerada_id` (FK opcional -> `demandas.id`)
- `created_at`

Regra importante:
- Se `resultado` for `ATENCAO` ou `CRITICO`, habilitar “Gerar OS/Demanda”.
- Registrar evento no banco de falhas/anomalias (ex.: tabela de falhas ou histórico dedicado).

---

## 3) Telas do PCM (layout sugerido)

## 3.1 Aba: Programação Semanal

Seções:
1. **Filtro superior**:
   - semana, equipe/responsável, setor, tipo manutenção, situação.
2. **Agenda em grade**:
   - Colunas: Seg → Dom.
   - Linhas: mecânicos/equipes.
   - Cartões com: OS/atividade, equipamento, horas estimadas, prioridade, status.
3. **Painel lateral “Backlog disponível”**:
   - itens arrastáveis (ou botão “programar”).
4. **Resumo da carga**:
   - horas por dia e por responsável.

Ações:
- Atribuir item do backlog para dia + responsável.
- Replanejar (mover dia/linha).
- Marcar como adiada/não realizada com motivo.

---

## 3.2 Aba: Backlog de Manutenção

Seções:
1. **Filtros avançados**:
   - criticidade, setor, tipo, prioridade, origem, dias de atraso.
2. **Tabela backlog consolidado**:
   - equipamento, origem, tipo, abertura/prevista, prioridade, criticidade, atraso, status.
3. **Ações por linha**:
   - “Programar na semana”.
   - “Abrir OS”.
   - “Editar origem” (OS/plano/demanda).

Regras visuais:
- Emergência e alta criticidade em destaque.
- Coluna “dias em atraso” com semáforo.

---

## 3.3 Aba: Horas e Produtividade

Seções:
1. **Filtros**: período, mecânico, equipe, setor, equipamento, tipo manutenção.
2. **Cards**:
   - horas totais,
   - horas por corretiva/preventiva,
   - horas médias por OS,
   - % horas improdutivas (quando houver status adiado/cancelado).
3. **Tabelas/gráficos**:
   - horas por mecânico,
   - horas por setor/equipamento,
   - horas por tipo de atividade.

Entrada operacional:
- Tela/modal de apontamento ligada ao fechamento de OS.

---

## 3.4 Aba: Rotas de Inspeção

Subabas:
1. **Rotas**
   - cadastro de rota, frequência, responsável e equipamentos.
2. **Checklist Modelo**
   - itens por equipamento/rota.
3. **Execução**
   - checklist mobile-friendly com resultados `NORMAL/ATENCAO/CRITICO`, observações e foto.
4. **Anomalias**
   - lista de itens marcados `ATENCAO/CRITICO`, com status e vínculo OS/demanda.

Ações-chave:
- Gerar OS ou demanda direto da anomalia.
- Vincular execução ao histórico do equipamento.

---

## 3.5 Aba: Relatórios Avançados (Operação + Diretoria)

Seções:
1. **Filtros globais**: período, setor, criticidade, tipo manutenção.
2. **Indicadores executivos** (cards): custo, falhas, disponibilidade, backlog crítico.
3. **Rankings** (Top 10): falhas, custo, criticidade composta.
4. **Tendências mensais**: custo, falhas, preventiva x corretiva.

---

## 4) Relatórios e indicadores avançados (com origem dos dados)

## 4.1 Equipamentos com mais paradas (falhas)
- Métrica: `COUNT(pcm_falhas.id)` por equipamento no período.
- Fontes: `pcm_falhas`, `os`, `equipamentos`.

## 4.2 Equipamentos com maior custo de manutenção
- Métrica: `SUM(os.custo_total)` ou `SUM(custo_mao_obra + custo_pecas)`.
- Fontes: `os`, `equipamentos`.

## 4.3 Peças que mais consomem dinheiro
- Métrica: soma de custo por peça consumida em OS.
- Fontes: `pcm_falha_pecas` + vínculo `estoque_itens` (ou movimento de estoque por OS, se disponível).

## 4.4 Tendência de custo por mês
- Métrica: soma mensal de custos de OS concluídas.
- Fontes: `os.closed_at`, `os.custo_total`.

## 4.5 Tendência de falhas por mês
- Métrica: quantidade mensal de falhas classificadas.
- Fontes: `pcm_falhas.created_at` (ou data OS corretiva).

## 4.6 Disponibilidade por equipamento/setor
- Fórmula:
  - `MTBF = média(intervalos entre falhas)`
  - `MTTR = média(tempo de reparo)`
  - `Disponibilidade = MTBF / (MTBF + MTTR)`
- Fontes: `os` (abertura/conclusão), `pcm_falhas`, `equipamentos/setor`.

## 4.7 Custo de manutenção por setor por mês (diretoria)
- Métrica: soma de custos agrupada por setor e mês.
- Fontes: `os` + setor de `equipamentos`.

## 4.8 % corretiva x preventiva ao longo do tempo
- Métrica: proporção mensal por tipo de manutenção.
- Fontes: `os.tipo`, `os.opened_at`/`os.closed_at`.

## 4.9 Top 10 equipamentos críticos por custo + frequência de falha
- Score sugerido:
  - `score = (peso1 * normaliza(custo)) + (peso2 * normaliza(qtd_falhas)) + (peso3 * indice_criticidade)`
- Fontes: `os`, `pcm_falhas`, `pcm_equipamento_criticidade`.

## 4.10 Backlog crítico monitorado
- Métrica: itens de backlog com `criticidade=ALTA` e/ou `prioridade=EMERGENCIA`.
- Fontes: `vw_pcm_backlog_manutencao` + `pcm_programacao_itens`.

---

## 5) Endpoints/funções sugeridos (genéricos)

## 5.1 Programação semanal
- `GET /pcm/programacao-semanal?semana=YYYY-Www`
- `POST /pcm/programacao-semanal`
- `POST /pcm/programacao-semanal/:id/itens`
- `PUT /pcm/programacao-itens/:id`
- `POST /pcm/programacao-itens/:id/replanejar`

## 5.2 Backlog
- `GET /pcm/backlog`
- `POST /pcm/backlog/:origem/:id/programar`

## 5.3 Horas
- `POST /pcm/os/:osId/apontamentos-horas`
- `GET /pcm/horas/resumo`
- `GET /pcm/horas/por-mecanico`
- `GET /pcm/horas/por-setor`

## 5.4 Rotas e checklists
- `GET /pcm/inspecoes/rotas`
- `POST /pcm/inspecoes/rotas`
- `POST /pcm/inspecoes/rotas/:id/equipamentos`
- `POST /pcm/inspecoes/checklists/modelos`
- `POST /pcm/inspecoes/execucoes`
- `POST /pcm/inspecoes/execucoes/:id/respostas`
- `POST /pcm/inspecoes/respostas/:id/gerar-os`
- `POST /pcm/inspecoes/respostas/:id/gerar-demanda`

## 5.5 Relatórios avançados
- `GET /pcm/relatorios/falhas-top-equipamentos`
- `GET /pcm/relatorios/custos-top-equipamentos`
- `GET /pcm/relatorios/pecas-maior-custo`
- `GET /pcm/relatorios/tendencia-custos`
- `GET /pcm/relatorios/tendencia-falhas`
- `GET /pcm/relatorios/disponibilidade`
- `GET /pcm/relatorios/diretoria`

---

## 6) Integração com Etapa 1 e com PCM atual (sem retrabalho)

1. **Etapa 1 (BOM/criticidade/lubrificação)**
   - criticidade vira prioridade de backlog/programação.
   - lubrificação já cadastrada alimenta backlog/programação semanal.
   - BOM e peças críticas enriquecem inspeções e relatórios de custo de componentes.

2. **PCM atual (plano mestre/falhas/dashboard)**
   - backlog consome `pcm_planos` e `pcm_falhas` existentes.
   - programação semanal é camada de alocação daquilo que já existe (OS/plano/demanda).
   - dashboard avançado expande indicadores já existentes.

3. **OS e Demandas existentes**
   - OS continua sendo entidade oficial de execução.
   - inspeções geram OS/demandas sem criar fluxo paralelo.

4. **Estoque/Compras existentes**
   - relatório de peças de alto custo usa consumo já registrado.
   - sem alterar rotina de compras; apenas gera inteligência para priorização.

---

## 7) Ordem recomendada de implementação

1. Camada de dados: programação semanal + apontamentos de horas.
2. View de backlog consolidado + tela de filtros/atribuição.
3. Rotas/checklists com execução e geração de OS/demanda.
4. Painel de horas + relatórios avançados (custos, falhas, disponibilidade).
5. Visões de diretoria e ajustes de performance (índices/materializações).

