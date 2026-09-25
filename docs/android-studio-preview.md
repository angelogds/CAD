# Android Studio e menu de cartões

O aplicativo Android usa o repositório `angelogds/CAD`. O menu de cartões é ativado somente quando o Capacitor identifica uma instalação Android e a largura da tela é de até 980 px. Navegadores e PWA continuam usando o menu existente. Os links e permissões continuam vindo de `views/partials/sidebar.ejs` e `config/rbac.js`.

## Prévia sem dados reais

1. Instale as dependências com `npm install` (Node 20 ou superior para o CLI Capacitor 7).
2. Execute `node scripts/android-preview.cjs --open`.
3. No Android Studio, selecione um celular ou emulador e execute a variante `debug`.

A prévia é um estudo offline do menu. Ela usa as regras e o template reais do menu, com perfil ADMIN e contadores vazios. Selecionar um cartão mostra o módulo escolhido; não abre as telas de negócio nem acessa o banco da empresa. O conteúdo fica em `mobile/preview`, gerado e ignorado pelo Git.

O workflow `Android - APK de previa` também compila essa prévia no GitHub Actions e disponibiliza o artefato `CAD-previa-android` por sete dias. Ele não publica no Railway nem na Play Store. A instalação debug usa o identificador separado `br.com.campodogado.manutencao.debug` e o nome `CAD - Teste`.

## Versão conectada

Em outro terminal, sem `CAD_MOBILE_PREVIEW=1`, execute `npx cap sync android`. O endereço padrão é `https://manutencao.campodogado.app.br`, confirmado no serviço CAD do projeto Railway MANUTENCA-CAD. `CAPACITOR_SERVER_URL` permite outro endereço HTTPS.

O aplicativo conectado carrega o servidor. Para exibir o novo menu, os arquivos de menu e o layout precisam ser publicados no backend. Sincronizar ou compilar o APK não publica as mudanças web. A primeira prévia não altera Railway nem o banco de produção.

O modo remoto foi mantido da arquitetura existente do CAD. Ele depende de internet; o pacote inclui uma tela de reconexão. Não é uma versão offline das funções de manutenção.

## Notificações e distribuição

Somente o plugin App está habilitado por padrão. Push nativo requer configuração Firebase e `google-services.json`; depois disso, habilite `CAPACITOR_ENABLE_PUSH=1` antes de sincronizar. A ausência dessa configuração não impede testar o menu.

Um APK debug é para testes. A publicação exige assinatura de release e verificação do fluxo de login, anexos, navegação e notificações no dispositivo real. Não há assinatura de produção incluída.

## Arquivos principais

- `public/js/native-menu.js`: ativação nativa, ícones, fechamento, foco e botão Voltar.
- `public/css/native-menu.css`: cartões exclusivos do app em telas pequenas.
- `views/layout.ejs`: carregamento dos recursos.
- `capacitor.config.ts`: servidor HTTPS, prévia e seleção de plugins.
- `android/`: projeto nativo para Android Studio.
- `scripts/build-mobile-preview.cjs`: estudo visual offline, claramente identificado.

Referências: https://capacitorjs.com/docs/v7/android e https://capacitorjs.com/docs/v7/config.
