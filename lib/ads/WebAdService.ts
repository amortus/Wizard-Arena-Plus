import type { AdService } from './AdService';

// Playwire RAMP global — populated by their CDN script.
// Required env vars (set in .env.local before going live):
//   NEXT_PUBLIC_PLAYWIRE_PUBLISHER_ID
//   NEXT_PUBLIC_PLAYWIRE_WEBSITE_ID
declare global {
  interface Window {
    ramp?: {
      que: Array<() => void>;
      addUnits: (units: { type: string }[]) => Promise<void>;
      displayUnits: () => void;
      destroyUnits: (type: string) => Promise<void>;
    };
  }
}

const REWARDED_TIMEOUT_MS = 60_000;

export class WebAdService implements AdService {
  private bannerShown = false;

  private withRamp(fn: () => void): void {
    if (typeof window === 'undefined') return;
    if (window.ramp) {
      fn();
    } else {
      // Queue until RAMP script initialises.
      window.ramp = window.ramp ?? ({ que: [] } as unknown as typeof window.ramp);
      window.ramp!.que.push(fn);
    }
  }

  showBanner(): void {
    if (this.bannerShown) return;
    this.bannerShown = true;
    this.withRamp(() => {
      window.ramp!.addUnits([{ type: 'bottom_rail' }])
        .then(() => window.ramp?.displayUnits())
        .catch(() => {});
    });
  }

  hideBanner(): void {
    if (!this.bannerShown) return;
    this.bannerShown = false;
    this.withRamp(() => {
      window.ramp!.destroyUnits('bottom_rail').catch(() => {});
    });
  }

  showRewarded(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || !window.ramp) {
        resolve(false);
        return;
      }

      // Playwire fires a custom event when the rewarded ad completes.
      const onGranted = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      // Fallback: resolve false if ad never completes (no fill, user closed, etc.)
      const timeout = setTimeout(() => {
        window.removeEventListener('ramp:rewardGranted', onGranted);
        resolve(false);
      }, REWARDED_TIMEOUT_MS);

      window.addEventListener('ramp:rewardGranted', onGranted, { once: true });

      window.ramp.addUnits([{ type: 'rewarded_video_interstitial' }])
        .then(() => window.ramp?.displayUnits())
        .catch(() => {
          clearTimeout(timeout);
          window.removeEventListener('ramp:rewardGranted', onGranted);
          resolve(false);
        });
    });
  }

  async showInterstitial(): Promise<void> {
    if (typeof window === 'undefined' || !window.ramp) return;
    window.ramp.addUnits([{ type: 'interstitial' }])
      .then(() => window.ramp?.displayUnits())
      .catch(() => {});
  }
}
