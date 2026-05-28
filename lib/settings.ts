export type Lang = 'en' | 'pt';

export type Settings = {
  lang: Lang;
  musicVol: number;
  sfxVol: number;
};

const KEY = 'madness_settings';
const DEFAULTS: Settings = { lang: 'en', musicVol: 0.5, sfxVol: 0.5 };

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const browserLang = navigator.language?.toLowerCase() ?? '';
      return { ...DEFAULTS, lang: browserLang.startsWith('pt') ? 'pt' : 'en' };
    }
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: Settings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
