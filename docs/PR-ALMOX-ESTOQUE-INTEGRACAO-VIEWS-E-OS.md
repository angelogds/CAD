# Especificação complementar — Almoxarifado, Estoque, OS e retirada de materiais

## Objetivo

A PR deve evoluir a implementação existente no `CAD`, e não apenas registrar documentação.

O resultado final precisa deixar os módulos **Almoxarifado** e **Estoque** visualmente alinhados ao padrão moderno já utilizado nas áreas de Solicitações e Compras, além de consolidar o fluxo operacional de materiais:

**Manutenção/solicitante → Solicitação → Compras/Cotação → Compra → Almoxarifado/Recebimento → Estoque da Manutenção → Retirada → OS concluída**

## Diagnóstico visual

As telas atuais de Estoque e Almoxarifado ainda apresentam identidade e densidade diferentes das telas mais modernas de Solicitações e Compras.

Na tela de Estoque atual há cabeçalho simples, abas e uma tabela de itens cadastrados com Código, Nome, Categoria, Local, Saldo e Mínimo. A estrutura funciona, porém deve receber o mesmo padrão visual, hierarquia, filtros, cards, ações e comportamento responsivo do restante do sistema.

A tela de Recebimentos já possui uma versão moderna com KPIs, chips, tabela desktop e cards mobile, mas ainda não representa todo o fluxo operacional desejado.

## Regras de negócio

### 1. Uma solicitação é única durante todo o fluxo

Nunca duplicar a solicitação ao passar de Compras para Almoxarifado.

O Almoxarifado deve localizar e abrir a mesma solicitação usada por Compras.

### 2. Compras pode liberar uma solicitação por etapas

A partir do momento em que os materiais da solicitação passam por cotação e compra, o Almoxarifado deve conseguir visualizar:

- o que foi solicitado;
- o que está em cotação;
- o que foi comprado;
- o que ainda não foi comprado;
- o que já foi recebido;
- o que ainda falta receber;
- fornecedor/previsão quando disponíveis.

Quando uma compra parcial ocorrer, apenas os itens efetivamente comprados devem ficar aptos ao recebimento.

### 3. Recebimento parcial

O sistema deve aceitar entregas em momentos diferentes.

Exemplo:

20 UN compradas.

Recebimento 1 = 8 UN.

Recebimento 2 = 7 UN.

Recebimento 3 = 5 UN.

Resultado = 20/20.

A cada recebimento, atualizar somente o saldo daquele item.

### 4. Estoque da manutenção

O material fisicamente recebido pelo Almoxarifado entra automaticamente no estoque associado ao item.

O movimento deve manter:

- item;
- quantidade;
- data/hora;
- usuário;
- solicitação;
- item da solicitação;
- OS, quando houver;
- equipamento, quando houver;
- saldo anterior;
- saldo posterior;
- origem.

Nunca criar lançamento manual duplicado para um recebimento já confirmado.

### 5. Solicitação vinculada a equipamento

Quando a solicitação possuir equipamento associado, preservar esse relacionamento durante todo o fluxo.

Ao movimentar o material no estoque, manter o vínculo com o equipamento.

Quando o material for retirado para a OS correspondente, a movimentação deve continuar rastreável ao equipamento.

### 6. Solicitação vinculada a OS

Quando a solicitação estiver vinculada a uma OS ativa por falta de material, esse relacionamento deve aparecer no Almoxarifado e no Estoque.

Ao receber o material:

- sinalizar que a OS possui material disponível;
- disponibilizar ação para identificar a OS;
- preservar o vínculo para retirada;
- não concluir automaticamente a OS apenas porque o material chegou.

A conclusão da OS continua dependendo da execução do serviço.

### 7. Retirada de material

A retirada deve ser associada a uma solicitação/OS quando existir contexto.

Mostrar ao almoxarife quem é o solicitante e, quando disponível, a equipe responsável.

