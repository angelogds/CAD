# CAD 2D: cotas no PDF e sequência de evolução

Data: 11/09/2026. Base analisada: `angelogds/CAD`, commit `b078a004108bef15eb2a83ece0702e6b27af41c3`.

## Resultado da verificação

O PDF fornecido, “acoplamento do digestor”, contém o contorno da peça e registra **10 objetos e zero cotas**. Não há medidas suficientes nesse documento para recuperar com segurança as dimensões de fabricação. As medidas usadas nos testes são sintéticas, não são especificações dessa peça.

O editor ativo é o MLightCAD, carregado por `public/js/cad-engine-v2.js`. A interface antiga e seus testes não representam sozinhos o fluxo atualmente utilizado.

Foram encontradas três causas concretas:

1. `mirrorDatabase`, em `frontend/mlightcad-core.entry.js`, não reconhecia entidades de dimensão. O DXF completo continuava no histórico, mas `serializeForSave` gravava `dimensions: []` no JSON consumido pelo PDF.
2. O link PDF de `public/js/cad-mlight-runtime.js` abria a rota de exportação diretamente. Uma cota recém-criada ainda não salva não fazia parte do arquivo exportado.
3. O PDF ajustava a geometria ao espaço disponível, mas o carimbo informava escala `1:1`. Essa indicação não correspondia à transformação aplicada.

