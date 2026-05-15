# Integração WhatsApp para Ordens de Serviço

A integração envia ou prepara uma mensagem de WhatsApp para o responsável de uma OS quando ela é criada, atribuída manualmente, reatribuída automaticamente ou reenviada pela tela da OS.

## Configuração

No `.env`, configure:

```env
WHATSAPP_PROVIDER=disabled # disabled | manual | cloud_api
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_API_VERSION=v20.0
WHATSAPP_DEFAULT_COUNTRY_CODE=55
PUBLIC_BASE_URL=https://seu-dominio-publico.example.com
```

- `disabled`: registra o evento como ignorado e não envia mensagens.
- `manual`: gera link `wa.me` com a mensagem pronta. O botão da OS abre uma nova aba para envio manual.
- `cloud_api`: usa a API oficial da Meta em `https://graph.facebook.com/{version}/{phone_number_id}/messages`.

Não há automação de WhatsApp Web, QR Code, scraping ou bibliotecas não oficiais.

## Cadastro do telefone

O usuário deve ter `telefone_whatsapp` com somente números, no formato DDI + DDD + número. Exemplo: `5575999999999`.

O campo pode ficar vazio; nesse caso, a OS continua funcionando e o histórico registra `SEM_TELEFONE` quando houver tentativa de envio.

## Eventos notificados

- `CRIACAO_OS`: OS criada e já alocada a um responsável.
- `ATRIBUICAO`: equipe alterada manualmente.
- `REATRIBUICAO_AUTO`: reprocessamento automático da equipe.
- `REENVIO_MANUAL`: botão **Enviar WhatsApp ao responsável** na tela da OS.

Para eventos automáticos, o serviço evita duplicidade quando já existe log `ENVIADO` para a mesma OS, usuário e evento. Reenvio manual sempre registra nova tentativa.

## Mídias de abertura

O serviço busca a primeira mídia de abertura da OS. Com `cloud_api`, imagens com URL pública são enviadas como `image.link` e a mensagem vira legenda. Sem URL pública (`PUBLIC_BASE_URL`/`APP_URL`), o serviço envia apenas texto e registra observação. No modo manual, se houver URL pública, ela é anexada ao texto do link `wa.me`.

## Histórico

A tela da OS mostra o card **Notificação WhatsApp** com responsável, telefone, provider, último envio e tabela de histórico:

- `ENVIADO`
- `ERRO`
- `IGNORADO`
- `MANUAL_LINK_GERADO`
- `SEM_TELEFONE`
- `SEM_PROVIDER`

Erros são sanitizados para não expor token de API.
