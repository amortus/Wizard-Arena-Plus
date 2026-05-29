import type { AdService } from './AdService';

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

let _instance: AdService | null = null;

export function getAdService(): AdService {
  if (_instance) return _instance;
  if (isNative()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MobileAdService } = require('./MobileAdService') as typeof import('./MobileAdService');
    _instance = new MobileAdService();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebAdService } = require('./WebAdService') as typeof import('./WebAdService');
    _instance = new WebAdService();
  }
  return _instance;
}

export type { AdService };