Código de referência: [editor e persistência](https://github.com/angelogds/CAD/blob/b078a004108bef15eb2a83ece0702e6b27af41c3/frontend/mlightcad-core.entry.js), [botão PDF](https://github.com/angelogds/CAD/blob/b078a004108bef15eb2a83ece0702e6b27af41c3/public/js/cad-mlight-runtime.js), [geração do PDF](https://github.com/angelogds/CAD/blob/b078a004108bef15eb2a83ece0702e6b27af41c3/modules/desenho-tecnico/desenho-tecnico.pdf.service.js).

## Primeira PR: cotas na exportação

- Espelhar cotas nativas alinhadas, lineares rotacionadas, radiais, diametrais e angulares de três pontos no schema de dimensões existente.
- Preservar textos explícitos de fabricação, como PCD, quantidade de furos, ajustes e tolerâncias. Substituir o marcador `<>` pelo valor medido quando utilizado.
- Preservar separadamente a posição da linha de cota e a posição do texto. Uma cota horizontal entre pontos desnivelados mede a projeção horizontal, não a diagonal.
- Conservar o DXF completo, a identificação dos objetos e o histórico. Não alterar tabelas, rotas ou permissões.
- Salvar a versão atual antes de abrir o PDF. Serializar novamente se houver outro salvamento em andamento; impedir exportação em erro de rede, erro HTTP ou resposta sem confirmação de salvamento.
- Considerar visibilidade e impressão das camadas. Contar no carimbo apenas as cotas efetivamente selecionadas para impressão.
- Reservar espaço para textos, manter setas visíveis em cotas curtas e indicar “AJUSTADA À FOLHA”. Desenhos sem cotas recebem indicação explícita no PDF.

Para um desenho antigo com cotas guardadas somente no DXF interno: **reabrir o editor e usar “PDF com cotas”**. Se o desenho realmente não tiver cotas, executar **AUTO COTAR**, conferir as medidas e então exportar. A PR não acrescenta medidas inferidas a partir do PDF recebido.

O trecho do pedido referente a “fotos” é ambíguo em relação a “cotas”. Esta PR trata das medidas; inserção de fotografias permanece uma etapa separada.

## Validação e limites

Executados `node --test tests/desenho-tecnico-*.test.js` (**123 testes aprovados**) e `npm run build:cad-core`.

Os testes novos usam entidades reais de `@mlightcad/data-model` 1.13.1, fazem ida e volta pelo DXF, sanitização e serialização JSON, e leem os textos do PDF produzido. A suíte de eventos executa o runtime real com adaptadores de DOM/rede e verifica espera pelo salvamento, clique repetido, salvamentos concorrentes e recuperação de falhas. Esses testes de eventos não equivalem a uma sessão visual no navegador.

Foi gerada e inspecionada uma amostra de PDF com geometria e medidas sintéticas. O navegador disponível bloqueou o acesso ao servidor local (`ERR_BLOCKED_BY_CLIENT`); a navegação visual completa em computador/celular e o teste com o desenho real continuam pendentes.

No Railway, o serviço CAD do projeto MANUTENCA-CAD acompanha a branch `main`, utiliza volume em `/data` e apresentava implantação com status SUCCESS na consulta. Não houve alteração de produção nem deploy desta PR. O build existente em `postinstall` deve gerar os bundles no deploy; arquivos compilados de teste não integram esta alteração.

## Pesquisa: o que caracteriza um CAD 2D útil para a oficina

A documentação da Autodesk reúne cotas por camada, alinhadas, contínuas, por base, raios, diâmetros, ângulos, estilos e ajustes de espaçamento. Para o sistema, isso se traduz em cotas editáveis e consistentes, não apenas números desenhados sobre linhas. [Autodesk: dimensionamento](https://www.autodesk.com/learn/ondemand/curated/dimensioning-in-autocad).

A referência do LibreCAD enfatiza precisão, legibilidade e completude das cotas; seu marcador `<>` permite associar texto adicional à medida. Isso reforça a necessidade de distinguir texto fixo de valor calculado e revisar a cota quando a geometria muda. [LibreCAD: anotações](https://docs.librecad.org/en/latest/guides/annotate.html).

A impressão exige definir papel, escala, posição, espaçamento das cotas e carimbo. A visualização prévia em folha permite perceber cortes e sobreposições antes da impressão. Recomenda-se implementar esse fluxo após corrigir a perda das cotas. [LibreCAD: impressão](https://docs.librecad.org/en/latest/guides/completion.html). O controle de tamanho das anotações conforme a escala é tratado separadamente pela Autodesk. [Autodesk: escala das anotações](https://www.autodesk.com/learn/ondemand/curated/scaling-annotative-objects/2bVr4LS4X9XQcqa2QA7Uc5).

O MLightCAD fornece uma base de CAD em navegador. A capacidade anunciada pelo projeto de origem não garante que o adaptador do sistema exporte todas as entidades: é necessário verificar o percurso editor → DXF → JSON → PDF para cada tipo utilizado. A recomendação é manter a base já integrada e fechar lacunas com casos de teste. [MLightCAD: projeto oficial](https://github.com/mlightcad/cad-viewer).

## Comparação com o código atual

| Área | Estrutura já encontrada | Lacuna ou validação necessária |
| --- | --- | --- |
| Desenho e edição | Linha, polilinha, círculo, arco; comandos no MLightCAD e extensões próprias | Validar precisão, seleção, cancelamento e desfazer/refazer por comando |
| Modificadores | MIRROR, FILLET e CHAMFER em `mlightcad-advanced-modify.js` | FILLET/CHAMFER próprios são limitados a duas linhas; ampliar somente após testes |
| Precisão | OSNAP, ORTHO, polar e entrada numérica | Testar extremos, centros, interseções, coordenadas negativas e peças grandes/pequenas |
| Cotagem | AUTO COTAR V2/V3, peças paramétricas e cotas DXF | Esta PR corrige a persistência/exportação; associatividade e estilos completos continuam por validar |
| Fabricação | Folha técnica, centros, notas, roscas, chavetas, biblioteca e símbolos GD&T | Conferir saída real, Unicode, tolerâncias, revisões e legibilidade |
| PDF | Renderer próprio baseado no JSON | Completar entidades, transformação de coordenadas, formatação MText, escala física e papel A3/A4 |
| Fotos | Não foi localizado fluxo completo de inserir/salvar/exportar fotografias no editor ativo | Implementar imagem como referência posicionável com persistência e exportação |
| Histórico e equipamento | Desenho, arquivos, histórico e vínculo ao equipamento existentes | Validar recuperação de revisões e acesso pelos perfis existentes |

## Sequência proposta de PRs

| Etapa | Entrega | Critério de aceite |
| --- | --- | --- |
| 1 — atual | Cotas no PDF e salvamento antes de exportar | Medidas presentes e erro de salvamento impede abrir arquivo desatualizado |
| 2 | Impressão fiel: prévia, A3/A4, escala física, orientação e enquadramento | PDF coincide com desenho assimétrico; cotas e textos não cortados; escala testada fisicamente |
| 3 | Cotagem associativa e estilos | Alterar comprimento/diâmetro atualiza medidas associadas; preservar textos explícitos e tolerâncias; desfazer/refazer consistente |
| 4 | Precisão e comandos | Casos verificáveis para MOVE/COPY/ROTATE/MIRROR/OFFSET/TRIM/EXTEND/FILLET/CHAMFER; entrada numérica e cancelamento sem perda |
| 5 | Fotos de referência | Inserir PNG/JPEG, mover, dimensionar proporcionalmente, girar, ordenar e salvar; foto reaparece no PDF e após reabrir |
| 6 | Entidades e interoperabilidade | Matriz de DXF com texto, blocos, hachuras, elipses e polilinhas curvas; avisar claramente quando algo não for exportável |
| 7 | Oficina e acabamento da interface | Biblioteca de eixos/flanges/chapas, revisões e equipamento; atalhos visíveis, painéis compactos e uso em tablet/celular |

As operações de edição acima correspondem a funções documentadas em CAD 2D, como mover/copiar, girar, escalar, espelhar, aparar, prolongar, chanfrar e arredondar. A prioridade proposta é uma avaliação deste repositório, não uma exigência de outro produto. [LibreCAD: ferramentas](https://docs.librecad.org/en/latest/ref/tools.html).

Para fotos, não obter dimensões reais de uma imagem sem referência dimensional conhecida. Reutilizar o armazenamento e o vínculo ao desenho, limitar tamanho/tipo, impedir leitura de caminhos arbitrários no servidor e testar o comportamento de imagens ausentes. Uma fotografia ajuda a identificar a peça, mas não substitui a geometria cotada.

## Fechamento funcional

“100% funcional” deve significar um conjunto acordado de fluxos de oficina aprovado em testes, não equivalência integral ao AutoCAD. A matriz mínima deve incluir flange com furação/PCD, eixo escalonado, chapa com rasgos, desenho assimétrico com arco, conjunto com notas e imagem de referência. Para cada caso: criar → cotar → editar → desfazer/refazer → salvar → reabrir → exportar → conferir unidades, medidas, revisão e vínculo ao equipamento.
