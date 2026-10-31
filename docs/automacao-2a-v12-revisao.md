# Automação 2A — revisão do simulador V12

Base inspecionada: `main` em `1c85c494b012d48f4406777323425d90d4f8c09c`, após o PR #722. O Railway informava esse commit como `SUCCESS` antes desta revisão.

## Integração CAD ↔ ESP32

- O ciclo integrado existente percorre carga, cozimento, descarga e transferência. Os estados publicados incluem as duas guilhotinas, motor virtual e dois purgadores alternados. O intervalo dos purgadores pode ser ajustado de 1 a 300 segundos **virtuais** no topo do CAD; a velocidade da simulação também afeta esse tempo.
- `purgadores_simulados` permanece fechado no canal legado. A V12 utiliza os estados visuais exclusivamente para relés de LEDs, condicionados à autorização local. Não conectar solenóides, cilindros, vapor ou máquinas a esta bancada.
- Uma parada pendente é enviada depois do POST em andamento. Trocar a seleção também envia `PARADO` aos digestores anteriores, inclusive se iniciar imediatamente outro digestor. Um erro ao obter o snapshot interrompe a sincronização; comandos sem renovação expiram no ESP32 em até 6,5 s.
- Os botões individuais de carregar/cozinhar ficam bloqueados durante o ciclo integrado, inclusive pausado, para não reiniciar a etapa térmica enquanto o circuito mecânico aguarda temperatura.
- Pacotes com as duas guilhotinas abertas ou ambos os purgadores visuais abertos são rejeitados. A API mantém autenticação, RBAC e CSRF existentes. Não há migration ou nova autorização remota de atuadores.

## Interface e firmware

Conexão, seleção e modos ficam acima dos cartões. O gráfico temperatura × tempo foi retirado. A tela de prensas deixa de mostrar a imagem de referência e usa um esquema conceitual da tolva com quatro tampas, dois eixos paralelos e apoios, baseado na cena 3D existente. Não é um desenho executivo nem contém medidas de fabricação.

A IHM ESP32 conserva os dois blocos de purgadores e somente um bloco compacto de guilhotinas. Selecionar **Simulação CAD** localmente e habilitar GPIO27 autoriza o espelhamento. Falha, perda de comunicação e desarme retiram as saídas; o firmware não restaura uma autorização após reiniciar. Testes individuais são temporários e isolam os demais LEDs. Consulte a pinagem, restrição de PSRAM e procedimento em [automacao-esp32-v12-bancada-reles.md](automacao-esp32-v12-bancada-reles.md).

## Evidência de software

- `tests/automacao-cad-v12-snapshot.test.js` executa os scripts reais do navegador em VM com relógio/rede controlados: ciclo completo, pausa/retomada, mudança de digestor com POST pendente, reinício rápido, falha do snapshot e bloqueio dos botões individuais.
- `tests/automacao-ciclo-cad-esp32-integracao-v11.test.js` verifica sequência mecânica, intertravamentos do protocolo e intervalo configurável.
- Os testes do firmware extraem o núcleo de estados do próprio `.ino` para execução C++; a Action ESP32 compila o sketch único com core 3.3.12 e ArduinoJson 7.4.3.
- EJS e esquemas foram renderizados para revisão visual. As imagens disponíveis incluíam uma captura histórica da IHM V11; não havia as demais imagens CAD do relato no projeto sincronizado.

O teste comportamental reproduz duas falhas na base: `busy` descartava o POST de parada e `snapshots()` fora do `try` podia manter a sincronização marcada como ativa após exceção. O ciclo completo e o campo `linked` do snapshot funcionavam na base; não foi confirmada uma falha do núcleo nesse contrato.

O mapa Graphify de 29/10/2026, execução `40944802898`, foi consultado como referência histórica: `built_at_commit=16c0e92e92d076d69d7d41108e0c8406020bab6c`, diferente da base desta revisão. Seu foco `modules/automacao/` contém 109 elementos e 223 relações incidentes. Os caminhos de `estado-simulacao`, `sinaleiro-bancada`, `dispositivos`, telemetria, rotas e RBAC foram conferidos no código atual; o grafo desatualizado não comprova a integração V12.

Compilação e testes automatizados não comprovam polaridade elétrica, compatibilidade da placa física, montagem dos relés ou resposta das lâmpadas. Nenhum teste de hardware foi realizado nesta revisão.
