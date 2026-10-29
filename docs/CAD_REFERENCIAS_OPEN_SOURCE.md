# CAD: organização do ambiente e referências abertas

Pesquisa e implementação em 29/10/2026, para melhorar a página inicial e o editor
de desenho técnico do Campo do Gado. A instalação AutoCAD 2027 fornecida em anexos
foi usada como referência funcional; seus módulos nativos não foram incorporados.

## Repositórios avaliados

| Projeto | Licença verificada | Aproveitamento |
| --- | --- | --- |
| [jsep](https://github.com/EricSmekens/jsep) | [MIT, versão 1.4.0](https://github.com/EricSmekens/jsep/blob/v1.4.0/LICENSE) | Adotado nesta entrega para analisar expressões da calculadora. Versão fixada em 1.4.0 para manter compatibilidade com Node ≥18; não é a versão mais recente. Sem dependências de runtime. |
| [MLightCAD](https://github.com/mlightcad/cad-viewer) | [MIT](https://github.com/mlightcad/cad-viewer/blob/main/LICENSE) | Pacotes já presentes no projeto. Preservados para as integrações existentes; o editor 2D estável continua ativo, com seus comandos e sua geometria. Não houve atualização automática nem troca de motor. |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) | [MIT](https://github.com/jscad/OpenJSCAD.org/blob/master/LICENSE) | Candidato futuro para operações CSG, extrusão e revolução em malhas. Não foi adicionado e não substitui o BREP/STEP do OpenCascade. |
| [Online3DViewer](https://github.com/kovacsv/Online3DViewer) | [MIT](https://github.com/kovacsv/Online3DViewer/blob/master/LICENSE.md) | Candidato futuro para importação/visualização multiformato. Não é editor paramétrico. Sua versão de Three.js precisa ser isolada antes de integrar. Não foi adicionado. |
| [LibreCAD](https://github.com/LibreCAD/LibreCAD) e [QCAD](https://github.com/qcad/qcad) | [GPLv2](https://github.com/LibreCAD/LibreCAD/blob/master/LICENSE) e [GPLv3 com exceções](https://github.com/qcad/qcad/blob/master/LICENSE.txt) | Referências de organização, seleção e atalhos. Aplicações C++/Qt; nenhum código desses projetos foi copiado para o editor web. |

As licenças e a compatibilidade de cada componente devem ser verificadas novamente
antes de uma integração futura. Disponibilidade no GitHub, por si só, não significa
que um pacote funcione diretamente no navegador ou cubra todos os recursos CAD.

## Nova organização

A página inicial reúne a ação Novo desenho, os desenhos atualizados recentemente,
pesquisa, filtros e uma listagem que pode alternar entre lista e cartões. Recentes,
contagens e vínculos usam os dados retornados pelo sistema. As ações respeitam as
permissões existentes, incluindo a navegação para arquivados.

O editor concentra os comandos nas abas Início, Desenhar, Modificar, Anotar e
Vista. O explorador de camadas fica à esquerda, as propriedades à direita e a
linha de comando permanece na base. As paletas podem ser recolhidas; em telas
pequenas começam fechadas para liberar o canvas. Os estilos foram consolidados
por responsabilidade, preservando os nomes de arquivos dos carregadores antigos.
O dimensionamento usa a grade CSS e acompanha a altura disponível da janela.

## Calculadora técnica

Abra **Início → Calculadora** ou execute `QC`, `CALC` ou `CALCULADORA` na linha de
comando. Exemplos:

- `(127 - 96) / 2` retorna `15.5`.
- `sqrt(25) + 2^3` retorna `13`.
- `sin(30)` usa graus e retorna aproximadamente `0.5`.
- `max(12,5;8)` aceita vírgula decimal; use `;` entre argumentos.
- `ans * 2` reutiliza o resultado anterior.

Selecionar um objeto antes de abrir a calculadora permite inserir suas medidas.
Comprimentos podem ser convertidos entre milímetros, centímetros, metros,
polegadas e pés. **Usar na entrada do desenho** preenche a entrada numérica ativa
para conferência e confirmação com Enter. Comprimentos convertidos retornam a
milímetros antes de preencher o desenho. Essa ação não cria nem altera geometria
sem confirmação da entrada. O histórico mantém os últimos dez cálculos da sessão.

O jsep produz uma árvore sintática. O avaliador próprio permite somente números,
operadores aritméticos, funções matemáticas e as constantes documentadas; não
executa código JavaScript. Há limites de tamanho, profundidade e resultado.
O arquivo distribuído e sua licença são preparados localmente no `postinstall`,
sem dependência de CDN. A licença também está em `licenses/jsep-MIT.txt`.

## Limites preservados

Esta entrega reorganiza o ambiente e adiciona a calculadora. Não amplia os
formatos DWG/F3D, o exportador STEP, as capacidades BREP nem as operações 3D
existentes. Nenhuma migration ou ampliação de permissões é necessária.
