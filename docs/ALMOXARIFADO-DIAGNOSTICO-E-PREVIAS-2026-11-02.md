# Almoxarifado — diagnóstico e propostas visuais, 02/11/2026

**Evolução posterior:** o responsável autorizou consolidar A/B/C e publicar o retrofit. Veja a [implementação do fluxo no celular](ALMOXARIFADO-RETROFIT-MOBILE-2026-11-02.md). Este documento preserva o diagnóstico e a situação das propostas antes dessa autorização.

## Regra solicitada pelo responsável

- Reunir painel, solicitações, estoque e relatórios, reduzindo ações repetidas.
- Almoxarifado acompanha as mesmas solicitações liberadas para Compras, com visão de abertas e fechadas.
- Dentro da solicitação, mostrar separadamente os itens comprados e os que ainda aguardam Compras.
- Receber por item: informar **quantidade recebida → OK**. Entrada física automática; recebimento parcial mantém somente o restante pendente.
- Material vinculado a equipamento fica separado para ele. Sem equipamento, segue para estoque de prateleira. Essa simplificação de destino ainda deve ser implementada junto da interface correspondente.
- Preservar estoque por setor: Reciclagem, Frigorífico, Logística e Administrativo. O catálogo já possui também materiais COMUM explicitamente compartilhados.
- Referência visual: organização do módulo 2A Industrial, adaptada para verde, branco e cinza, com textos pretos.
- Apresentar variações antes de aplicar o tema ou gerar PDF. **Escolha visual ainda pendente.**

## Evidência do diagnóstico

Reprodução em SQLite isolado, usando o schema do repositório. Não houve inspeção ou alteração do banco de produção.

### Recebimento que volta a ficar pendente

`compras.service.salvarPainelItens` processava novamente linhas COMPRADO ao salvar o formulário. Na ausência de `qtd_comprada` no payload, usava a necessidade calculada pelo saldo atual do estoque.

Exemplo reproduzido: solicitadas 10 UN, compradas 4 UN, recebidas 4 UN. Depois do consumo do estoque, salvar o painel alterava `qtd_comprada` de 4 para 10, mantendo recebidas 4. Surgiam 6 UN pendentes sem uma nova compra. Mesmo uma solicitação FECHADA podia aparecer com pendência na leitura por quantidades.

Correção: o salvamento comum preserva as linhas COMPRADO, CANCELADO e ATENDIDO_ESTOQUE. Correções de compra continuam no fluxo específico, que bloqueia itens já recebidos. O recálculo preserva separação/entrega quando todos os itens continuam atendidos; uma nova linha pendente pode voltar à cotação normalmente.

### Entrada no setor/local incorreto

`almoxarifado.service.resolveEstoqueItem` procurava material por nome, unidade e equipamento sem comparar setor ou local. Um recebimento do Frigorífico podia incrementar um material da Reciclagem com o mesmo nome.

Correção: a associação automática exige setor compatível e, quando informado e suportado pelo schema, o mesmo local físico. Vínculo explícito com outro setor/local gera erro transacional, sem alterar saldo ou histórico. Material COMUM explicitamente escolhido permanece compartilhado; o movimento registra o setor consumidor da solicitação. Grafias legadas dos setores usam os aliases já existentes.

Não há migration, backfill de quantidades, transferência de saldos ou reclassificação histórica. Divergências já existentes precisam de conferência com os comprovantes de compra e de recebimento; não se deve inferir a quantidade correta pelo saldo atual.

Validação local: 19 regressões novas em SQLite, testes dos módulos vizinhos e suíte completa `npm test` com 1.707 testes aprovados. O teste de localização exercita explicitamente a variante de schema com `local_id`; bases legadas sem essa coluna mantêm o comportamento compatível.

## Propostas para aprovação

Figma: [arquivo com seis telas editáveis, computador e celular](https://www.figma.com/design/AEX3NWYkcMyZHCoVK6lpx1).

- [A — Central operacional](https://www.figma.com/design/AEX3NWYkcMyZHCoVK6lpx1?node-id=6-355): tabela e conferência do item.
- [B — Painel por etapas](https://www.figma.com/design/AEX3NWYkcMyZHCoVK6lpx1?node-id=6-549): agrupamento visual das solicitações.
- [C — Mesa de conferência](https://www.figma.com/design/AEX3NWYkcMyZHCoVK6lpx1?node-id=6-729): lista e detalhe lado a lado; recomendação para reduzir navegação.

[Canva — estudo inicial de distribuição](https://canva.link/oyik8y9lm31f1s6). As telas do Figma incorporam a orientação posterior de quantidade + OK. Dados dos estudos são ilustrativos. Os protótipos não estão conectados a operações de produção.

O Figma atingiu a cota do plano Starter durante a exportação das prévias. Os frames estão criados e foram conferidos estruturalmente, mas não houve inspeção visual completa de todas as exportações. Não foi gerado PDF nem aplicado tema no sistema.

## Trabalho anterior encontrado

- [PR #714](https://github.com/angelogds/CAD/pull/714), draft: consumo de lubrificantes/PCM e estoque canônico. Exige validação física e contém proibição expressa de merge/deploy até validar. Não foi incorporada a este trabalho.
- [PR #581](https://github.com/angelogds/CAD/pull/581): organização setorial anterior, com conflito no momento da consulta. Não foi integrada automaticamente.

## Fontes consultadas

- [Requisitos validados em 09/10](ALMOXARIFADO-REQUISITOS-VALIDADOS-2026-10-09.md): catálogo único, recebimento independente de retirada, parcialidade e idempotência.
- [Fluxo documentado](fluxo-solicitacao-compras-almox.md).
- [Notion — Almoxarifado V4](https://app.notion.com/p/3f27ddca327c8172a824e3f46a1f0572): referência histórica de organização; decisões posteriores prevalecem.
- [Notion — Almoxarifado operacional V3](https://app.notion.com/p/3f27ddca327c815b8f1ecba73b30c6d3).
- [Notion — Pré-solicitação semanal por setor](https://app.notion.com/p/3e97ddca327c812bb8abff0a0f572956): liberação e classificação por setor.
- [Nielsen Norman Group — Data Tables](https://www.nngroup.com/articles/data-tables/): busca, comparação e ações consistentes.
- [Carbon — Data table guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines): hierarquia de ferramentas e ações da tabela.
- [Microsoft Business Central — Record purchases](https://learn.microsoft.com/en-us/dynamics365/business-central/purchasing-how-record-purchases): quantidades efetivamente recebidas e saldo da entrega parcial.

O artefato Graphify disponível foi construído no commit `16c0e92e92d076d69d7d41108e0c8406020bab6c`, anterior ao ponto de partida `77f6939e6dd4a6db360037966698fc121ad69b99`. Relações relevantes foram verificadas no código atual; o mapa não foi tratado como retrato exato de main.
