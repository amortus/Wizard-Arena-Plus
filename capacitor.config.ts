import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.madnessarena.game',
  appName: 'Madness Arena',
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
};

export default config;
