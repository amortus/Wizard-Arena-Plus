export interface AdService {
  warmup(): void;
  showBanner(): void | Promise<void>;
  hideBanner(): void | Promise<void>;
  /** Returns true if the user watched to completion and earned the reward. */
  showRewarded(): Promise<boolean>;
  showInterstitial(): Promise<void>;
}
