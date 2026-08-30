# PR — Implementação real do fluxo Almoxarifado + Estoque + OS

## Motivo

A versão atual ainda apresenta o Estoque como uma tabela simples de itens e o Almoxarifado como uma fila reduzida por status. A nova implementação deve alterar código real de view, service, controller e rotas quando necessário — não apenas documentação.

## Estado confirmado

- `modules/almoxarifado/almoxarifado.routes.js` possui recebimentos, conferência, recebimento por item, finalizar, fechar e reabrir.
- `modules/almoxarifado/almoxarifado.service.js` já calcula comprado/recebido/pendente e registra `ENTRADA_COMPRA` no estoque.
- `views/almoxarifado/recebimentos.ejs` já possui uma modernização parcial, mas a visão ainda não representa toda a integração desejada.
- `views/estoque/index.ejs` continua simples, com somente cards e tabela básica.

## Implementação obrigatória

1. Evoluir as views existentes para o mesmo padrão visual moderno de Solicitações e Compras.
2. Criar uma fila operacional no Almoxarifado baseada na própria solicitação, sem duplicá-la.
3. Exibir por solicitação: número, título, solicitante, setor, equipe/retirada, OS, equipamento, fornecedor, previsão, itens solicitados, cotados, comprados, recebidos, pendentes e progresso.
4. No detalhe, exibir cada item individualmente com estados de cotação, compra e recebimento.
5. Permitir múltiplas entregas parciais do mesmo item até completar a quantidade comprada.
6. Quando recebido, atualizar estoque e registrar movimentação vinculada à solicitação/item/OS/equipamento/usuário.
7. No Estoque, mostrar claramente itens recebidos por compra, saldo, local, última entrada e origem quando dados existirem.
8. Criar uma visão de materiais pendentes por OS.
9. No Painel Principal, criar um bloco/alerta de `Materiais disponíveis para retirada`, apontando OS, equipamento, solicitante e mecânico/equipe responsável.
10. A retirada deve selecionar o responsável real conforme a escala do dia, com fallback para auxiliar/equipe quando o responsável principal estiver indisponível, reutilizando o módulo de escala existente.
11. A retirada deve baixar o saldo de estoque e gravar histórico auditável com item, quantidade, solicitação, OS, equipamento, usuário e data/hora.
12. Quando a solicitação estiver vinculada a equipamento, manter a rastreabilidade no histórico do equipamento.
13. Não concluir a OS automaticamente; apenas sinalizar que o material está disponível ou que foi retirado para continuidade.
14. Não criar nova solicitação quando o material for comprado ou recebido.
15. Não criar uma segunda movimentação para o mesmo recebimento.
16. Manter o fechamento normal somente em recebimento integral.
17. Corrigir `REABERTA` para aparecer e funcionar coerentemente no Almoxarifado.
18. Criar estados visuais distintos para: aguardando compra, comprado, parcial, recebido, pendente e disponível para retirada.
19. Desktop, tablet e mobile devem usar a mesma linguagem visual e navegação.

## Regras de escala e responsável

Ao gerar a disponibilidade para retirada, consultar a escala existente do dia e identificar o mecânico responsável pela OS. Se ele não estiver escalado/disponível, localizar o substituto/auxiliar previsto pela estrutura real da escala. Não inventar nomes nem regras novas quando já houver lógica existente.

## Dados inexistentes

Nunca preencher fornecedor, preço, cotação, responsável ou previsão com dados fictícios. Mostrar `Não informado` quando a origem real não possuir a informação.

## Banco

Antes de criar migration, mapear as tabelas e colunas reais. Preservar dados. Preferir reutilização de `solicitacoes`, `solicitacao_itens`, `compras_cotacoes`, `compras_recebimentos`, `estoque_itens`, `estoque_movimentos`, OS, equipamento e escala.

## Critérios de aceite

A página de Almoxarifado deve deixar de ser uma simples lista de status. Ao abrir uma solicitação, o usuário deve entender imediatamente o ciclo completo do material e o que precisa ser recebido.

A página de Estoque deve permitir rastrear entradas de compra e retiradas de manutenção.

Quando um material comprado chegar, a OS correspondente deve aparecer no painel como apta para retirada, com responsável definido pela escala vigente.

A implementação deve ser real e aparecer no diff da PR em views/services/controllers/routes/migrations/tests quando aplicáveis.
