import type { AdService } from './AdService';

// AdSense auto ads (loaded in layout.tsx) handles banner placement automatically.
// Rewarded uses a countdown overlay until Playwire is approved.
// When Playwire is live: replace the countdown block with window.ramp calls.

const COUNTDOWN_SECONDS = 5;

function showCountdownOverlay(): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:rgba(0,0,0,0.93)',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'color:#fff', "font-family:'Press Start 2P',monospace",
    ].join(';');

    overlay.innerHTML = `
      <div style="font-size:13px;color:#ffd700;margin-bottom:20px;letter-spacing:2px">📺 AD BREAK</div>
      <div id="_ac" style="font-size:64px;font-weight:bold;color:#fff;line-height:1">${COUNTDOWN_SECONDS}</div>
      <div style="font-size:8px;color:#777;margin-top:16px;letter-spacing:1px">WATCH TO REVIVE</div>
    `;
    document.body.appendChild(overlay);

    let remaining = COUNTDOWN_SECONDS;
    const iv = setInterval(() => {
      remaining -= 1;
      const el = overlay.querySelector('#_ac');
      if (el) el.textContent = String(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        document.body.removeChild(overlay);
        resolve(true);
      }
    }, 1000);
  });
}

export class WebAdService implements AdService {
  warmup(): void {}
  // AdSense auto ads places banners automatically — nothing to do here.
  showBanner(): void {}
  hideBanner(): void {}

  showRewarded(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return showCountdownOverlay();
  }

  async showInterstitial(): Promise<void> {
    // AdSense does not support interstitial on web — noop.
  }
}
