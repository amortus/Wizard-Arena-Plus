'use client';
import { useState } from 'react';
import { supabase, getProfile, upsertProfile, type UserProfile } from '../lib/supabase';
import { T } from '../shared/i18n';
import type { Lang } from '../shared/i18n';

type AuthResult =
  | { kind: 'guest'; name: string }
  | { kind: 'google'; profile: UserProfile };

type Props = { onDone: (result: AuthResult) => void; lang?: Lang };

function isNativePlatform(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

export function AuthScreen({ onDone, lang = 'en' }: Props) {
  const [loading, setLoading] = useState(false);
  const t = T[lang];

  async function handleGoogle() {
    setLoading(true);
    if (isNativePlatform()) {
      // Native: use custom URL scheme so Android returns to the app after OAuth.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'com.madnessarena.game://auth/callback',
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error || !data.url) { setLoading(false); alert(t.googleError); return; }
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url });
      setLoading(false);
    } else {
      // Web: standard redirect flow.
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) { setLoading(false); alert(t.googleError); }
    }
  }


  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'radial-gradient(ellipse at center, #1a0a2e 0%, #0a050f 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 0,
    }}>
      {/* Logo */}
      <img
        src="/wizard_arena_plus_logo.png"
        alt="Wizard Arena Plus"
        style={{ width: 320, maxWidth: '90vw', marginBottom: 32, imageRendering: 'pixelated' }}
      />

      {/* Card */}
      <div style={{
        background: 'rgba(20, 10, 35, 0.95)',
        border: '2px solid rgba(200,16,46,0.4)',
        borderRadius: 8,
        padding: '32px 40px',
        width: '100%', maxWidth: 340,
        boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 60px rgba(200,16,46,0.08)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '13px 20px',
                background: loading ? '#1a1a2e' : '#fff',
                color: '#1a1a2e',
                border: 'none', borderRadius: 6,
                fontFamily: 'sans-serif', fontWeight: 700, fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity .15s',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <GoogleIcon />
              {loading ? t.connecting : t.signInGoogle}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 14, color: '#5a4a5a' }}>{t.or}</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            </div>

            <button
              type="button"
              onClick={() => onDone({ kind: 'guest', name: '' })}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                color: '#c8a46e',
                border: '1px solid rgba(200,164,110,0.35)',
                borderRadius: 6,
                fontFamily: "'Press Start 2P', monospace", fontSize: 9,
                letterSpacing: 1, cursor: 'pointer',
              }}
            >
              {t.playAsGuest}
            </button>

            <p style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: '#5a4858', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
              {t.googleRankingHint}
            </p>
          </>
      </div>
    </div>
  );
}

// Modal shown after Google login when user has no nickname yet
type NicknameModalProps = {
  defaultName: string;
  photoUrl: string | null;
  userId: string;
  onDone: (profile: UserProfile) => void;
  lang?: Lang;
};

export function NicknameModal({ defaultName, photoUrl, userId, onDone, lang = 'en' }: NicknameModalProps) {
  const [nickname, setNickname] = useState(defaultName.slice(0, 20));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const t = T[lang];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const name = nickname.trim();
    if (name.length < 2) { setError(t.minChars); return; }
    if (name.length > 20) { setError(t.maxChars); return; }
    setSaving(true);
    await upsertProfile(userId, name, photoUrl);
    onDone({ id: userId, nickname: name, photo_url: photoUrl, created_at: '' });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #1a0d2e 0%, #0e0818 100%)',
        border: '2px solid rgba(200,16,46,0.4)',
        borderRadius: 8, padding: '28px 36px', width: '100%', maxWidth: 320,
        display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
      }}>
        {photoUrl && (
          <img src={photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid #c8102e' }} />
        )}
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#c8a46e', letterSpacing: 1 }}>
          {t.chooseNick}
        </div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <input
            autoFocus
            type="text"
            value={nickname}
            onChange={e => { setNickname(e.target.value); setError(''); }}
            maxLength={20}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(200,164,110,0.3)',
              borderRadius: 4, padding: '10px 12px',
              color: '#e0d8c0', fontFamily: "'VT323', monospace", fontSize: 18,
              outline: 'none', textAlign: 'center',
            }}
          />
          {error && <span style={{ fontFamily: "'VT323', monospace", fontSize: 14, color: '#ff6644', textAlign: 'center' }}>{error}</span>}
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '11px', background: '#c8102e', color: '#fff',
              border: 'none', borderRadius: 6,
              fontFamily: "'Press Start 2P', monospace", fontSize: 9, letterSpacing: 1,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? t.saving : t.confirm}
          </button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
