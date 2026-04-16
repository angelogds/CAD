import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.campodogado.manutencao',
  appName: 'Manutenção Campo do Gado',
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    // Modo remoto: aplicativo carrega o backend Railway sem duplicar backend.
    url: process.env.CAPACITOR_SERVER_URL || 'https://SEU_APP.up.railway.app',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: '#15803d',
      androidSplashResourceName: 'splash',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
