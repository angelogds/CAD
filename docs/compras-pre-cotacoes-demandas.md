# Pré-cotações de Demandas — classificação e validação

## Falha reproduzida

O cadastro de Demandas aceita um setor operacional livre, como `Caldeira`.
`createMaterialPlanning` copiava esse texto para `solicitacoes.setor_origem`,
mas o card consultava somente aliases corporativos de Reciclagem. Uma
solicitação criada pelo fluxo real, com materiais e `demanda_id` correto,
era excluída. O teste de integração reproduziu o contador zero antes da correção.

Essa reprodução local não estabelece que seja a causa na base ativa do Railway.
Os bancos versionados não contêm Demandas ou solicitações para validar registros reais.

## Comportamento

- Novas solicitações preservam a origem corporativa explícita da Demanda.
  Quando ela contém um local operacional, utilizam o setor conhecido do perfil
  responsável. O texto original da Demanda permanece intacto.
- Registros antigos podem ser classificados pelos vínculos existentes de
  equipamento e autor com perfil específico de Reciclagem. Não há backfill,
  atualização de registros antigos ou criação de relações por título.
- Uma origem explícita de Logística, Frigorífico ou Administrativo exclui o
  registro do card, mesmo que outro vínculo aponte para Reciclagem.
- Solicitações sem materiais ativos, canceladas/finalizadas ou ligadas a
  Demandas canceladas/concluídas não entram no card.
- O diagnóstico e o card aplicam o mesmo filtro de setor. Somente itens
  `COTADO` contam como cotados; itens cancelados não aumentam o andamento.
- A consulta da Demanda reconhece as mesmas relações diretas e via OS usadas
  por Compras. Abrir uma OS não libera a compra.
- Criar solicitação, itens, finalizar elaboração e registrar planejamento
  acontece na mesma transação.
- Rascunhos, propostas e anexos continuam disponíveis. Aprovação financeira,
  compra e atendimento por estoque aguardam a liberação expressa da Demanda.
- O card mostra cinco registros, permite expandir/recolher, identifica a OS
  vinculada e mantém o número total retornado pelo servidor.

Nenhuma migration é necessária. Demandas sem vínculo comprovável continuam
fora da consulta; esta correção não associa OS ou solicitações por suposição.

## Validação automatizada

`tests/compras-demandas-criacao-integracao.test.js` executa as migrations em
SQLite temporário e chama os serviços reais para cadastrar a Demanda e seus
materiais. Confere propostas, preços unitários, fornecedores, anexos, bloqueios,
relações por OS, transferência à fila crítica e ausência de duplicação. Também
consulta a API HTTP real de pré-cotações para cinco/todos/diagnóstico e RBAC.

`tests/compras-pre-cotacoes-navegacao.test.js` executa o script do card em DOM
controlado e aciona os botões de expansão e recolhimento.

Executar os testes de Compras/Demandas, `npm test`, regressões do Assistente
Industrial e `python -m unittest discover -s tests -v` no serviço CAD Python.

## Validação em produção — somente leitura

1. Confirmar SHA da implantação e estado final `SUCCESS` no Railway.
2. Em Compras → Reciclagem, consultar
   `/compras/demandas/pre-cotacoes.json?diagnostico=1` com sessão autorizada.
3. Comparar as contagens do diagnóstico com os IDs de solicitações reais,
   Demandas, OS, materiais ativos e `liberacao_compras_status` armazenados.
4. Conferir a lista inicial, total, expansão e detalhes de uma solicitação
   real pendente. Conferir que ela não está na fila operacional.
5. Observar uma liberação legítima do fluxo operacional e verificar que a
   mesma solicitação passa à criticidade esperada com propostas/anexos intactos.
   Não liberar nem criar registros de produção apenas para executar um teste.

PR, CI remoto, merge, deployment e atualização do Notion dependem de acesso
efetivo às ferramentas dessas aplicações. O relatório local não comprova essas etapas.