O responsável pela OS ou equipe designada pode realizar a retirada, conforme as regras de permissão existentes.

Ao registrar a retirada:

- validar saldo suficiente;
- diminuir o saldo do estoque;
- registrar movimento `SAIDA_REQUISICAO_INTERNA`;
- manter OS/equipamento/solicitação no histórico;
- registrar usuário que realizou a retirada;
- permitir observação.

## Alocação do responsável pela retirada

Quando a solicitação estiver vinculada a uma OS, o sistema deve consultar a alocação atual da OS e, quando houver integração disponível, a escala do dia.

Regra:

1. responsável principal da OS presente no turno → apresentar como responsável pela retirada;
2. responsável principal ausente → verificar auxiliar/ajudante/equipe associado à OS;
3. somente se não houver pessoa elegível, apresentar retirada para o responsável operacional permitido pelo RBAC;
4. nunca alterar a escala apenas para permitir a retirada;
5. não inventar substituto quando não houver dado no sistema.

A lógica deve reutilizar a estrutura real de escala/alocação existente no CAD.

## Alerta no Painel Principal

Criar integração com o Painel Principal para materiais recebidos relacionados a OS pendentes de material.

Quando um recebimento completar ou disponibilizar parte do material de uma OS:

- gerar alerta operacional;
- apresentar número da OS;
- equipamento;
- material recebido;
- quantidade disponível;
- solicitante/responsável;
- indicar que existe material aguardando retirada.

Exemplo:

**OS 0245 — Moinho nº 1**

Material disponível no Almoxarifado:

Rolamento 6312 — 2 UN

**Responsável:** Mecânico alocado na OS

**Ação:** `Retirar material`

Não concluir a OS automaticamente.

O alerta deve desaparecer ou mudar de estado quando a retirada correspondente ocorrer, de acordo com a infraestrutura de alertas existente.

## Nova visão: materiais aguardando retirada por OS

Criar uma área/tabela integrada ao painel de Almoxarifado e/ou Painel Principal para listar materiais recebidos que ainda precisam ser retirados para execução de uma OS.

Colunas:

- OS
- Equipamento
- Solicitação
- Material
- Quantidade disponível
- Responsável
- Equipe
- Recebido em
- Status
- Ação

Ações:

- `Ver OS`
- `Ver solicitação`
- `Retirar material`

## Estoque — modernização de interface

Manter as abas/funções existentes, mas aplicar o padrão visual das telas modernas de Solicitações e Compras.

Criar/organizar:

### Cabeçalho

Título `Estoque`

Subtítulo operacional

Ações principais:

- Novo item
- Registrar entrada, somente quando houver permissão/contexto legítimo
- Registrar saída
- Movimentos

### KPIs

- Itens ativos
- Abaixo do mínimo
- Saldo total
- Materiais aguardando retirada

### Filtros

- Busca
- Categoria
- Local
- Situação de estoque
- OS/solicitação quando aplicável

### Tabela

Código | Material | Categoria | Local | Saldo | Mínimo | Situação | Última movimentação | Ações

A tabela deve ter status visuais e ser responsiva.

No mobile, preferir cards de item.

## Almoxarifado — modernização de interface

A página de Recebimentos deve usar o mesmo padrão dos demais módulos.

### KPIs

- Para receber
- Em recebimento
- Recebimento parcial
- Recebido total
- Atrasados
- Aguardando retirada

### Fila principal

Agrupar visualmente por solicitação.

Cada linha deve permitir entender rapidamente:

- número da solicitação;
- título;
- solicitante;
- OS/equipamento;
- quantidade de itens;
- comprados;
- recebidos;
- pendentes;
- progresso;
- previsão;
- fornecedor;
- status;
- ação.

### Detalhe

Ao abrir uma solicitação, usar uma estrutura semelhante à tela de Solicitações/Compras, com cabeçalho, resumo, timeline e tabela de itens.

## Tela de conferência

A tela de conferência deve priorizar o uso em celular.

Para cada item comprado:

