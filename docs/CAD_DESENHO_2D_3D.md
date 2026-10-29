# Desenho técnico: precisão 2D e visualização isométrica

Entrega incremental de 28/10/2026, baseada nos documentos anexados de evolução do
CAD Campo do Gado (#706) e no pedido de melhorar a elaboração dos desenhos 2D e
a visualização 3D. A implementação usa o editor 2D estável existente e Three.js.

## Uso no editor

- **F3** liga/desliga snap; **F8**, ORTHO; **F10**, rastreamento POLAR. ORTHO e
  POLAR são exclusivos. O incremento polar pode ser 15°, 30°, 45°, 60° ou 90° e
  fica salvo junto ao desenho. A captura depende da proximidade do cursor ao raio
  e da escala de zoom.
- Na linha de comandos, inicie `L` ou `PL`. Digite a primeira coordenada absoluta
  (`100,50`), depois coordenadas absolutas, relativas (`@50,0`), polares
  (`@25<90`) ou um comprimento na direção atual. Polar sem `@` parte da origem.
  Para vírgula decimal, use `;` entre coordenadas: `@12,5;8,25`.
- Na polilinha, `C` fecha o contorno; `U` remove o último vértice; Enter conclui o
  contorno aberto. A aresta de fechamento participa da seleção e do snap.
- Campos de formulários e propriedades conservam o foco durante o movimento do
  cursor. A digitação e o desfazer do campo não acionam as ferramentas do desenho.

## Volume 3D a partir das medidas atuais

**Visualizar 3D** abre a prévia do estado atual, incluindo alterações ainda não
salvas. Há vistas isométrica, frontal, superior e direita, projeções ortográfica e
perspectiva, giro, zoom, deslocamento, ajuste à tela e exibição de arestas.

- **Eixos paramétricos:** revolução dos comprimentos e diâmetros informados,
  incluindo alojamento axial cego ou passante quando válido. A prévia não acrescenta
  chanfros às medidas cadastradas.
- **Flanges:** informe a espessura opcional no formulário de criação ou selecione
  um círculo do flange e altere a espessura em **Propriedades → Volume 3D**. Os
  furos usam os contornos e as posições atuais do grupo. A espessura é atualizada
  em todos os membros do flange e acompanha salvar, desfazer e reabrir.
- **Perfis:** selecione um retângulo, círculo ou polilinha fechada simples e
  preencha a espessura em **Propriedades → Volume 3D**. Apagar a espessura mantém
  o desenho apenas em 2D. Espessura do material e espessura da linha são campos
  independentes.

A geometria de prévia fica em `public/js/cad-model-3d.logic.mjs`; a interface e a
geração da malha ficam em `public/js/cad-shaft-3d.mjs`. `openShaft3D` permanece como
alias de compatibilidade. O viewer não depende de CDN, não altera o documento e
libera controles, materiais, geometrias e renderer ao fechar.

## Limites desta entrega

Esta prévia não gera BREP nem amplia o exportador STEP existente, que continua
restrito às geometrias já suportadas pelo backend. Eixos com furos transversais ou
outras usinagens incompatíveis, contornos abertos ou que se cruzam, flanges com
furação inconsistente e perfis sem espessura mostram o motivo da indisponibilidade.
Linhas, cotas e textos continuam como elementos 2D. Não há conversão nativa F3D.

Os próximos incrementos do plano mestre continuam independentes: template de
prancha/PDF e identidade visual, QR de consulta, Bundle editável, provedores BREP
para flange/chapa, cortes associados ao sólido e integração Fusion legítima.
Esses recursos não são declarados concluídos por esta entrega.

## Validação

Testes de entrada, persistência, fechamento e snap das polilinhas, furos/volumes
das malhas e enquadramento das câmeras acompanham os arquivos em `tests/`.
A regressão geral usa `npm test`; o engine Python usa
`python -m unittest discover -s tests -v` em `services/cad-python`.
Nenhuma migration é necessária: medidas físicas usam metadados do documento.
