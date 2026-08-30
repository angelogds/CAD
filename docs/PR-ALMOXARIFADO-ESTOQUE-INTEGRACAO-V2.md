# PR V2 — Padronização e integração operacional de Almoxarifado + Estoque

## Objetivo

Evoluir os módulos de **Almoxarifado** e **Estoque** para o mesmo padrão visual e operacional já adotado nas telas modernas de Solicitações e Compras.

A solicitação deve ser a entidade única que acompanha o fluxo:

**MANUTENÇÃO → SOLICITAÇÃO → COMPRAS/COTAÇÃO → COMPRA → ALMOXARIFADO → RECEBIMENTO → ESTOQUE DO ALMOXARIFADO → RETIRADA → OS**

Não criar solicitações duplicadas nem fluxos paralelos.

## Situação observada no código atual

O `CAD` já possui `modules/almoxarifado` e `modules/estoque`. O Almoxarifado já possui fila, detalhe/conferência, recebimento parcial, histórico e integração com `estoque_movimentos`. A tela de recebimentos já possui KPIs, filtros e versões desktop/mobile.

Entretanto, a UX ainda não apresenta a mesma estrutura organizada de Solicitações/Compras e a integração operacional ainda precisa ser ampliada para acompanhar o destino do material após o recebimento.

## REQUISITOS FUNCIONAIS

### 1. Almoxarifado recebe a mesma solicitação de Compras

A partir do momento em que uma solicitação entra em cotação/compra conforme o fluxo existente, ela deve ficar disponível para acompanhamento no Almoxarifado.

Ao abrir a solicitação, mostrar claramente:

- número da solicitação;
- título;
- setor solicitante;
- solicitante;
- equipe responsável pelo uso/retirada, quando disponível;
- prioridade;
- OS vinculada;
- equipamento vinculado;
- fornecedor;
- status da compra;
- previsão de entrega;
- resumo de itens.

### 2. Tabela do Almoxarifado no mesmo padrão de Solicitações/Compras

Não manter a tabela atual simplificada.

Criar tabela operacional com:

- Solicitação;
- Solicitante;
- Setor;
- OS;
- Equipamento;
- Itens solicitados;
- Itens comprados;
- Itens recebidos;
- Itens pendentes;
- progresso %;
- previsão;
- situação;
- ações.

A tabela deve ser visualmente coerente com as telas modernas do sistema: cards, badges, barras de progresso, filtros, botões padrão e boa hierarquia visual.

### 3. Detalhamento por solicitação

Ao clicar na solicitação, exibir tabela por item:

| Item | Solicitado | Cotado | Comprado | Recebido | Pendente | Fornecedor | Previsão | Status |

Quando a informação não existir por item, mostrar `Não informado`.

Não fabricar dados.

### 4. Recebimento parcial real

Exemplo:

Material A: 20 UN compradas.

Entrega 1: 8 UN.

Entrega 2: 7 UN.

Entrega 3: 5 UN.

Resultado: 20/20.

O mesmo item pode ter vários recebimentos, mantendo histórico individual de cada entrada.

### 5. Estoque como estoque físico do Almoxarifado da Manutenção

O recebimento confirmado deve alimentar automaticamente o estoque.

A movimentação deve registrar, quando o schema permitir:

- tipo = `ENTRADA_COMPRA`;
- solicitação;
- item da solicitação;
- OS;
- equipamento;
- usuário que recebeu;
- data/hora;
- quantidade;
- saldo anterior;
- saldo posterior;
- observação.

Não gerar lançamento duplicado.

### 6. Associação automática ao equipamento

Quando a solicitação estiver vinculada a um equipamento, o item/material recebido e posteriormente retirado deve manter vínculo com o equipamento.

O sistema deve permitir consultar o histórico do equipamento e identificar que determinado material foi utilizado nele, quando a retirada possuir esse contexto.

Não criar vínculo duplicado se já existir mecanismo no sistema.

### 7. Associação com OS

Quando a solicitação estiver vinculada a uma OS ativa por falta de material, o fluxo deve manter esse vínculo até a retirada.

O estoque/retirada deve registrar a OS.

Quando o material chegar:

- a OS passa a ficar identificada como material disponível;
- criar alerta no Painel Principal;
- o alerta deve mostrar solicitação, OS, material, quantidade disponível, equipamento e responsável.

### 8. Nova tabela operacional: Materiais aguardados por OS

Criar uma visão/tabela dedicada no Painel e/ou Almoxarifado com as OS que aguardam material.

Colunas mínimas:

- OS;
- equipamento;
- mecânico responsável;
- material;
- quantidade pendente;
- quantidade recebida;
- solicitação;
- status da compra;
- data da solicitação;
- previsão de entrega;
- situação.

Situações sugeridas, reaproveitando status existentes quando possível:

- Aguardando compra;
- Em cotação;
- Comprado;
- Recebido no Almoxarifado;
- Disponível para retirada;
- Retirado.

Não criar status globais novos se um indicador derivado puder atender.

### 9. Alerta no Painel Principal

Quando a solicitação vinculada a uma OS tiver material efetivamente recebido no Almoxarifado e ainda não retirado:

mostrar alerta no Painel Principal.

Mensagem sugerida:

`Material disponível para retirada`

Exibir:

- OS;
- equipamento;
- material;
- quantidade;
- mecânico responsável;
- solicitante/equipe;
- localização do estoque.

O alerta deve desaparecer apenas quando o material for retirado ou a condição correspondente for encerrada.

### 10. Responsável pela retirada

A retirada pode ser realizada pelo solicitante ou por integrante autorizado da equipe do solicitante.

