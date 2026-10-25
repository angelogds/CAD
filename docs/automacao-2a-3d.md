# Módulo 2A Automação Industrial integrado ao CAD

O módulo `/automacao` passa a usar a identidade 2A em início, digestores, simulador, decanters, prensas e configuração. Marca: **2A Automação Industrial — Ângelo Gomes da Silva — Fundador**. Rotas, permissões, banco e integração ESP32 existente permanecem compatíveis.

## Área das decanters

Cena Three.js local, com câmera orbital, zoom, seleção por clique/toque, lista de equipamentos para teclado, ajuste de vista, tela cheia e pausa de movimento. O esquema SVG interativo continua disponível e pode ser baixado. Se WebGL não estiver disponível, o painel abre o esquema.

Circuito: entrada com FT-IN → tanque nominal de 15.000 L → bomba helicoidal → seleção FAST/GRATE → duas decanters em corte → tacho sob cada máquina → seleção de sucção/bomba de saída 1 ou 2 → FT-OUT → visão dos cinco tanques futuros. A rosca comum de borra fica sob as decanters. Arranjo sem escala e interligações sujeitos à conferência na fábrica.

O tanque mostra o mexedor central e suas hélices. **A serpentina foi retirada da representação a pedido do responsável.** Ao lado do desenho ficam temperatura PT100, total recebido no turno, faixa estimada de volume restante, estado do mexedor e estado informado/simulado do vapor. O aquecimento não é inferido como comprovado apenas pela temperatura.

As decanters mostram carcaça em corte, tambor e rosca interna. A diferença visual de giro é didática, sem representar RPM ou diferencial reais. A explicação se baseia no [princípio de separação da Alfa Laval](https://www.alfalaval.com/decanters/) e no [folheto NX, seção Working principle](https://www.alfalaval.com/globalassets/images/products/separation/centrifugal-separators/decanters/nx-decanters/_nx_decanter_centrifuges_product-leaflet_en.pdf); não identifica o modelo instalado nem seus parâmetros.

## Supervisão e demonstração

- A área inicia sem hardware/telemetria: números desconhecidos aparecem como “Sem sinal” ou “—”. Sem movimento, preenchimento de tanque ou fluxo apresentado como leitura real.
- **Explorar simulação** inicia uma sessão local isolada. Não há POST, escrita em controlador, sincronização ESP32 ou registro em banco nesta área.
- **Demonstrar circuito** reinicia os contadores da sessão e prepara um exemplo FAST/bomba 1. Faixa de 60–85 °C, temperatura inicial de 72 °C, vazões e capacidade de 1.000 L por tacho são valores didáticos, não parâmetros aprovados. O tanque nominal de 15.000 L foi informado pelo responsável.
- O tempo virtual pode avançar em 1×, 10× ou 60×. Pausar o movimento visual mantém a evolução da maquete; pausar a simulação congela a evolução. Sair da página descarta os dados. Em aba oculta, o relógio virtual não avança.
- Simule nível baixo, falha PT100, sensores incoerentes e tacho alto. Falhas retiram permissões e não religam automaticamente a alimentação quando desaparecem. Seleção de outro caminho exige reiniciar a bomba da maquete.
- “Parar simulação” desliga todos os acionamentos virtuais. “Voltar à supervisão” limpa os dados simulados e volta a mostrar desconhecido.

Os cinco pontos propostos são 10/25/50/75/90% de volume nominal, sujeitos a cubagem. Produzem seis faixas; uma combinação impossível não vira zero. FT-IN totaliza recebido. FT-OUT totaliza transferido; nenhum dos dois, sozinho, comprova produção final do turno. Consulte [instrumentação e permissivos propostos](automacao-2a-instrumentacao.md).

## Implementação e instalação

- `public/js/automacao-decanters-core.js`: estado e balanço de volume da maquete, sem DOM/rede.
- `public/js/automacao-decanters.js`: indicadores, seleção, controles isolados e exportação SVG.
- `public/js/automacao-decanters-scene.mjs`: geometria, identificação de peças, movimentos e fluxos.
- `public/js/automacao-decanters-3d.mjs`: renderer, câmera, clique por raycasting, acessibilidade, redução de movimento e fallback.
- `views/automacao/partials/brand.ejs`: única assinatura da empresa nas seis páginas.
- `scripts/build-automacao-three.cjs`: copia Three.js 0.172.0, OrbitControls e licença MIT da dependência existente. Executado no `postinstall`; os arquivos gerados não entram no Git. Para uma instalação antiga com `node_modules` pronto, execute `node scripts/build-automacao-three.cjs`.

Sem dependências novas, migrations, mudanças no firmware ou endpoints industriais. O restante do CAD mantém sua identidade. A cena não faz chamadas de IA: animação e atualização local não consomem tokens de modelos.

As técnicas de instalação modular e seleção seguem a documentação oficial [Installation](https://threejs.org/manual/pages/installation.html) e [Picking](https://threejs.org/manual/pages/picking.html). Modelos geométricos foram construídos no código, sem importação de imagens/modelos comerciais.

## Próxima integração física

Definir instrumentos, endereços, qualidade/idade de sinal, protocolo e leitura autorizada antes de associar a maquete a dados da fábrica. Definir início/fim do turno em America/Sao_Paulo e persistência auditável dos totalizadores. Nunca converter um contador reiniciado ou uma lacuna de comunicação em produção zero. O roteiro completo está no estudo de instrumentação.

O projeto separado “criar dashboard animado” não foi encontrado no workspace e repositórios acessíveis. Não há acesso a outros projetos separados do Codex/ChatGPT nesta sessão. Fotos e o prompt desse projeto podem orientar as proporções e o posicionamento numa revisão posterior.
