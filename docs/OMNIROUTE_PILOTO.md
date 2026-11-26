# OmniRoute — piloto de texto do Assistente Industrial

O provider `omniroute` usa o contrato Responses em `POST /v1/responses`.
O CAD mantém o ciclo de ferramentas, a memória, as evidências, o RBAC e a
confirmação de ações. O gateway apenas encaminha as chamadas aos modelos.
O provider `local` continua reservado; não é um alias para o gateway.

## Ativação

Primeiro disponibilize uma instância OmniRoute e conecte nela um provedor
autorizado com suporte a Responses e function calling. Uma instalação nova
não garante modelos disponíveis nem créditos. Use um modelo/rota validado
para o piloto e limites de consumo no gateway, evitando roteamento aberto.

Configure **somente no servidor**, sem versionar valores reais:

```dotenv
AI_PROVIDER_PRIMARY=openai
AI_PROVIDER_TEXT_PRIMARY=omniroute
AI_PROVIDER_TEXT_FALLBACK=
OMNIROUTE_BASE_URL=https://seu-gateway.exemplo/v1
OMNIROUTE_API_KEY=<chave-do-gateway>
OMNIROUTE_MODEL=<modelo-ou-combo-validado>
```

A base deve incluir `/v1`, sem `/responses`, credenciais na URL ou query string.
Use HTTPS fora da rede privada. O CAD bloqueia redirecionamentos e não envia
a chave OpenAI ao gateway. O modelo do gateway vem de `OMNIROUTE_MODEL`.
`store: false` e `stream: false` são impostos nesta integração; retenção de
logs do gateway e dos provedores precisa ser configurada separadamente.

`AI_PROVIDER_TEXT_PRIMARY` afeta apenas o texto do Assistente Industrial.
A voz WebRTC e as outras funções OpenAI existentes continuam com a configuração
atual. Não selecione `omniroute` como `AI_PROVIDER_PRIMARY` neste piloto.

Fallback é opcional: `AI_PROVIDER_TEXT_FALLBACK=openai` habilita uma segunda
tentativa em falhas transitórias (429, 5xx, rede ou timeout), usando a chave e
o modelo OpenAI originais da chamada. Isso pode gerar consumo adicional.
Uma variável de fallback de texto presente e vazia desabilita essa tentativa;
ausente, herda `AI_PROVIDER_FALLBACK` por compatibilidade. Erros 400/401/403 ou
configuração incompleta não fazem fallback.

## Validação antes do uso operacional

1. Consulte `/ai/industrial/health` autenticado com perfil autorizado ao PCM.
   Confira `providers.text.primary`, o modelo e a configuração de voz.
   `configured: true` indica apenas presença/validade local das configurações,
   não uma conexão comprovada com o gateway.
2. Teste uma resposta simples, uma consulta de estoque/OS com fonte e uma consulta
   de memória permitida. Confira tokens e modelo retornados pelo gateway.
3. Verifique a continuidade de `function_call` e `function_call_output` com os
   mesmos `call_id`. Teste perfil sem permissão: a recusa deve vir do backend.
4. Em ambiente de testes, prepare uma ação e confira que nada é executado sem
   sua confirmação específica. Respostas parciais ou argumentos inválidos do
   gateway são rejeitados antes de executar ferramentas.
5. Simule 429, indisponibilidade, timeout e chave inválida; valide o comportamento
   com e sem fallback. Não habilite fallback para provedores sem autorização.
6. Confirme que a voz e as demais funções existentes continuam operacionais.

Teste automatizado: `node --test tests/industrial-assistant-omniroute.test.js`.
Depois rode a regressão do Assistente Industrial e `npm test`.
Os testes usam respostas simuladas e não comprovam conexão real com OmniRoute.

## Reversão

Defina `AI_PROVIDER_TEXT_PRIMARY=openai` e remova/desative o fallback específico
de texto. A reversão requer a chave OpenAI existente. Não há migration nem
alteração em dados operacionais. Nenhuma variável é ativada automaticamente
por este commit.

Contrato do gateway: https://omniroute.hagicode.com/en-US/reference/api-reference/
Código-fonte: https://github.com/diegosouzapw/OmniRoute