Como a equipe deve respeitar a escala:

1. localizar responsável principal da OS;
2. consultar a escala vigente;
3. verificar se o responsável está trabalhando naquele dia/turno;
4. se não estiver, selecionar o auxiliar/ajudante previsto pela escala/regra existente;
5. manter sempre o responsável principal registrado e identificar o efetivo retirante.

Não inventar regras de escala novas sem analisar primeiro o módulo `escala` existente.

### 11. Retirada de material

Criar fluxo organizado de retirada com:

- solicitação;
- OS;
- equipamento;
- material;
- quantidade;
- responsável pela retirada;
- usuário que entregou;
- data/hora;
- observação.

Validar saldo.

Nunca permitir saída maior que o estoque disponível.

A saída deve gerar `SAIDA_REQUISICAO_INTERNA` ou o tipo oficial já usado pelo sistema.

### 12. Histórico do equipamento

Quando houver equipamento vinculado:

registrar no histórico do equipamento o consumo/retirada do material, respeitando a arquitetura atual de histórico.

Não criar uma segunda tabela de histórico se já existir estrutura reutilizável.

### 13. Atualização da OS

Quando o material pendente for totalmente retirado para uma OS, marcar no contexto correspondente que o material está disponível/retirado e permitir ao mecânico continuar o serviço.

Não concluir a OS automaticamente.

A conclusão continua sendo responsabilidade do fluxo normal da OS.

## FRONT-END

Padronizar visualmente:

- Almoxarifado;
- Estoque;
- detalhe de recebimentos;
- conferência;
- retirada.

Usar o mesmo padrão moderno de Solicitações e Compras.

### Desktop

- tabela completa;
- filtros no topo;
- KPIs;
- ações claras;
- badges de status;
- barras de progresso.

### Celular

- cards por solicitação;
- resumo do progresso;
- quantidade pendente visível;
- botão grande `Conferir`;
- botão `Retirar`;
- botão `Ver OS`;
- alerta de material disponível.

Evitar tabelas horizontais difíceis de usar no celular.

## ESTOQUE

A tela atual de estoque deve ser visualmente modernizada sem alterar a lógica de saldo.

O cadastro/listagem deve apresentar:

- código;
- material;
- categoria;
- local;
- saldo;
- mínimo;
- situação;
- última movimentação.

Criar destaque para:

- estoque baixo;
- estoque zerado;
- entradas recentes;
- saídas recentes.

A origem dos saldos deve continuar sendo a estrutura oficial do estoque.

## BANCO DE DADOS

Antes de criar migrations:

- inspecionar schema atual;
- reutilizar tabelas existentes;
- preservar dados;
- não alterar migrations históricas;
- criar somente migrations novas e compatíveis.

Estruturas prioritárias para análise:

- `solicitacoes`;
- `solicitacao_itens`;
- `compras_cotacoes`;
- `compras_recebimentos`;
- `estoque_itens`;
- `estoque_movimentos`;
- tabelas de OS/histórico;
- tabelas de escala/equipe.

## RBAC

Respeitar as permissões existentes.

Somente perfis autorizados podem:

- iniciar recebimento;
- confirmar recebimento;
- retirar material;
- visualizar/alterar estoque.

Não ampliar acesso de usuários apenas porque eles aparecem como responsáveis pela OS.

## PERFORMANCE

Evitar N+1.

Preferir consultas agregadas para fila e painel.

Não executar uma query por item na tabela.

## TESTES OBRIGATÓRIOS

Testar pelo menos:

1. solicitação entra em cotação;
2. solicitação aparece no Almoxarifado;
3. compra aparece no detalhe;
4. material recebido parcialmente;
5. segunda entrega;
6. última entrega;
7. estoque atualizado;
8. tentativa de receber acima do pendente;
9. OS vinculada;
10. equipamento vinculado;
11. alerta gerado quando material chega;
12. alerta removido após retirada;
13. responsável principal presente na escala;
14. responsável principal ausente e substituição pelo auxiliar;
15. retirada atualiza estoque;
16. retirada gera vínculo com OS;
17. retirada gera histórico do equipamento;
18. estoque baixo/zerado;
19. usuário sem permissão;
20. desktop;
21. tablet;
22. celular.

Executar `npm test` e demais testes existentes.

## CRITÉRIOS DE ACEITE

A implementação será aceita somente quando:

- Almoxarifado e Estoque estiverem visualmente no mesmo padrão moderno de Solicitações/Compras;
- uma solicitação do setor de Compras puder ser acompanhada no Almoxarifado sem duplicação;
- a visão da solicitação mostrar cotado/comprado/recebido/pendente;
- recebimentos parciais funcionarem;
- diferentes prazos de entrega forem suportados;
- entrada no estoque ocorrer automaticamente;
- OS/equipamento permanecerem vinculados;
- existir uma visão clara de materiais aguardados por OS;
- o Painel Principal sinalizar material disponível;
- o responsável pela retirada respeitar a escala existente;
- a saída atualizar saldo, OS e histórico do equipamento;
- não existir duplicidade de movimentação;
- RBAC permanecer correto;
- desktop e celular funcionarem bem;
- testes passarem.

## REGRA FINAL

ANALISAR O CÓDIGO REAL → MAPEAR DEPENDÊNCIAS → REUTILIZAR ESTRUTURA EXISTENTE → IMPLEMENTAR LOCALMENTE → TESTAR FLUXO COMPLETO → VALIDAR UI.

Não considerar concluído apenas porque uma página abriu.

Não substituir uma integração por um mock.

Não usar dados fictícios.

Não reescrever os módulos inteiros quando uma alteração local for suficiente.
