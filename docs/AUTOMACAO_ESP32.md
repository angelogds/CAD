# Automação — Configuração de ESP32 (somente ADMIN)

## Painel administrativo
No CAD, abra Automação > Configuração, rota /automacao/configuracao.
O cartão Configuração somente aparece para ADMIN; o servidor protege
a página, a consulta e os POSTs com ADMIN, sessão e token CSRF.
A rota antiga /automacao/dispositivos redireciona para Configuração.

Escolha Digestor 1, 2, 3, 4 ou Todos e informe o ID da placa.
Sugestões: ESP32-DIGESTOR-01, -02, -03, -04 ou ESP32-GERAL-01.
Uma credencial está associada a UM ESP32 e tem autorização apenas no
escopo escolhido. O token geral permite telemetria dos quatro digestores
somente se o hardware realmente oferecer as quatro leituras.

A chave cgd_... é gerada pelo CAD e aparece uma única vez. Somente o
hash SHA-256 e os quatro caracteres finais ficam no banco. Não é possível
recuperar o token depois: gere um novo se necessário. Substituir/revogar
invalida a chave antiga. Não publique credenciais no repositório.

## API HTTPS iniciada pelo ESP32

Para simulação com temperatura gerada pelo computador, aquecimento visual
e estados das solenoides, consulte [Simulação CAD V9](automacao-simulacao-cad-v9.md).
Esse modo não exige PT100. A atuação física de teste dos purgadores exige
autorização na IHM local de cada canal; o CAD não arma saídas.

Base: https://manutencao.campodogado.app.br/api/automacao/device
Header: Authorization: Bearer <token>

- POST /ping: registra último contato e devolve modo SIMULACAO.
- POST /estado: aceita relatório SIMULACAO com fase INICIO, MEIO, FINAL
  ou PARADO e relatório REAL com leitura e decisão local do ESP32.
  Consulte o contrato em [Sinaleiros por temperatura](automacao-temperatura-real.md).
  Token de um único digestor infere digestor_id e recusa outro.
  Token TODOS exige digestor_id explícito 1, 2, 3 ou 4 em cada envio.
- GET /automacao/api/dispositivos: ADMIN consulta escopos, contatos e
  estado de cada digestor (online equivale a contato nos últimos 90 s).
- POST /automacao/api/dispositivos/:deviceId/token: ADMIN emite chave
  com body {escopo: '1'|'2'|'3'|'4'|'TODOS'} + sessão CSRF.
- POST /automacao/api/dispositivos/:deviceId/revogar: ADMIN revoga.

Fases de simulação atualizadas: INICIO = verde fixo, MEIO = amarelo
(ou vermelho fixo quando a temperatura simulada está entre 100 e 120 °C),
FINAL = vermelho piscando. A cor explícita distingue as quatro faixas.
A API recebe telemetria REAL ou SIMULACAO e sempre retorna
comando_habilitado false e comandos []. O poll específico de simulação
transporta estados virtuais para testes dos sinaleiros e dos purgadores
autorizados localmente. Não há armamento remoto, comando de comporta,
admissão de vapor ou descarga automática de material.

## Teste/produção
Migrations 229 e 230 são incrementais e não destrutivas.
O ESP32 deve validar TLS/HTTPS e iniciar conexões de saída; não abrir
portas no roteador. A página local do ESP32 com Wi-Fi e token requer
proteção antes de ser exposta fora da rede de testes.
Teste apenas relés de baixa tensão. Temperatura PT100 real e atuação
de campo dependem de projeto, calibração e validação de segurança.
