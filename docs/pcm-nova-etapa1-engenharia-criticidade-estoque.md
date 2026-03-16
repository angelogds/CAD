# PCM – Nova Etapa 1 (Engenharia da Manutenção + Criticidade + Integração com Estoque)

## 1) Objetivo e escopo desta rodada

Esta etapa **não reescreve** os módulos já existentes. Ela adiciona uma camada técnica dentro do PCM para:

1. **Lista Técnica (BOM) por equipamento**
2. **Criticidade de equipamentos**
3. **Plano de lubrificação integrado**
4. **Relatório de peças críticas com estoque abaixo do mínimo**

Base já existente e reaproveitada:
- `equipamentos` (cadastro mestre)
- `os` (execução e histórico)
- `estoque/almoxarifado`
- PCM atual (dashboard + plano mestre + preventivas + falhas)

---

## 2) Modelo de dados (tabelas, campos, relacionamentos)

> Convenção: nomes são sugestões práticas para SQLite/SQL relacional, podendo ajustar ao padrão atual do projeto.

## 2.1 Lista Técnica (BOM) por equipamento

### Tabela: `pcm_bom_itens`
Finalidade: guardar os componentes técnicos aplicados em cada equipamento.

Campos principais:
- `id` (PK)
- `equipamento_id` (FK -> `equipamentos.id`, NOT NULL)
- `categoria` (TEXT, NOT NULL)
  - Valores sugeridos: `ROLAMENTO`, `CORREIA`, `MOTOR`, `REDUTOR`, `OLEO_GRAXA`, `OUTRO`
- `codigo_interno` (TEXT)
- `descricao_tecnica` (TEXT, NOT NULL)
- `modelo_comercial` (TEXT)
- `fabricante_marca` (TEXT)
- `fornecedor_padrao` (TEXT)
- `aplicacao_posicao` (TEXT)
- `estoque_item_id` (FK opcional -> `estoque_itens.id`)
- `ativo` (INTEGER 0/1, default 1)
- `created_at`, `updated_at`

Campos técnicos específicos (na mesma tabela nesta etapa):
- Rolamento/correia:
  - `tipo_perfil` (ex.: B, C)
  - `comprimento_modelo` (ex.: B-72)
- Motor:
  - `potencia` (TEXT)
  - `rpm` (INTEGER)
  - `tensao` (TEXT)
- Redutor:
  - `relacao` (TEXT)
  - `torque_capacidade` (TEXT)
  - `tipo_oleo` (TEXT)
  - `qtd_oleo_litros` (REAL)
- Óleo/graxa:
  - `tipo_lubrificante` (TEXT ex.: ISO VG 220, NLGI 2)
  - `viscosidade` (TEXT)

Índices recomendados:
- `idx_pcm_bom_equipamento` (`equipamento_id`)
- `idx_pcm_bom_categoria` (`categoria`)
- `idx_pcm_bom_estoque` (`estoque_item_id`)
- `idx_pcm_bom_codigo_interno` (`codigo_interno`)

Relacionamentos:
- N:1 com `equipamentos`
- N:1 opcional com `estoque_itens`
- 1:N com plano de lubrificação (quando item for óleo/graxa)

---

## 2.2 Vínculo técnico com estoque e peças críticas

### Tabela: `pcm_bom_estoque_config`
Finalidade: guardar parâmetros PCM de criticidade de peça por vínculo BOM x item de estoque.

Campos:
- `id` (PK)
- `bom_item_id` (FK UNIQUE -> `pcm_bom_itens.id`, NOT NULL)
- `estoque_item_id` (FK -> `estoque_itens.id`, NOT NULL)
- `peca_critica` (INTEGER 0/1, default 0)
- `estoque_minimo_pcm` (REAL, opcional)
- `observacao` (TEXT)
- `created_at`, `updated_at`

Regra de negócio:
- Se `estoque_minimo_pcm` estiver nulo, usar o mínimo já cadastrado no estoque (se existir campo equivalente).

Índices:
- `idx_pcm_bom_cfg_critica` (`peca_critica`)
- `idx_pcm_bom_cfg_estoque` (`estoque_item_id`)

---

## 2.3 Criticidade dos equipamentos

### Tabela: `pcm_equipamento_criticidade`
Finalidade: classificar criticidade operacional com índice calculado.

Campos:
- `id` (PK)
- `equipamento_id` (FK UNIQUE -> `equipamentos.id`, NOT NULL)
- `impacto_producao` (INTEGER 1..5, NOT NULL)
- `impacto_seguranca` (INTEGER 1..5, NOT NULL)
- `impacto_ambiental` (INTEGER 1..5, NOT NULL)
- `custo_parada` (INTEGER 1..5, NOT NULL)
- `indice_criticidade` (REAL, calculado/persistido)
- `nivel_criticidade` (TEXT)
  - `ALTA`, `MEDIA`, `BAIXA`
