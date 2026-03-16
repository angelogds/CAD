# ERP de Manutenção Industrial V3 — Arquitetura Proposta

Este documento consolida a evolução do V2 para um ERP de Manutenção Industrial completo, mantendo os princípios de **simplicidade, velocidade operacional e foco no chão de fábrica**.

## 1) Arquitetura completa do ERP de manutenção

### Domínios funcionais (módulos)

1. **Painel Operacional**
   - visão em tempo real de OS abertas, preventivas do dia, equipamentos parados, solicitações/compras/recebimentos.
   - indicadores-chave: MTBF, MTTR, tempo médio de compra, criticidade de estoque.

2. **Equipamentos**
   - cadastro técnico completo.
   - componentes, histórico técnico, custo acumulado, vínculo com OS/preventivas.

3. **Ordens de Serviço (OS)**
   - tipos: corretiva, preventiva e melhoria.
   - ciclo completo: abertura → execução → fechamento técnico/financeiro.
   - consumo de materiais com baixa automática no estoque.

4. **Plano de Preventivas**
   - periodicidade por horas/dias/semanas/meses.
   - gatilho automático de geração de OS preventiva.

5. **Solicitações de Material**
   - fluxo operacional: ABERTA → EM_COTACAO → COMPRADA → EM_RECEBIMENTO → RECEBIDA_PARCIAL/TOTAL → FECHADA.
   - vínculo com OS/equipamento/preventiva.

6. **Compras e Cotações**
   - múltiplas cotações por solicitação.
   - registro de fornecedor escolhido e histórico de preços.
   - anexo de documentos de cotação.

7. **Fornecedores**
   - cadastro com CNPJ/contato/cidade.
   - lead time médio e qualidade média de entrega.

8. **Almoxarifado e Estoque**
   - recebimento item a item.
   - controle por saldo atual, mínimo e ideal.
   - movimentações: entrada, saída OS e ajuste inventário.

9. **Retirada de Material**
   - retirada vinculada a OS/equipamento/usuário.
   - rastreabilidade total por item.

10. **Histórico Técnico e Custos**
   - histórico por equipamento e por item.
   - análise de custo de manutenção e consumo técnico.

11. **Relatórios e Indicadores**
   - consumo/custo por equipamento e setor.
   - fornecedores mais utilizados.
   - equipamentos com maior incidência de falha.

12. **Usuários e Perfis (RBAC)**
   - perfis operacionais: ADMIN, SUPERVISOR MANUTENÇÃO, MECÂNICO, COMPRAS, ALMOXARIFADO, GESTÃO.

---

## 2) Estrutura de pastas recomendada

```txt
modules/
  dashboard/
  equipamentos/
  os/
  preventivas/
  solicitacoes/
  compras/
  fornecedores/      # novo (implementado)
  almoxarifado/
  estoque/
  indicadores/       # recomendado para cálculo de KPIs
  historico/         # recomendado para trilha técnica consolidada
  usuarios/

views/
  dashboard/
  equipamentos/
  os/
  preventivas/
  solicitacoes/
  compras/
  fornecedores/      # novo (implementado)
  almoxarifado/
  estoque/
  relatorios/

database/
  migrations/
  seeds/
```

---

## 3) Estrutura de banco de dados (núcleo V3)

### Novas tabelas adicionadas nesta entrega

- `fornecedores`
- `compras_cotacoes`
- `compras_historico_preco`
- `vw_indicadores_manutencao` (view)

### Evoluções em tabelas existentes

- `solicitacoes`
  - `fornecedor_id`
  - `tipo_origem`
- `solicitacao_itens`
  - `custo_estimado_unit`
  - `custo_real_unit`
- `estoque_itens`
  - `saldo_ideal`
  - `qr_code`
- `os`
  - `tipo_manutencao`
  - `custo_total_materiais`
  - `custo_total_servicos`
  - `custo_total`

---

## 4) Fluxo operacional completo (macro)

1. **Falha/rotina detectada** → abre OS (corretiva/preventiva/melhoria).
2. **Planejamento técnico** define necessidade de material.
3. **Solicitação de material** é criada e vinculada à OS/equipamento/preventiva.
4. **Compras** abre cotações múltiplas, escolhe fornecedor e fecha compra.
5. **Almoxarifado** recebe item a item, registra divergências e entrada no estoque.
6. **Mecânico executa OS** com retirada rastreada de materiais.
7. **Fechamento da OS** atualiza custo, histórico e indicadores.
8. **Painel e relatórios** consolida performance técnica e financeira.

---

## 5) Melhorias concretas sobre o sistema V2

- módulo de **Fornecedores** com CRUD operacional.
- base de dados preparada para **múltiplas cotações por solicitação**.
- trilha de **histórico de preço** por item e fornecedor.
- campos de **custos de manutenção** na OS para gestão financeira.
- campo de **QR Code** e **saldo ideal** para evolução do estoque.
- extensão do RBAC com permissão para `fornecedores`.

---

## 6) Roadmap de evolução V2 → V3

### Fase 1 (concluída nesta entrega)
- fundação de banco V3.
- módulo de fornecedores.
- documentação de arquitetura e fluxo alvo.

### Fase 2
- integração completa Compras ↔ Cotações ↔ Fornecedores.
- recebimento parcial/total com divergências por item.
- baixa automática de estoque em execução de OS.

### Fase 3
- motor de preventivas automáticas por periodicidade.
- indicadores MTBF/MTTR no dashboard com filtros por setor/equipamento.
- relatórios gerenciais exportáveis.

### Fase 4
- QR code operacional (recebimento e retirada por leitura).
- trilha técnica completa por equipamento e componente.
- ranking de fornecedores e gestão de SLA de entrega.

---

## Observação de estratégia

Como o sistema já está em produção operacional, a abordagem recomendada é evolutiva (incremental), evitando reescrita total, para preservar estabilidade e curva de aprendizado da equipe de manutenção, compras e almoxarifado.
