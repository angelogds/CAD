# Almoxarifado — retrofit operacional e celular

Implementação autorizada pelo responsável em 02/11/2026: combinar as propostas A/B/C, manter verde, cinza, branco e letras pretas, simplificar recebimento/retirada e publicar via PR. O estoque terá sua próxima etapa de cadastro e refinamento sobre esta base.

## Operação entregue

- Quatro acessos principais: Painel, Solicitações, Estoque e Relatórios. Retirada, materiais separados e correias ficam nas operações do estoque.
- Painel com solicitações abertas, compras a receber, entregas pendentes e materiais de prateleira por setor. Métricas usam contagem de solicitações/linhas, sem somar unidades incompatíveis.
- Solicitações usam a mesma liberação de Compras, inclusive para Demandas. Na revisão posterior à PR #731, a fila passa a exigir ao menos um item COMPRADO com quantidade positiva: cotações sem compra ficam em Compras. Receber todos os itens comprados conclui a pendência de recebimento, mesmo com outros itens ainda em cotação. Uma nova compra em solicitação ainda ativa gera nova pendência; solicitações efetivamente FECHADAS ou ENTREGUES permanecem terminais.
- Lista e conferência lado a lado no computador; cartões e conferência em uma coluna no celular. Busca por solicitação, material, equipamento e fornecedor, setor, etapa e paginação.
- Recebimento por **quantidade recebida → OK**. Entrada e histórico são transacionais; token por item impede reenvio duplicado. Receber todo o comprado encerra a pendência física; retirada é uma etapa independente.
- Com equipamento persistido na solicitação: destino dedicado e reserva para ele. Sem equipamento: entrada livre na prateleira, no setor correto. Categoria/endereço continuam disponíveis na organização do estoque e não bloqueiam o OK.
- Novos materiais dedicados não reclassificam o cadastro de prateleira. Recebimentos parciais anteriores preservam o SKU que já possui a entrada histórica.
- Reposição considera apenas prateleira com política configurada; compras dedicadas e cadastro sem política não viram lista de faltas. Filtros reconhecem grafias legadas dos setores, com ou sem acento.

## Retirada pelo celular

1. Selecionar solicitação com materiais disponíveis.
2. Escanear o QR do funcionário, conferindo sua identificação.
3. Marcar vários materiais, ajustar as quantidades e pressionar **OK** uma vez.

A entrega inteira ocorre em uma transação. Falha em qualquer linha reverte todas as baixas. A seleção precisa pertencer à mesma solicitação; limites de reserva/saldo, identidade ativa e permissões são revalidados no servidor. O histórico relaciona cada movimento ao mesmo lote, funcionário, solicitação/equipamento e usuário que entregou.

O reenvio do mesmo token e conteúdo retorna o resultado anterior; conteúdo diferente é recusado. Nenhum token QR é gravado na tabela de operações. Depois de confirmar, a tela abre o histórico e limpa a pessoa para a próxima entrega. Identificação manual permanece como alternativa, com confirmação do nome completo uma única vez por lote.

O leitor tenta BarcodeDetector e usa jsQR 1.4.0 como alternativa local para navegadores sem suporte nativo. O build copia o leitor e sua licença para assets próprios, sem CDN durante a operação. A câmera só abre ao tocar no botão e é encerrada ao sair/ocultar a página. O botão OK permanece acessível acima da navegação inferior no celular.

## Correias: referência antiga e integração

