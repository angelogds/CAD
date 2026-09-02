# Implementação real — Almoxarifado + Estoque + OS

## Regra principal

Esta tarefa NÃO pode ser concluída com somente documentação. O Codex deve analisar a `main` atual e alterar o código funcional real do sistema. O diff final precisa conter, conforme necessidade, `views/`, `modules/`, `public/`, `tests/` e migration nova apenas se indispensável.

## Objetivo

Concluir as evoluções que ainda não foram aplicadas no fluxo integrado:

**SOLICITAÇÃO → COTAÇÃO → COMPRA → ALMOXARIFADO → RECEBIMENTO → ESTOQUE → ALERTA DA OS → RETIRADA → HISTÓRICO DO EQUIPAMENTO**

Preservar o que já funciona, principalmente recebimentos parciais, `ENTRADA_COMPRA`, bloqueio de quantidade acima do pendente e retirada vinculada à OS.

## 1. Modernização completa da tela de Estoque

A `views/estoque/index.ejs` atual ainda é uma tabela simples. Modernizar no mesmo padrão visual de Solicitações e Compras.

Manter as abas existentes: Itens, Categorias, Locais, Movimentos e Registrar saída.

Adicionar visão operacional com:
- KPIs reais: itens ativos, abaixo do mínimo, saldo total, zerados, entradas recentes e saídas recentes quando houver dados confiáveis;
- busca por código/nome;
- filtros por categoria, local e situação;
- status visual: normal, baixo, zerado;
- tabela com código, material, categoria, local, saldo, mínimo, situação, última movimentação e ações;
- rastreabilidade da origem das entradas/saídas;
- link para histórico/movimentações do item;
- responsividade real: tabela desktop e cards mobile.

Não inventar custo, categoria, local ou movimentação.

## 2. Tabela completa do Almoxarifado

Transformar `views/almoxarifado/recebimentos.ejs` em uma fila operacional por solicitação no mesmo padrão visual de Solicitações/Compras.

Exibir por solicitação:
- número;
- título;
- solicitante;
- setor;
- OS;
- equipamento;
- fornecedor(es);
- previsão;
- quantidade de itens solicitados;
- itens cotados;
- itens comprados;
- itens recebidos;
- itens pendentes;
- progresso de recebimento;
- status;
- ações.

Não criar uma segunda solicitação.

## 3. Solicitado / cotado / comprado / recebido / pendente

Na mesma visão da solicitação e no detalhe por item, mostrar claramente:

**Solicitado | Cotado | Comprado | Recebido | Pendente**

Usar dados reais do schema. Se não houver dado de cotação por item, mostrar `Não informado` em vez de fabricar número.

Preservar entregas parciais e múltiplos recebimentos do mesmo item.

## 4. Fornecedor e previsão por item

Antes de implementar, mapear como `compras_cotacoes`, `solicitacao_itens` e `solicitacoes` guardam fornecedor e previsão.

Quando houver associação por item, mostrar por item.

Quando a informação existir somente no nível da solicitação, exibir como informação geral sem fingir granularidade por item.

## 5. Solicitações em cotação visíveis no Almoxarifado

O Almoxarifado deve poder acompanhar a mesma solicitação desde a etapa de cotação, sem permitir recebimento físico antes de a compra estar liberada.

A fila deve aceitar visualização de estados compatíveis com:
- EM_COTACAO;
- COMPRADA;
- EM_RECEBIMENTO;
- RECEBIDA_PARCIAL;
- RECEBIDA_TOTAL;
- FECHADA;
- REABERTA quando aplicável.

Em `EM_COTACAO`, a tela é somente acompanhamento: mostrar o que já foi cotado/comprado e o que falta. Não liberar botão de recebimento enquanto não houver item comprado.

## 6. Materiais aguardados por OS

Criar uma visão operacional, reutilizando as relações reais de `os_id`, `equipamento_id`, solicitação e itens.

Exibir:
- OS;
- equipamento;
- mecânico responsável;
- solicitação;
- material;
- quantidade solicitada/comprada/recebida/pendente;
- status da compra;
- previsão;
- situação de disponibilidade para retirada.

Não criar status globais paralelos se a situação puder ser derivada.

## 7. Alerta no Painel Principal

Quando material vinculado a uma OS for efetivamente recebido no Almoxarifado e houver saldo disponível para retirada, mostrar no Painel Principal um alerta operacional `Material disponível para retirada`.

O alerta deve conter:
- OS;
- equipamento;
- solicitação;
- material;
- quantidade disponível;
- local de estoque;
- mecânico/equipe responsável;
- ação para abrir a retirada.

O alerta não conclui a OS.

O alerta deve desaparecer quando a condição deixar de existir, por exemplo após retirada integral ou encerramento válido do vínculo.

## 8. Mecânico responsável conforme escala

Não codificar nomes.

Analisar o módulo real de escala e a estrutura de responsáveis da OS.

Resolver o responsável operacional assim:
1. mecânico principal da OS, se estiver escalado/disponível no dia/turno;
2. se não estiver, usar auxiliar/substituto real previsto pela escala/equipe;
3. se não houver substituto configurado, manter responsável principal e sinalizar ausência, sem inventar colaborador.

