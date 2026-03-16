# PCM – Etapa 2 (Engenharia da Manutenção, Banco de Falhas e Indicadores Avançados)

## 1) Objetivo da Etapa 2
Expandir o módulo **PCM** para uma camada técnica avançada, conectando engenharia de manutenção, histórico de falhas e inteligência de indicadores por equipamento.

A Etapa 2 complementa a Etapa 1 com três blocos:
1. **Engenharia da Manutenção**
2. **Banco de Falhas e Análises**
3. **Indicadores Avançados e Relatórios**

---

## 2) Modelo de dados (entidades, campos e relacionamentos)

## 2.1 Engenharia da Manutenção

### Tabela: `pcm_bom_itens` (Lista Técnica/BOM por equipamento)
Finalidade: catálogo técnico de itens aplicados em cada equipamento.

Campos sugeridos:
- `id` (PK)
- `equipamento_id` (FK -> `equipamentos.id`)
- `categoria_item` (TEXT)  
  Valores: `ROLAMENTO`, `CORREIA`, `MOTOR`, `REDUTOR`, `OLEO_GRAXA`, `OUTRO`
- `codigo_interno` (TEXT)
- `modelo_comercial` (TEXT) — ex.: `6312 ZZ`, `B-72`
- `fabricante_fornecedor` (TEXT)
- `aplicacao` (TEXT) — ex.: `Mancal lado acoplamento`
- `especificacao_tecnica` (TEXT) — campo livre para detalhes
- `unidade` (TEXT) — ex.: `UN`, `L`, `KG`
- `ativo` (INTEGER 0/1)
- `created_at`, `updated_at`

Campos complementares por tipo (podem ficar na mesma tabela para Etapa 2):
- Motores: `potencia_cv`, `rpm`, `tensao_v`, `modelo_motor`
- Redutores: `modelo_redutor`, `relacao_reducao`, `tipo_oleo`, `qtd_oleo_l`
- Lubrificantes: `classe_lubrificante` (ISO VG / NLGI), `ponto_aplicacao`

Índices recomendados:
- (`equipamento_id`)
- (`categoria_item`)
- (`codigo_interno`)

---

### Tabela: `pcm_equipamento_criticidade`
Finalidade: classificação de criticidade por equipamento com justificativa.

Campos sugeridos:
- `id` (PK)
- `equipamento_id` (FK UNIQUE -> `equipamentos.id`)  
  (um registro de criticidade vigente por equipamento)
- `criticidade` (TEXT)  
  Valores: `ALTA`, `MEDIA`, `BAIXA`
- `impacto_producao` (TEXT) — descrição do critério
- `impacto_seguranca` (TEXT)
- `impacto_custo_parada` (TEXT)
- `nota_producao` (INTEGER, opcional 1-5)
- `nota_seguranca` (INTEGER, opcional 1-5)
- `nota_custo` (INTEGER, opcional 1-5)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Índices recomendados:
- (`criticidade`)
- (`equipamento_id`)

---

### Tabela: `pcm_lubrificacao_planos`
Finalidade: plano de lubrificação por equipamento e por ponto.

Campos sugeridos:
- `id` (PK)
- `equipamento_id` (FK -> `equipamentos.id`)
- `ponto_lubrificacao` (TEXT) — ex.: `Mancal A`, `Redutor principal`
- `lubrificante_item_id` (FK opcional -> `pcm_bom_itens.id`)  
  (quando o lubrificante estiver cadastrado na lista técnica)
- `tipo_lubrificante_texto` (TEXT) — fallback livre (ISO VG 220, NLGI 2)
- `frequencia_dias` (INTEGER, opcional)
- `frequencia_horas` (INTEGER, opcional)
- `quantidade` (REAL)
- `unidade` (TEXT) — ex.: `g`, `L`, `ml`
- `proxima_data_prevista` (TEXT)
- `ultima_execucao_em` (TEXT)
- `ativo` (INTEGER 0/1)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Índices recomendados:
- (`equipamento_id`)
- (`proxima_data_prevista`)
- (`ativo`)

Integração com Plano Mestre (Etapa 1):
- cada registro de lubrificação pode gerar/atualizar um item em `pcm_planos` com:
  - `tipo_manutencao = 'LUBRIFICACAO'`
  - atividade = `Lubrificação: <ponto_lubrificacao>`

---

## 2.2 Banco de Falhas e Análises

### Tabela: `pcm_falhas`
Finalidade: registro estruturado da falha associada a uma OS.

Campos sugeridos:
- `id` (PK)
- `os_id` (FK UNIQUE -> `os.id`)  
  (uma classificação principal de falha por OS)
- `equipamento_id` (FK -> `equipamentos.id`)  
  (redundância útil para consulta analítica)
- `tipo_falha` (TEXT)  
  Valores: `MECANICA`, `ELETRICA`, `LUBRIFICACAO`, `OPERACIONAL`, `INSTRUMENTACAO`, `OUTRA`
- `modo_falha` (TEXT) — descrição curta do evento
- `causa_raiz` (TEXT)
- `tempo_parada_horas` (REAL)
- `falha_confirmada` (INTEGER 0/1, default 1)
- `created_by` (FK -> `users.id`)
- `created_at`, `updated_at`

