# Manutenção Campo do Gado — V2

Sistema de manutenção industrial (Node.js + Express + EJS + SQLite) com operação web e base preparada para aplicativo Android com Capacitor.

## Visão de arquitetura (web + mobile)

- **Backend único no Railway** (sem duplicar backend).
- **Web app** continua funcionando em navegador desktop/mobile.
- **App Android** via Capacitor no modo remoto (`server.url`) apontando para o Railway.
- **Push híbrido**:
  - Web Push (VAPID) para navegador/PWA.
  - FCM para push nativo no app Android (estrutura preparada).
- **Base iOS-ready**: mesma estratégia, com pendência de APNs/Xcode para publicação.

## Diagnóstico e plano detalhado

Consulte o relatório técnico completo em:
- `docs/mobile-architecture-report.md`

## Estrutura mobile adicionada

### PWA
- `public/manifest.webmanifest`
- Ícones em `public/images/pwa/`
- Metadados e manifest link no `views/layout.ejs`

### Service Worker consolidado
- SW principal: `public/service-worker.js`
- Compatibilidade legada: `public/sw.js` (proxy para o principal)

### Push mobile nativo (preparação)
- Registro de token de dispositivo:
  - `POST /mobile/devices/register`
  - `POST /mobile/devices/revoke`
- Nova tabela de tokens mobile: migration `140_mobile_device_tokens.js`
- Integração opcional FCM em `modules/push/fcm.service.js`

### Bridge Capacitor no front
- `public/js/mobile-bridge.js`
  - captura token nativo;
  - envia token ao backend autenticado;
  - trata deep link ao tocar notificação.

## Como rodar localmente

```bash
npm install
npm run migrate
npm run seed
npm run dev
```

Aplicação local: `http://localhost:8080`.

## Como rodar no Railway

1. Configurar volume persistente (ex.: `/data`).
2. Variáveis recomendadas:

```bash
DATA_DIR=/data
UPLOAD_DIR=/data/uploads
PDF_DIR=/data/pdfs
IMAGE_DIR=/data/imagens
TEMP_DIR=/data/temp
SQLITE_DIR=/data/sqlite
DB_PATH=/data/sqlite/app.db
SESSION_SECRET=<segredo_forte>
```

3. Start command sugerido:

```bash
npm ci && npm run migrate && npm start
```

## Push web (VAPID)

1. Gerar chaves:

```bash
npm run generate:vapid
```

2. Configurar no ambiente:

```bash
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:suporte@empresa.com
```

## Push nativo Android (FCM)

### Variáveis de backend
Use **uma** das opções:

- `FCM_SERVICE_ACCOUNT_JSON` com JSON completo da service account, ou
- `FCM_SERVICE_ACCOUNT_BASE64` com JSON em base64.

### No app Android
- Adicionar `google-services.json` no projeto Android nativo (quando plataforma for gerada).
- Criar canais Android no app (ex.: `os_critica`, `preventivas`, `avisos`).

## Capacitor (Android)

### Dependências
Já referenciadas no `package.json`:
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
- `@capacitor/app`, `@capacitor/push-notifications`

### Configuração
- Arquivo: `capacitor.config.ts`
- Ajuste `CAPACITOR_SERVER_URL` para a URL do Railway.

### Fluxo de geração Android

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android
```

> Se o ambiente bloquear npm/SDK, execute estes passos em uma máquina com Android Studio e acesso ao npm registry.

## Build release e Google Play (AAB)

1. No Android Studio, gerar keystore (`Build > Generate Signed Bundle/APK`).
2. Selecionar **Android App Bundle (AAB)**.
3. Definir assinatura de release.
4. Validar `targetSdkVersion`/`compileSdkVersion` atuais.
5. Publicar no Play Console com:
   - política de privacidade;
   - screenshots;
   - classificação de conteúdo;
   - formulário de segurança de dados.

### Package name sugerido
- `br.com.campodogado.manutencao`

## Preparação para iOS (futuro)

Pendente para publicação em iPhone:
- macOS com Xcode;
- conta Apple Developer ativa;
- certificado/perfis de assinatura;
- configuração APNs (direta ou via Firebase);
- ícones/splash específicos iOS e revisão de permissões.

A arquitetura já está estruturada para reutilizar backend, rotas e lógica de eventos de notificação.

## Checklist final (estado atual)

### Concluído
- [x] Diagnóstico técnico e plano de migração por fases.
- [x] PWA padronizada (manifest + ícones + metadados).
- [x] Service worker consolidado e sem duplicidade funcional.
- [x] Estrutura para registro/revogação de tokens mobile.
- [x] Camada FCM opcional no backend.
- [x] Base Capacitor configurada para Android remoto.

### Depende de credenciais/ambiente externo
- [ ] Instalação das dependências npm em ambiente com acesso ao registry.
- [ ] Geração do projeto nativo Android (`npx cap add android`).
- [ ] Inclusão de credenciais Firebase reais.
- [ ] Build AAB assinado e publicação na Play Store.
- [ ] Pipeline iOS (Xcode/APNs/Apple Developer).

