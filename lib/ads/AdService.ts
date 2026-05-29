export interface AdService {
  showBanner(): void;
  hideBanner(): void;
  /** Returns true if user watched to completion and earned the reward. */
  showRewarded(): Promise<boolean>;
  showInterstitial(): Promise<void>;
}