Índices recomendados:
- (`equipamento_id`, `tipo_falha`)
- (`created_at`)
- (`tipo_falha`)

---

### Tabela: `pcm_falha_pecas`
Finalidade: peças/componentes substituídos em cada falha.

Campos sugeridos:
- `id` (PK)
- `falha_id` (FK -> `pcm_falhas.id`)
- `bom_item_id` (FK opcional -> `pcm_bom_itens.id`)
- `estoque_item_id` (FK opcional -> `estoque_itens.id`)
- `descricao_peca` (TEXT) — fallback livre
- `quantidade` (REAL)
- `unidade` (TEXT)
- `custo_unitario` (REAL, opcional)
- `custo_total` (REAL, opcional)
- `created_at`

Índices recomendados:
- (`falha_id`)
- (`bom_item_id`)
- (`estoque_item_id`)

Integração com estoque/almox:
- quando houver vínculo com `estoque_item_id`, pode-se comparar consumo técnico vs consumo real.

---

## 2.3 Ajustes úteis em tabelas existentes (opcional, sem quebrar legado)

### `os`
Adicionar campos (se ainda não houver):
- `is_emergencia` (INTEGER 0/1)
- `downtime_horas` (REAL) — opcional para facilitar disponibilidade
- `custo_mao_obra` (REAL)
- `custo_pecas` (REAL)

Obs.: se não quiser alterar agora, calcular custo por `custo_total` já existente e tempo por (`closed_at - opened_at`).

---

## 3) Estrutura de telas do PCM (Etapa 2)

## 3.1 Navegação no módulo PCM
Dentro de `/pcm`, criar abas/submenus:
1. **Dashboard PCM** (já existe na Etapa 1, ampliar)
2. **Engenharia da Manutenção**
   - Lista Técnica (BOM)
   - Criticidade
   - Plano de Lubrificação
3. **Banco de Falhas**
4. **Indicadores Avançados e Relatórios**

---

## 3.2 Tela: Engenharia da Manutenção

### Aba A — Lista Técnica (BOM)
Seções:
- Filtros: equipamento, categoria item, código interno
- Tabela de itens BOM:
  - Equipamento
  - Categoria
  - Código interno
  - Modelo
  - Fabricante
  - Aplicação
  - Ações (editar/inativar)
- Formulário “Novo item técnico”

### Aba B — Criticidade
Seções:
- Lista de equipamentos com criticidade atual (ALTA/MEDIA/BAIXA)
- Formulário por equipamento:
  - criticidade
  - impacto produção
  - impacto segurança
  - impacto custo da parada
- Botão “Salvar criticidade”

### Aba C — Plano de Lubrificação
Seções:
- Filtros: equipamento, ponto, status (no prazo/atrasado)
- Tabela:
  - equipamento
  - ponto de lubrificação
  - lubrificante
  - frequência (dias/horas)
  - quantidade
  - próxima data
  - situação
  - ações (gerar atividade / registrar execução)
- Ação “Gerar no Plano Mestre” (integra Etapa 1)

---

## 3.3 Tela: Banco de Falhas
Seções:
- Filtros: período, equipamento, tipo de falha
- Tabela principal de falhas:
  - OS
  - equipamento
  - tipo de falha
  - causa raiz
  - tempo de parada (h)
  - data
- Detalhe da falha (drawer/modal):
  - peças substituídas (lista)
  - custos
  - observações
- Formulário para classificar OS como falha (para OS corretivas)

Cards rápidos:
- Top equipamentos com falha
- Top peças substituídas
- Falhas por tipo (barra/pizza)

---

## 3.4 Tela: Indicadores Avançados e Relatórios
Seções:
- Filtros globais: período, setor, equipamento, criticidade
- Cards por equipamento e geral:
  - MTBF
  - MTTR
  - Disponibilidade
  - Custo de manutenção
- Rankings:
  - Top 10 equipamentos mais problemáticos
  - Top 10 componentes mais trocados
- Gráficos:
  - Falhas por tipo
  - Evolução mensal de custo e falhas

Relatórios exportáveis (Etapa 2 simples):
- CSV/XLSX para tabela filtrada
- PDF básico por período

---

## 4) Cálculos dos indicadores (fórmulas e origem dos dados)

## 4.1 % Preventiva x Corretiva
Período: mês atual (ou filtro selecionado)

- `qtd_preventiva = COUNT(os WHERE tipo='PREVENTIVA')`
- `qtd_corretiva = COUNT(os WHERE tipo='CORRETIVA')`
- `total = qtd_preventiva + qtd_corretiva`
- `%preventiva = (qtd_preventiva / total) * 100`
- `%corretiva = (qtd_corretiva / total) * 100`

Fonte: tabela `os`.

---

## 4.2 OS atrasadas
Regra simples (Etapa 2):
- OS aberta/em andamento/pausada por mais de X dias (ex.: 7)

Ou regra mais precisa (se houver prazo):
- `status != CONCLUIDA` e `data_prevista_conclusao < hoje`