Foi analisado o repositório [RECICLAGEM-ANGELO no commit 9cd44bd](https://github.com/angelogds/RECICLAGEM-ANGELO/tree/9cd44bde1a492268abe7b264f07a592dc91a984e), especialmente [cadastro, associação e consumo de correias](https://github.com/angelogds/RECICLAGEM-ANGELO/blob/9cd44bde1a492268abe7b264f07a592dc91a984e/server.js#L159).

| Referência antiga | Integração no CAD |
| --- | --- |
| Cadastro `correias`, modelo e medida | Catálogo oficial `estoque_itens`, categoria/subcategoria e referência do material |
| `correias_equipamentos`, quantidade por equipamento | Planos de correia vinculados a equipamento, SKU e quantidade por jogo |
| `consumo_correias` | Movimentos oficiais de estoque e pedidos de correias com equipamento, mecânico e preventiva |

A operação física fica acessível em **Estoque → Correias** no almoxarifado. O planejamento e a agenda continuam nas preventivas/PCM. O mecânico pode solicitar o material e confirmar depois da retirada, ou registrar uma troca efetivamente realizada na preventiva. Nesse segundo caminho, reserva, baixa e confirmação são atômicas, com acesso restrito ao responsável/gestor autorizado.

Se a correia já foi retirada, confirmar a troca não baixa de novo. Se já houve baixa histórica na execução, o fluxo recusa uma segunda baixa. Solicitar ou agendar uma inspeção não consome material; a próxima inspeção continua programada. Não foram importados saldos ou dados operacionais do banco antigo. Cadastro e conferência física de referências/quantidades pertencem à etapa seguinte do estoque.

## Banco e compatibilidade

Migration aditiva **240_almox_retirada_lote_destino.js**:

- `estoque_retirada_operacoes`: identificação/idempotência das entregas em lote.
- `estoque_movimentos.retirada_lote_token`: rastreabilidade do lote.
- `solicitacao_itens.destino_recebimento`: distingue novos recebimentos de prateleira.
- Evolução do trigger de reserva: novos recebimentos de prateleira não geram reserva. Reservas, movimentos e quantidades anteriores são preservados, inclusive em reaplicação da migration.

Rotas antigas de recebimento e retirada continuam disponíveis com o RBAC original. A nova retirada em lote usa `ACCESS.estoque_retirada`; a troca realizada na preventiva usa `ACCESS.preventivas_execute` e valida a atribuição no serviço. Sem reescrita de quantidades, transferência de saldo ou importação de banco legado.

## Validação

Testes de integração verificam destino, parcialidade legada, transação integral do lote, seleção parcial, QR/cadastro ativo, rejeição de mistura de solicitações, idempotência, setores, reposição, baixa única de correias e migration idempotente. Os testes de interface antigos foram atualizados para as quatro áreas e o fluxo quantidade + OK, incluindo renderização EJS e perfis de consulta.

O ensaio local no navegador usa banco e pessoas fictícios, servidor real e resoluções 390/1440 px: recebimento, retirada de dois materiais, histórico, reenvio e RBAC. A leitura QR alternativa também é testada com um cartão sintético. A câmera física do celular precisa de validação em campo. A contagem final da suíte e o commit publicado ficam registrados na PR.

Validação da PR #731: **1.721 testes aprovados**, sem falhas ou testes pulados. O navegador também verificou o acesso ao estoque dedicado por equipamento e a posição do OK acima da navegação inferior.

Divergências históricas de estoque/compras não são corrigidas por inferência. É necessária conferência documental e física antes de ajustar registros antigos.

## Revisão das telas, encerramento e PDF

Solicitação adicional do responsável em 02/11/2026, após a publicação da PR #731:

- Identidade verde, branca e cinza, com texto preto, em painel, solicitações/conferência, estoque, retiradas, separados, correias, inventário e cadastros. Apenas quatro acessos no topo; operações e cadastros em cards/detalhes. Links respeitam o perfil existente.
- As duas listas operacionais de estoque exibem somente saldo livre positivo. A retirada parcial mantém o restante disponível. Ao esgotar, o material deixa a lista disponível e continua no catálogo e em **Materiais retirados**, com filtros e paginação. O histórico usa movimentos reais, inclusive de materiais hoje inativos.
- QR de colaborador vinculado a um usuário grava os dois IDs reais. Quem entrega é o usuário da sessão, sem aceitar substituição enviada pelo formulário. Perfis inativos não identificam novas retiradas; registros antigos sem perfil continuam explicitamente não identificados.
- Corrigido retorno automático de ENTREGUE_SOLICITANTE para SEPARADA_PARA_RETIRADA e removidos encerrados das filas e dos compromissos ativos de reserva. O cálculo de Compras também preserva o estado terminal.
- Migration **241_almox_encerramento_definitivo.js** impede regressão de status terminal, novas linhas e recriação de reservas/quantidades em solicitação encerrada. A proteção de saldo usa os mesmos compromissos ativos da aplicação, incluindo correias. Não altera quantidades, movimentos nem reservas históricas; nenhuma conciliação por inferência.
- O service worker deixa de armazenar e servir HTML de almoxarifado/estoque e remove suas cópias antigas na ativação. Evita exibir pendências/saldos anteriores depois da confirmação.
- PDF gerencial utiliza `utils/pdf/institutional-report.js`, com a geometria do padrão de Solicitações de Material: marca, cabeçalho, faixas verdes, tabelas, continuação e rodapé numerado. Corrigida a deriva de `doc.x` para a coluna de valores que espremia os títulos no anexo. Inclui retirantes e entregadores identificados (até 100 registros recentes; o restante permanece no histórico paginado).

Validação desta revisão: **1.728 testes locais aprovados**. Além da suíte, ensaio de navegação em 390/1440 px abrangeu cadastros, locais, categorias, detalhe, movimentos, inventário e retirada avulsa, além do fluxo principal de recebimento/retirada em lote. PDF real de três páginas inspecionado visualmente e teste com 90 materiais/descrições longas confirma margens, continuação e última linha.

Acesso direto ao SQLite de produção não está disponível neste ambiente. O diagnóstico é sustentado pelo código, pela reprodução isolada e pelos logs da implantação; divergências antigas exigem conferência física/documental. Limites mínimos e novos cadastros de consumo seguem para a próxima etapa, conforme orientação do responsável.
