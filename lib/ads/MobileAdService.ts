import type { AdService } from './AdService';

// Stub replaced by full AdMob implementation in Etapa 3 (Capacitor).
export class MobileAdService implements AdService {
  showBanner(): void {}
  hideBanner(): void {}
  showRewarded(): Promise<boolean> { return Promise.resolve(false); }
  showInterstitial(): Promise<void> { return Promise.resolve(); }
}
