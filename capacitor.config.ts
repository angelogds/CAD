import type { CapacitorConfig } from '@capacitor/cli';

const preview = process.env.CAD_MOBILE_PREVIEW === '1';
const serverUrl = process.env.CAPACITOR_SERVER_URL || 'https://manutencao.campodogado.app.br';
if (!preview && new URL(serverUrl).protocol !== 'https:') {
  throw new Error('CAPACITOR_SERVER_URL deve usar HTTPS. Use CAD_MOBILE_PREVIEW=1 para a previa local.');
}

const config: CapacitorConfig = {
  appId: 'br.com.campodogado.manutencao',
  appName: 'Manutenção Campo do Gado',
  webDir: preview ? 'mobile/preview' : 'mobile/www',
  includePlugins: process.env.CAPACITOR_ENABLE_PUSH === '1'
    ? ['@capacitor/app', '@capacitor/push-notifications']
    : ['@capacitor/app'],
  server: preview ? undefined : {
    // Modo remoto: aplicativo carrega o backend Railway sem duplicar backend.
    url: serverUrl,
    errorPath: 'index.html',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