- `justificativa` (TEXT)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Sugestão de cálculo:
- **Índice (média simples)** = `(impacto_producao + impacto_seguranca + impacto_ambiental + custo_parada) / 4`
- Conversão para nível:
  - `>= 4.0` => `ALTA`
  - `>= 2.5 e < 4.0` => `MEDIA`
  - `< 2.5` => `BAIXA`

Índices:
- `idx_pcm_criticidade_nivel` (`nivel_criticidade`)
- `idx_pcm_criticidade_equipamento` (`equipamento_id`)

---

## 2.4 Plano de Lubrificação integrado

### Tabela: `pcm_lubrificacao_planos`
Finalidade: registrar pontos de lubrificação por equipamento.

Campos:
- `id` (PK)
- `equipamento_id` (FK -> `equipamentos.id`, NOT NULL)
- `bom_item_lubrificante_id` (FK opcional -> `pcm_bom_itens.id`)
- `ponto_lubrificacao` (TEXT, NOT NULL)
- `descricao_ponto` (TEXT)
- Frequência:
  - `frequencia_dias` (INTEGER, opcional)
  - `frequencia_semanas` (INTEGER, opcional)
  - `frequencia_meses` (INTEGER, opcional)
  - `frequencia_horas_operacao` (INTEGER, opcional)
- `quantidade` (REAL, NOT NULL)
- `unidade` (TEXT, NOT NULL) — `g`, `ml`, `L`
- `ultima_execucao_em` (TEXT)
- `proxima_execucao_em` (TEXT)
- `ativo` (INTEGER 0/1, default 1)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Regras mínimas:
- Exigir ao menos um campo de frequência preenchido.
- Se frequência temporal (dias/semanas/meses) existir, calcular `proxima_execucao_em` automaticamente.

Índices:
- `idx_pcm_lub_equipamento` (`equipamento_id`)
- `idx_pcm_lub_proxima` (`proxima_execucao_em`)
- `idx_pcm_lub_ativo` (`ativo`)

---

## 2.5 Integração de execução com PCM já existente

### Tabela existente reaproveitada: `pcm_planos` (Etapa anterior)
- Cada item de lubrificação pode gerar atividade no Plano Mestre:
  - `tipo_manutencao = 'LUBRIFICACAO'`
  - `descricao_atividade = 'Lubrificação - <ponto_lubrificacao>'`

### Tabela existente reaproveitada: `pcm_execucoes`
- Registrar execução da lubrificação com vínculo à OS gerada.

### Opcional (se precisar rastreio explícito)
Tabela de vínculo: `pcm_lubrificacao_execucoes`
- `id` (PK)
- `lubrificacao_plano_id` (FK)
- `os_id` (FK)
- `executado_em`
- `observacao`

---

## 3) Estrutura de telas no PCM

## 3.1 Menu/Abas dentro de `/pcm`
Criar/organizar sub-abas:
1. **Dashboard PCM** (existente, sem retrabalho)
2. **Plano Mestre** (existente, sem retrabalho)
3. **Engenharia** (nova área desta etapa)
   - Lista Técnica (BOM)
   - Criticidade
   - Plano de Lubrificação
   - Peças Críticas

---

## 3.2 Tela: Engenharia > Lista Técnica (BOM)

Layout sugerido:
- **Barra de filtros (topo):** Equipamento, Categoria, Código interno, “com vínculo de estoque” (sim/não)
- **Tabela principal (centro):**
  - Equipamento
  - Categoria
  - Código interno
  - Modelo/descrição
  - Aplicação/posição
  - Item de estoque vinculado
  - Peça crítica (sim/não)
  - Estoque disponível (somente leitura)
  - Ações (Editar, Inativar)
- **Painel lateral/modal:** “Novo item técnico” com campos dinâmicos por categoria

Aproveitamento do sistema atual:
- Busca equipamentos da tabela `equipamentos`.
- Busca item disponível do almoxarifado em `estoque_itens`.
- Sem alterar fluxo operacional de estoque nesta etapa.

---

## 3.3 Tela: Engenharia > Criticidade

Layout sugerido:
- **Lista resumida de equipamentos:** nome, setor, nível, índice
- **Formulário por equipamento:**
  - 4 fatores (1..5): produção, segurança, ambiental, custo de parada
  - campo justificativa
  - exibição automática do índice e nível calculado
- **Cores de apoio:**
  - ALTA = vermelho
  - MEDIA = amarelo
  - BAIXA = verde

Funcionalidade de valor imediato:
- Filtro global do PCM por criticidade usando `pcm_equipamento_criticidade.nivel_criticidade`.

