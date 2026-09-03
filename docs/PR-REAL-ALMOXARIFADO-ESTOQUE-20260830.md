# Implementação real — Almoxarifado e Estoque

## Regra principal

Esta PR existe para resolver a divergência observada entre a especificação anterior e as telas reais em produção. O Codex deve analisar o código atual da `main` e implementar alterações FUNCIONAIS e VISUAIS reais. Não é permitido concluir com apenas documentação.

## Evidência atual

A view atual de Estoque (`views/estoque/index.ejs`) ainda apresenta apenas cabeçalho simples, abas, três cards e tabela básica de itens.

A view atual de Almoxarifado (`views/almoxarifado/recebimentos.ejs`) já possui uma modernização parcial, mas sua fila depende dos status atuais e pode chegar a “Nenhum recebimento encontrado” quando a solicitação está em outra etapa do fluxo.

## Entrega obrigatória

### A. Almoxarifado

Transformar a tela de recebimentos em uma fila operacional por SOLICITAÇÃO.

Cada linha deve mostrar:
- solicitação;
- título;
- solicitante;
- setor;
- equipe/responsável pela retirada;
- OS;
- equipamento;
- fornecedor(es);
- previsão de entrega;
- itens solicitados;
- itens cotados;
- itens comprados;
- itens recebidos;
- itens pendentes;
- progresso;
- status;
- ação principal.

Ao abrir a solicitação, mostrar o mesmo registro usado por Compras, nunca criar um registro paralelo.

### B. Detalhe por item

Para cada `solicitacao_item`, mostrar claramente:

Solicitado | Cotado | Comprado | Recebido | Pendente | Fornecedor | Previsão | Status

Permitir múltiplas entregas para o mesmo item.

Exemplo: 20 comprados → 8 recebidos → 7 recebidos → 5 recebidos → 20/20.

### C. Estoque

Modernizar `views/estoque/index.ejs` para o mesmo padrão visual de Solicitações e Compras.

Adicionar:
- KPIs reais;
- busca/filtros;
- status de estoque;
- tabela operacional;
- origem da movimentação;
- histórico do item;
- links para solicitação/OS quando existirem;
- ações padronizadas.

Não remover Itens, Categorias, Locais, Movimentos e Registrar saída.

### D. Recebimento → Estoque

Ao confirmar um recebimento:

1. atualizar quantidade recebida do item;
2. atualizar status do item;
3. atualizar status geral da solicitação;
4. gerar uma única entrada `ENTRADA_COMPRA`;
5. atualizar saldo do item de estoque;
6. manter vínculo com solicitação, item, OS e equipamento;
7. registrar usuário/data/hora;
8. manter histórico.

Usar transação.

Nunca duplicar a entrada por reprocessamento do mesmo recebimento.

Bloquear quantidade acima do saldo pendente.

### E. OS e materiais pendentes

Criar visão operacional de materiais pendentes por OS.

Para uma OS que está aguardando material de compra, mostrar:
- OS;
- equipamento;
- solicitação;
- material;
- quantidade pendente;
- status da compra;
- previsão;
- situação do recebimento.

### F. Alerta no Painel Principal

Quando um material vinculado a uma OS chegar ao Almoxarifado e estiver disponível para retirada, gerar alerta operacional no Painel Principal.

O alerta deve conter:
- OS;
- equipamento;
- solicitação;
- material;
- quantidade disponível;
- responsável atual;
- equipe;
- ação para abrir a retirada.

Não concluir a OS automaticamente.

### G. Responsável pela retirada

Usar a lógica existente de escala/colaboradores para identificar quem está de serviço no dia.

Regra:
- responsável principal da OS, se estiver disponível;
- caso contrário, auxiliar/substituto definido pela escala;
- nunca inventar colaborador.

Permitir que o solicitante ou integrante autorizado da equipe faça a retirada.

### H. Retirada

Na retirada:
- validar saldo;
- baixar estoque;
- registrar `SAIDA_REQUISICAO_INTERNA`;
- vincular à solicitação;
- vincular à OS;
- vincular ao equipamento;
- registrar usuário e data/hora;
- registrar histórico do equipamento quando houver estrutura disponível.

Não apagar o histórico da entrada.

### I. Padronização visual

As views de Almoxarifado e Estoque precisam parecer parte do MESMO sistema das telas de Solicitações e Compras.

Usar o padrão já existente no projeto:
- cabeçalho;
- subtítulo;
- cards;
- filtros;
- badges;
- botões;
- tabelas;
- espaços;
- verde institucional;
- estados vazio/carregando/erro;
- mobile responsivo.

### J. Mobile

No celular:
- substituir tabelas largas por cards quando necessário;
- ações com tamanho adequado para toque;
- mostrar primeiro status/progresso/pendência;
- permitir abrir detalhe sem zoom horizontal;
- manter leitura do material e quantidade.

## Status

Preservar a máquina de estados existente do módulo Solicitações/Compras.

Garantir coerência de `REABERTA`.

Não criar status paralelos.

## Banco

Primeiro reutilizar estruturas existentes.

Somente criar migration nova se uma informação indispensável não existir.

Nunca alterar migration histórica.

Nunca apagar dados.

## Testes

Executar `npm test`.

Testar:
- cotação → Almoxarifado;
- compra → fila de recebimento;
- recebimento parcial;
- múltiplas entregas;
- recebimento total;
- excesso bloqueado;
- estoque atualizado;
- sem duplicidade;
- OS pendente de material;
- alerta no Painel;
- responsável conforme escala;
- retirada;
- baixa de estoque;
- histórico do equipamento;
- RBAC;
- mobile.

## Critério de aceite visual

A tarefa só pode ser considerada concluída se, após o merge, o usuário abrir `/estoque` e visualizar a NOVA interface implementada, e abrir `/almoxarifado/recebimentos` e visualizar a fila operacional real das solicitações elegíveis.

Se a tela permanecer visualmente igual às imagens atuais, a implementação falhou.

## Critério de aceite técnico

O diff da PR deve conter alterações reais em views e, conforme necessário, controllers, services, routes, migrations e testes.

Não aceitar uma PR com somente `docs/`.

## Regra de execução

ANALISAR O CÓDIGO DA MAIN → MAPEAR DEPENDÊNCIAS → IMPLEMENTAR LOCALMENTE → EXECUTAR TESTES → VALIDAR FLUXO COMPLETO → VALIDAR UI DESKTOP/MOBILE.
