import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.madnessarena.game',
  appName: 'Wizard Arena',
  webDir: 'out',
  android: {
    buildOptions: {
      keystorePath: 'release.keystore',
      keystoreAlias: 'madness',
    },
  },
  server: {
    // Production: serve from bundled /out — no server config needed.
    // Development: uncomment below to live-reload from local Next.js:
    // url: 'http://192.168.x.x:3000',
    // cleartext: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '699333109354-mtcb9sheb8krv4kod17cvfl0qrp0l46g.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