A regra deve ser editável pela estrutura existente de escala/equipe, não hardcoded.

## 9. Fallback para auxiliar/substituto

Reutilizar a relação real de equipe/escala. Não criar uma regra paralela ou lista fixa de pessoas.

Registrar quem é o responsável principal e quem é o responsável operacional naquele momento.

## 10. Retirada vinculada também à solicitação

Hoje a retirada já exige OS. Evoluir para preservar também o vínculo com a solicitação e, quando possível, com o item da solicitação.

Ao retirar material recebido por compra:
- validar saldo;
- registrar `SAIDA_REQUISICAO_INTERNA`;
- vincular `os_id`;
- vincular `equipamento_id`;
- vincular `solicitacao_id`;
- vincular `solicitacao_item_id` quando aplicável;
- registrar quantidade, usuário, data/hora e observação;
- não apagar a movimentação de entrada original.

Se o schema atual não possuir alguma coluna indispensável, criar migration nova e não destrutiva. Não editar migrations históricas.

## 11. Histórico de consumo no equipamento

Quando a retirada estiver vinculada a equipamento/OS, registrar o consumo de material no histórico oficial do equipamento, reutilizando a estrutura existente.

O histórico deve permitir rastrear:
- item;
- quantidade;
- solicitação;
- OS;
- data/hora;
- usuário/retirante.

Não criar tabela duplicada se já houver histórico reutilizável.

## 12. Padronização visual completa

Almoxarifado e Estoque devem parecer parte do mesmo sistema de Solicitações e Compras.

Usar o padrão existente no projeto:
- cabeçalho;
- subtítulo;
- cards/KPIs;
- filtros;
- badges;
- barras de progresso;
- botões neutros/verde-claro, com hover verde;
- tabelas limpas;
- estados vazios;
- responsividade.

Evitar azul saturado e layouts desalinhados.

No celular, trocar tabelas largas por cards quando necessário e priorizar status, pendência, progresso e ações de toque.

## Backend e dados

Antes de editar, investigar:
- `modules/almoxarifado`;
- `modules/estoque`;
- `modules/compras`;
- `modules/solicitacoes`;
- módulo/serviço do Painel Principal;
- módulo de OS;
- módulo de Equipamentos/histórico;
- módulo de Escala;
- schema/migrations de `solicitacoes`, `solicitacao_itens`, `compras_cotacoes`, `compras_recebimentos`, `estoque_itens`, `estoque_movimentos`.

Corrigir causa-raiz quando houver divergência entre status, saldos, listas ou disponibilidade. Não mascarar erro apenas na view.

Evitar N+1. Preferir consultas agregadas.

Operações que alteram recebimento + estoque + vínculos devem usar transação.

## Permissões

Preservar RBAC atual.

- Almoxarifado autorizado: conferir/receber.
- Estoque autorizado: retirar/baixar.
- Compras: cotação/compra; não liberar recebimento físico só porque pode visualizar.
- Perfis de consulta: sem botões de alteração.
- Exclusões continuam restritas ao ADMIN.

Não ampliar permissões sem necessidade.

## Testes obrigatórios

Cobrir pelo menos:
1. solicitação em cotação aparece para acompanhamento no Almoxarifado;
2. item não comprado não permite recebimento;
3. comprado aparece para receber;
4. solicitado/cotado/comprado/recebido/pendente apresenta dados coerentes;
5. fornecedor/previsão aparecem somente quando há fonte real;
6. recebimento parcial;
7. múltiplas entregas;
8. recebimento integral;
9. excesso bloqueado;
10. estoque atualizado uma única vez por recebimento;
11. item zerado/baixo na nova tela de Estoque;
12. busca/filtros do Estoque;
13. OS aguardando material;
14. material recebido gera disponibilidade para retirada;
15. alerta aparece no Painel Principal;
16. responsável principal escalado;
17. principal ausente e fallback para auxiliar/substituto real;
18. retirada vinculada à solicitação e OS;
19. baixa correta no estoque;
20. alerta some após condição encerrada;
21. histórico do equipamento recebe o consumo;
22. usuário sem permissão não opera;
23. desktop/tablet/celular.

Executar `npm test` e testes específicos existentes.

## Critério de aceite final

Não considerar concluído se a PR alterar apenas `.codex/`, `docs/` ou CSS.

O diff final deve mostrar mudanças funcionais reais nas views e na lógica necessária.

A tela `/estoque` precisa mudar visivelmente e operacionalmente.

A tela `/almoxarifado/recebimentos` precisa mostrar a solicitação completa e o ciclo do material.

O Painel Principal precisa mostrar o alerta de material disponível quando houver condição real.

A retirada precisa preservar vínculo com solicitação/OS/equipamento e alimentar o histórico do equipamento.

Ao finalizar, informar:
- causa-raiz encontrada;
- arquivos alterados;
- migrations criadas, se houver;
- testes executados e resultado;
- riscos/regressões verificados.
