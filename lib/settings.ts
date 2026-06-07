export type { Lang } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

export type Settings = {
  lang: Lang;
  musicVol: number;
  sfxVol: number;
};

const KEY = 'madness_settings';
const DEFAULTS: Settings = { lang: 'en', musicVol: 0.5, sfxVol: 0.5 };

function detectLang(): Lang {
  const l = navigator.language?.toLowerCase() ?? '';
  if (l.startsWith('pt')) return 'pt';
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('de')) return 'de';
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('ko')) return 'ko';
  return 'en';
}

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, lang: detectLang() };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: Settings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
