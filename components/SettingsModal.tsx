'use client';
import { Settings, saveSettings } from '../lib/settings';
import { T } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

export function SettingsModal({ settings, onClose, onChange }: {
  settings: Settings;
  onClose: () => void;
  onChange: (s: Settings) => void;
}) {
  const t = T[settings.lang];

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    saveSettings(next);
    onChange(next);
  };

  const langs: { code: Lang; label: string }[] = [
    { code: 'pt', label: 'PT-BR' },
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' },
    { code: 'de', label: 'DE' },
    { code: 'fr', label: 'FR' },
    { code: 'ja', label: 'JA' },
    { code: 'ko', label: 'KO' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card" onClick={e => e.stopPropagation()}>
        <h2>⚙️ {t.settings}</h2>

        <div className="settings-row lang-row">
          <label>{t.language}</label>
          <div className="lang-toggle">
            {langs.map(({ code, label }) => (
              <button
                key={code}
                className={settings.lang === code ? 'active' : ''}
                onClick={() => update({ lang: code })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <label>{t.musicVol}</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={settings.musicVol}
            onChange={e => update({ musicVol: parseFloat(e.target.value) })}
          />
          <span>{Math.round(settings.musicVol * 100)}%</span>
        </div>

        <div className="settings-row">
          <label>{t.sfxVol}</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={settings.sfxVol}
            onChange={e => update({ sfxVol: parseFloat(e.target.value) })}
          />
          <span>{Math.round(settings.sfxVol * 100)}%</span>
        </div>

        <button className="start-btn" style={{ maxWidth: 160, marginTop: 8 }} onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}