Fonte: `os.status`, `os.opened_at` (ou campo de prazo, se existir).

---

## 4.3 MTBF por equipamento
Definição simples:
- considerar somente OS corretivas classificadas como falha (`pcm_falhas`)
- ordenar por data de ocorrência para cada equipamento
- calcular os intervalos entre falhas consecutivas
- `MTBF = média(intervalos)`

Fórmula:
- Se falhas em `t1, t2, t3...tn`
- Intervalos = `(t2-t1), (t3-t2), ..., (tn-t(n-1))`
- `MTBF = soma(intervalos)/qtd_intervalos`

Fonte: `os` + `pcm_falhas` (ou somente `os tipo='CORRETIVA'` como fallback).

---

## 4.4 MTTR por equipamento
Definição:
- média do tempo de reparo das OS corretivas concluídas

Fórmula:
- `tempo_reparo = closed_at - opened_at` (em horas)
- `MTTR = média(tempo_reparo)`

Fonte: `os.opened_at`, `os.closed_at`, `os.tipo`.

---

## 4.5 Disponibilidade
- `Disponibilidade = MTBF / (MTBF + MTTR)`

Retornar em percentual:
- `Disponibilidade% = Disponibilidade * 100`

Fonte: resultados de MTBF e MTTR do mesmo equipamento/período.

---

## 4.6 Custo de manutenção por equipamento
Opção A (atual, simples):
- `SUM(os.custo_total)` por equipamento no período

Opção B (detalhada, quando disponível):
- `SUM(custo_mao_obra + custo_pecas)`
- custos de peças também podem vir de `pcm_falha_pecas.custo_total`

Fonte: `os` (e opcionalmente `pcm_falha_pecas`).

---

## 4.7 Top 10 equipamentos problemáticos
Critérios possíveis (escolher um por visão):
- por **quantidade de falhas**
- por **custo total de manutenção**
- por **tempo de parada total**

Fonte: `pcm_falhas` + `os` + `equipamentos`.

---

## 4.8 Top 10 componentes mais trocados
- agrupar `pcm_falha_pecas` por `bom_item_id` (ou `descricao_peca`)
- ordenar por `SUM(quantidade)` ou por `COUNT(registros)`

Fonte: `pcm_falha_pecas` + `pcm_bom_itens`.

---

## 5) Integração com Etapa 1 (Plano Mestre + Dashboard)

1. **Plano de Lubrificação -> Plano Mestre**
   - ao cadastrar item de lubrificação, opcionalmente gerar/atualizar item em `pcm_planos`.

2. **Execução de atividade**
   - continuar usando fluxo da Etapa 1:
     - gerar OS preventiva a partir de plano
     - registrar execução no retorno da OS concluída
   - gravar trilha em `pcm_execucoes`.

3. **Dashboard PCM ampliado**
   - incorporar filtros por criticidade, setor e tipo de falha.
   - manter cards da Etapa 1 e acrescentar cartões de disponibilidade/custos por equipamento.

4. **Banco de Falhas alimentando indicadores**
   - `pcm_falhas` e `pcm_falha_pecas` tornam-se a base principal para MTBF, rankings e análises de causa.

---

## 6) Endpoints sugeridos (genéricos)

## 6.1 Engenharia da Manutenção
- `GET /pcm/engenharia/bom`
- `POST /pcm/engenharia/bom`
- `PUT /pcm/engenharia/bom/:id`
- `GET /pcm/engenharia/criticidade`
- `POST /pcm/engenharia/criticidade`
- `GET /pcm/engenharia/lubrificacao`
- `POST /pcm/engenharia/lubrificacao`
- `POST /pcm/engenharia/lubrificacao/:id/gerar-plano`

## 6.2 Banco de Falhas
- `GET /pcm/falhas`
- `POST /pcm/falhas` (classificar OS como falha)
- `POST /pcm/falhas/:id/pecas`
- `GET /pcm/falhas/rankings`

## 6.3 Indicadores
- `GET /pcm/indicadores/geral`
- `GET /pcm/indicadores/equipamento/:equipamentoId`
- `GET /pcm/relatorios/top-equipamentos`
- `GET /pcm/relatorios/top-componentes`
- `GET /pcm/relatorios/falhas-por-tipo`

---

## 7) Regras de negócio mínimas (Etapa 2)
- Apenas `ADMIN` acessa PCM (mantido).
- OS corretiva só entra no banco de falhas se houver classificação de tipo de falha.
- Não permitir duplicar classificação principal de falha na mesma OS (`os_id` único em `pcm_falhas`).
- Em Plano de Lubrificação, exigir ao menos um dos campos de frequência (`dias` ou `horas`).
- Em Plano Mestre, situação calculada automaticamente por data prevista.

---

## 8) Sugestões simples ainda dentro da Etapa 2 (sem avançar demais)
- Semáforo visual por criticidade e situação (verde/amarelo/vermelho).
- Campo “ação corretiva recomendada” no banco de falhas.
- Exportação CSV dos rankings e da lista do Plano Mestre.
- Alertas de vencimento de lubrificação para próximos 7 dias.

