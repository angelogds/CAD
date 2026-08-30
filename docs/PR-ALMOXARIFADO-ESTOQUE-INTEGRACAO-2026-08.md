# PR — Integração funcional Compras → Almoxarifado → Estoque

## Objetivo

Evoluir os módulos de Almoxarifado e Estoque do repositório `angelogds/CAD` para que o fluxo de materiais seja contínuo, rastreável e operacional em computador e celular.

Fluxo desejado:

**SOLICITAÇÃO → COTAÇÃO → COMPRA → ALMOXARIFADO → RECEBIMENTO PARCIAL/TOTAL → ESTOQUE → FECHAMENTO**

A mesma solicitação deve acompanhar todo o processo. O Almoxarifado não cria uma nova solicitação.

## Análise do código atual

`modules/almoxarifado/almoxarifado.service.js` já possui `listRecebimentos`, `getSolicitacao`, histórico, início de recebimento, recebimento por item, finalização, fechamento e reabertura. O recebimento já grava `ENTRADA_COMPRA` em `estoque_movimentos`, atualiza saldo e registra histórico em `compras_recebimentos` quando a tabela existe.

A tela `views/almoxarifado/recebimentos.ejs` já possui KPIs, filtros, tabela desktop e cards mobile, porém a listagem ainda é resumida e a visão detalhada fica separada.

O `modules/estoque/estoque.service.js` já possui dashboard, itens, locais, movimentos e saída vinculada a OS. Não duplicar a lógica de saldo.

Foi identificado um ponto de coerência: `RECEBIMENTO_STATUS` não inclui `REABERTA`, embora `iniciarRecebimento()` aceite `REABERTA`. Corrigir esse fluxo sem alterar os status oficiais.

## Regras funcionais

Assim que a solicitação entrar no fluxo de compras/cotação conforme as regras existentes, ela deve ficar disponível para acompanhamento no Almoxarifado, usando a mesma solicitação.

Ao abrir uma solicitação, mostrar:

- número;
- título;
- setor;
- OS/equipamento;
- fornecedor(es), quando disponíveis;
- previsão de entrega;
- status geral;
- itens solicitados;
- itens cotados, quando houver dado real;
- itens comprados;
- itens recebidos;
- itens pendentes;
- percentual recebido.

### Visão por item

Para cada item, exibir:

- nome/descrição;
- unidade;
- quantidade solicitada;
- quantidade cotada, quando disponível;
- quantidade comprada;
- quantidade recebida;
- quantidade pendente;
- fornecedor;
- previsão de entrega;
- status;
- ação de conferência.

Se o banco não possuir a informação, exibir `Não informado`. Nunca inventar dados.

### Entregas parciais

Permitir múltiplos recebimentos da mesma solicitação e item.

Exemplo: 20 UN compradas → 8 recebidas → 7 recebidas → 5 recebidas → 20/20.

A solicitação permanece aberta enquanto existir saldo pendente.

### Estoque

Cada recebimento confirmado deve atualizar o item e gerar uma única `ENTRADA_COMPRA`, atualizar o saldo usando a estrutura existente e manter rastreabilidade por solicitação/item, usuário e data.

Não criar lançamento manual adicional para o mesmo recebimento.

### Status

Preservar os status existentes e manter o fluxo:

`ABERTA → EM_COTACAO → COMPRADA → EM_RECEBIMENTO → RECEBIDA_PARCIAL → RECEBIDA_TOTAL → FECHADA`

Tratar `REABERTA` de forma coerente com o fluxo atual.

Não permitir fechamento normal enquanto houver pendências.

## Tela principal do Almoxarifado

Modernizar `views/almoxarifado/recebimentos.ejs` no mesmo padrão visual de Solicitações e Compras.

Adicionar/organizar:

- KPIs de para receber, em recebimento, parciais, recebidas e atrasadas;
- busca;
- filtros por status e situação;
- tabela operacional;
- progresso de recebimento;
- fornecedor e previsão;
- OS/equipamento;
- quantidade comprada/recebida/pendente;
- ação `Conferir`.

No celular, usar cards responsivos com as mesmas informações essenciais.

## Conferência

Modernizar `views/almoxarifado/conferir.ejs` para que o usuário veja o contexto completo da solicitação e consiga conferir rapidamente cada entrega.

Manter histórico de recebimentos.

Destacar saldo pendente e impedir quantidade acima do saldo.

## Compras → Almoxarifado

Compras continua responsável por cotação, fornecedor, preço, compra e previsão.

Almoxarifado continua responsável por conferência física, recebimento parcial/total e observações.

Estoque continua responsável por saldo e histórico de movimentações.

Não duplicar responsabilidades nem criar nova solicitação.

## Banco

Antes de alterar schema, verificar migrations e tabelas reais.

Reutilizar `solicitacoes`, `solicitacao_itens`, `compras_cotacoes`, `estoque_itens`, `estoque_movimentos` e `compras_recebimentos` quando existentes.

Preservar dados e não editar migrations históricas.

Se uma alteração for indispensável, criar migration nova, compatível e não destrutiva.

## Permissões

Respeitar `config/rbac.js` e as permissões existentes. A visualização não deve conceder permissão de recebimento físico. Preservar o padrão atual de `ADMIN`/`ALMOXARIFADO`.

## Performance

Evitar N+1 queries na listagem. Preferir agregações e reutilizar serviços existentes. Não colocar SQL complexo no EJS.

## Testes

Testar obrigatoriamente:

1. solicitação em cotação disponível no Almoxarifado;
2. compra disponível para recebimento;
3. detalhe com cotado/comprado/recebido/pendente;
4. múltiplas entregas;
5. recebimento parcial;
6. recebimento total;
7. excesso de quantidade bloqueado;
8. entrada no estoque;
9. ausência de duplicidade de movimento;
10. rastreabilidade por solicitação/item;
11. `REABERTA`;
12. fechamento com pendência bloqueado;
13. fechamento após 100%;
14. RBAC;
15. desktop;
16. tablet;
17. celular.

Executar `npm test` e os testes específicos existentes.

## Critérios de aceite

A mesma solicitação deve acompanhar todo o fluxo. Ao clicar nela no Almoxarifado, o usuário deve entender claramente o que foi cotado, comprado, recebido e o que falta receber. Os materiais podem chegar em datas diferentes e devem ser conferidos incrementalmente. Cada recebimento confirmado atualiza o Estoque automaticamente. A solicitação só fecha no fluxo normal quando estiver integralmente recebida.

Não reescrever módulos inteiros, não criar telas paralelas, não inventar dados e não quebrar rotas, banco, permissões ou funcionalidades existentes.

**ANALISAR → MAPEAR DEPENDÊNCIAS → IMPLEMENTAR → TESTAR → VALIDAR FLUXO COMPLETO**.