**Material**

**Solicitado:** 20

**Comprado:** 20

**Recebido:** 8

**Pendente:** 12

Campo:

`Quantidade recebida agora`

Ação:

`Registrar recebimento`

Mostrar confirmação antes de concluir.

Após registrar:

- atualizar progresso;
- atualizar saldo do estoque;
- atualizar histórico;
- manter o usuário na conferência da solicitação.

## Status e ciclo

Não remover os status existentes.

A lógica deve reconhecer o ciclo:

ABERTA
→ EM_COTACAO
→ etapas de aprovação, quando existirem
→ COMPRADA
→ EM_RECEBIMENTO
→ RECEBIDA_PARCIAL
→ RECEBIDA_TOTAL
→ SEPARADA_PARA_RETIRADA
→ ENTREGUE_SOLICITANTE
→ FECHADA

`REABERTA` e `CANCELADA` devem continuar tratadas conforme as regras atuais.

Antes de adicionar qualquer transição, verificar `modules/compras/compras.service.js` e `modules/solicitacoes/solicitacoes.service.js`.

## Banco de dados

Antes de qualquer migration, mapear o schema real.

Preferir reutilização de:

- `solicitacoes`
- `solicitacao_itens`
- `compras_cotacoes`
- `compras_recebimentos`
- `estoque_itens`
- `estoque_movimentos`
- tabelas de OS/equipamentos
- tabelas de escala/alocação
- infraestrutura de alertas

Criar migration apenas quando não houver estrutura suficiente.

Nunca apagar dados.

Nunca alterar migration histórica aplicada em produção.

## Segurança / RBAC

Respeitar as permissões existentes para:

- ADMIN
- ALMOXARIFADO
- COMPRAS
- MANUTENÇÃO
- demais perfis existentes.

O almoxarife pode conferir/receber quando autorizado.

A retirada deve validar o usuário e o contexto permitidos.

A visualização pode ser mais ampla, mas ações de estoque/recebimento devem permanecer protegidas.

## Performance

Evitar consultas N+1 na listagem.

Usar agregações e joins apropriados.

Criar índices somente quando justificáveis pelo padrão de consulta.

## Testes

Obrigatórios:

1. solicitação criada pela Manutenção;
2. início da cotação;
3. compra integral;
4. compra parcial por item;
5. solicitação aparecendo no Almoxarifado;
6. recebimento parcial;
7. segunda entrega;
8. terceira entrega;
9. recebimento total;
10. entrada no estoque;
11. retirada do estoque;
12. vinculação à OS;
13. vinculação ao equipamento;
14. alerta de material disponível;
15. retirada pelo responsável elegível;
16. fallback para auxiliar/equipe quando permitido pelos dados reais;
17. tentativa de retirada acima do saldo;
18. tentativa de recebimento acima do pendente;
19. fechamento prematuro bloqueado;
20. RBAC;
21. desktop;
22. tablet;
23. celular.

## Critério de aceite visual

Comparar as telas com o padrão já adotado em Solicitações e Compras.

Não aceitar como concluído se Almoxarifado e Estoque continuarem com visual antigo/desconectado.

Devem compartilhar:

- cabeçalho;
- espaçamento;
- cards;
- botões;
- badges;
- tabelas;
- tipografia;
- filtros;
- responsividade;
- estados vazios.

## Critério de aceite funcional

O fluxo precisa funcionar ponta a ponta:

**Solicitação → Cotação → Compra → Almoxarifado → Recebimento → Estoque → Alerta da OS → Retirada → Execução da OS**.

Nenhuma etapa deve exigir cadastro manual duplicado para transportar a informação da etapa anterior.

## Regra final

Não reescrever a aplicação.

Não criar módulo paralelo.

Não duplicar solicitação.

Não inventar dados de escala, equipe, preço ou fornecedor.

Analisar o código real antes de alterar.

Implementar em pequenos commits.

Executar testes.

Validar o fluxo completo.