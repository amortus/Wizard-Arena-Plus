import type { AdService } from './AdService';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  AdmobConsentStatus,
} from '@capacitor-community/admob';
import type {
  BannerAdOptions,
  RewardAdOptions,
  AdOptions,
  AdmobConsentRequestOptions,
} from '@capacitor-community/admob';

// Ad Unit IDs — replace TEST_IDS with real values after creating units in AdMob Console:
//   admob.google.com → Apps → Madness Arena → Ad units → Create ad unit
//   Then set NEXT_PUBLIC_ADMOB_BANNER_ID / _REWARDED_ID / _INTERSTITIAL_ID in .env.local
// Google official test IDs are used as fallback (never charge real money).
const TEST_IDS = {
  banner:       'ca-app-pub-3940256099942544/6300978111',
  rewarded:     'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

const AD_UNITS = {
  banner:       process.env.NEXT_PUBLIC_ADMOB_BANNER_ID       ?? TEST_IDS.banner,
  rewarded:     process.env.NEXT_PUBLIC_ADMOB_REWARDED_ID     ?? TEST_IDS.rewarded,
  interstitial: process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_ID ?? TEST_IDS.interstitial,
};

const isTestMode = !process.env.NEXT_PUBLIC_ADMOB_BANNER_ID;

export class MobileAdService implements AdService {
  private initialised = false;
  private rewardedLoaded = false;

  private async init(): Promise<void> {
    if (this.initialised) return;
    this.initialised = true;

    await AdMob.initialize({ initializeForTesting: isTestMode });

    const consentOpts: AdmobConsentRequestOptions = {};
    const { status } = await AdMob.requestConsentInfo(consentOpts).catch(() => ({ status: AdmobConsentStatus.NOT_REQUIRED }));
    if (status === AdmobConsentStatus.REQUIRED) {
      await AdMob.showConsentForm().catch(() => {});
    }

    void this.preloadRewarded();
  }

  private async preloadRewarded(): Promise<void> {
    this.rewardedLoaded = false;
    const opts: RewardAdOptions = { adId: AD_UNITS.rewarded };
    await AdMob.prepareRewardVideoAd(opts).catch(() => {});
    this.rewardedLoaded = true;
  }

  async showBanner(): Promise<void> {
    await this.init();
    const opts: BannerAdOptions = {
      adId: AD_UNITS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    };
    await AdMob.showBanner(opts).catch(() => {});
  }

  async hideBanner(): Promise<void> {
    await AdMob.hideBanner().catch(() => {});
  }

  async showRewarded(): Promise<boolean> {
    await this.init();
    if (!this.rewardedLoaded) {
      await this.preloadRewarded();
    }
    try {
      const reward = await AdMob.showRewardVideoAd();
      void this.preloadRewarded();
      return !!reward;
    } catch {
      return false;
    }
  }

  async showInterstitial(): Promise<void> {
    await this.init();
    const opts: AdOptions = { adId: AD_UNITS.interstitial };
    await AdMob.prepareInterstitial(opts).catch(() => {});
    await AdMob.showInterstitial().catch(() => {});
    // Ignore errors — interstitial failing should never break the game flow.
  }
}