---

## 3.4 Tela: Engenharia > Plano de Lubrificação

Layout sugerido:
- **Filtros:** equipamento, situação (No prazo/Próximo/Atrasado), periodicidade
- **Tabela:**
  - Equipamento
  - Ponto
  - Lubrificante
  - Frequência
  - Quantidade
  - Próxima execução
  - Situação
  - Ações (Gerar atividade no plano, Registrar execução)
- **Cadastro rápido:** criar ponto de lubrificação com vínculo ao item de óleo/graxa da BOM

Integração com planejamento existente:
- Botão “Gerar atividade” cria item no `pcm_planos`.
- Botão “Registrar execução” vincula à OS já concluída via `pcm_execucoes`.

---

## 3.5 Tela: Engenharia > Peças Críticas

Objetivo: relatório simples de “Peças críticas abaixo do mínimo”.

Layout sugerido:
- **Filtros:** equipamento, peça crítica (fixo = sim), abaixo do mínimo (fixo = sim)
- **Tabela relatório:**
  - Item técnico (BOM)
  - Código estoque
  - Descrição estoque
  - Estoque atual
  - Estoque mínimo (PCM ou estoque)
  - Diferença (mínimo - atual)
  - Equipamentos aplicados (contagem + lista curta)
  - Ação (ir para estoque / compras)

Regra do relatório:
- Mostrar registros onde:
  - `peca_critica = 1`
  - `estoque_atual < estoque_minimo_referencia`

---

## 4) Relatórios e consultas-chave desta etapa

## 4.1 Equipamentos de alta criticidade com preventivas atrasadas

Fonte de dados:
- `pcm_equipamento_criticidade` (nível = ALTA)
- `pcm_planos` (situação = ATRASADO)
- `equipamentos`

Saída:
- Equipamento | Índice criticidade | Qtde preventivas atrasadas | Próxima data vencida

---

## 4.2 Peças críticas com estoque abaixo do mínimo

Fonte de dados:
- `pcm_bom_estoque_config`
- `pcm_bom_itens`
- `estoque_itens` (ou tabela equivalente já existente)

Saída:
- Peça | Código estoque | Estoque atual | Mínimo | Equipamentos onde aplicada

---

## 5) Endpoints/funções sugeridos (genéricos)

## 5.1 Engenharia - BOM
- `GET /pcm/engenharia/bom`
- `POST /pcm/engenharia/bom`
- `PUT /pcm/engenharia/bom/:id`
- `GET /pcm/engenharia/bom/:id`

## 5.2 Engenharia - Criticidade
- `GET /pcm/engenharia/criticidade`
- `POST /pcm/engenharia/criticidade` (upsert por equipamento)
- `GET /pcm/engenharia/criticidade/atrasos-preventiva`

## 5.3 Engenharia - Lubrificação
- `GET /pcm/engenharia/lubrificacao`
- `POST /pcm/engenharia/lubrificacao`
- `PUT /pcm/engenharia/lubrificacao/:id`
- `POST /pcm/engenharia/lubrificacao/:id/gerar-atividade`
- `POST /pcm/engenharia/lubrificacao/:id/registrar-execucao`

## 5.4 Engenharia - Peças críticas
- `GET /pcm/engenharia/pecas-criticas`

---

## 6) Como esta etapa aproveita o que já existe (sem retrabalho)

1. **Equipamentos**
   - continuam como cadastro mestre.
   - BOM, criticidade e lubrificação são apenas extensões referenciando `equipamento_id`.

2. **OS**
   - continuam sendo o mecanismo de execução.
   - lubrificação usa o mesmo fluxo de geração e conclusão de OS já implantado no PCM.

3. **PCM atual (Plano Mestre + Dashboard + Falhas)**
   - plano de lubrificação só alimenta o plano mestre existente.
   - criticidade vira filtro adicional nos painéis e relatórios já existentes.
   - banco de falhas não é refeito: apenas poderá consumir BOM no vínculo de peças trocadas depois.

4. **Estoque/Almoxarifado e Compras**
   - leitura de saldo disponível e item vinculado.
   - relatório de peças críticas orienta reposição sem mudar fluxo de compras nesta etapa.

---

## 7) Ordem recomendada de implementação (prática)

1. Criar tabelas: `pcm_bom_itens`, `pcm_bom_estoque_config`, `pcm_equipamento_criticidade`, `pcm_lubrificacao_planos`.
2. Entregar telas de consulta/cadastro em `/pcm/engenharia` (BOM + criticidade + lubrificação).
3. Integrar ação “gerar atividade” para usar `pcm_planos` já existente.
4. Entregar relatório “peças críticas abaixo do mínimo”.
5. Habilitar filtro por criticidade no Dashboard/Plano Mestre existentes.

