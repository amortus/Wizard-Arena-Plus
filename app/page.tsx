'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import type { CharacterKind } from '../shared/constants';
import { isBlockedName } from '../shared/profanity';
import type { GameMode, RoomInfo } from '../shared/types';
import { loadSettings, saveSettings, type Settings } from '../lib/settings';
import { T } from '../shared/i18n';
import { SettingsModal } from '../components/SettingsModal';
import { AuthScreen } from '../components/AuthScreen';
import { supabase, getProfile, upsertProfile, type UserProfile } from '../lib/supabase';

// Tiny synth chime played whenever a gladiator is picked.
function useSelectSfx(sfxVol: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  return () => {
    try {
      if (!ctxRef.current) {
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) ctxRef.current = new Ctx();
      }
      const ctx = ctxRef.current;
      if (!ctx) return;
      const vol = sfxVol * 2; // 0.5 default → 1.0 multiplier
      const now = ctx.currentTime;
      const blip = (freq: number, t0: number, dur: number, gain: number, type: OscillatorType) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + t0);
        osc.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0, now + t0);
        g.gain.linearRampToValueAtTime(gain * vol, now + t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0008, now + t0 + dur);
        osc.start(now + t0);
        osc.stop(now + t0 + dur + 0.02);
      };
      blip(880, 0, 0.10, 0.10, 'triangle');
      blip(1320, 0.04, 0.12, 0.07, 'sine');
    } catch { /* audio errors are non-fatal */ }
  };
}

const Game = dynamic(() => import('../components/Game'), { ssr: false });

type CharInfo = { id: CharacterKind; name: string; weapon: string; descKey: keyof typeof T.en };

const CHAR_INFO: CharInfo[] = [
  { id: 'blue_wizard',       name: 'Kael',      weapon: 'Arcane Blade',   descKey: 'descBalanced' },
  { id: 'fire_wizard',       name: 'Ignis',     weapon: 'Fire Lash',      descKey: 'descFragile' },
  { id: 'salamander_wizard', name: 'Brazok',    weapon: 'Fire Lash',      descKey: 'descTanky' },
  { id: 'lightning_wizard',  name: 'Zarak',     weapon: 'Storm Spear',    descKey: 'descFastMulti' },
  { id: 'earth_wizard',      name: 'Stonehide', weapon: 'Earth Slam',     descKey: 'descHeavyHit' },
  { id: 'forest_wizard',     name: 'Thornback', weapon: 'Thorn Blade',    descKey: 'descBalanced' },
  { id: 'shadow_wizard',     name: 'Shade',     weapon: 'Shadow Strike',  descKey: 'descAgile' },
  { id: 'mouse_apprentice',  name: 'Runt',      weapon: 'Quick Jab',      descKey: 'descTiny' },
  { id: 'frog_wizard',       name: 'Murkus',    weapon: 'Swamp Blade',    descKey: 'descResilient' },
  { id: 'old_man_wizard',    name: 'Elder Rex', weapon: 'Ancient Force',  descKey: 'descWise' },
  { id: 'owl_wizard',        name: 'Kestrel',   weapon: 'Talon Strike',   descKey: 'descHoming' },
  { id: 'cat_wizard',        name: 'Velox',     weapon: 'Swift Claw',     descKey: 'descScatter' },
];

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const cps = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Page() {
  const [screen, setScreen] = useState<'loading' | 'auth' | 'select' | 'browser' | 'game'>('loading');
  const [authProfile, setAuthProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [character, setCharacter] = useState<CharacterKind>('blue_wizard');
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameShake, setNameShake] = useState(false);
  const [roomId, setRoomId] = useState('main');
  const [roomDisplayName, setRoomDisplayName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPass, setCreatePass] = useState('');
  const [createMode, setCreateMode] = useState<GameMode>('arena');
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('arena');
  const [joinPassFor, setJoinPassFor] = useState<string | null>(null);
  const [joinPassInput, setJoinPassInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({ lang: 'en', musicVol: 0.5, sfxVol: 0.5 });
  useEffect(() => { setSettings(loadSettings()); }, []);
  const sessionHandledRef = useRef(false);

  const t = T[settings.lang];
  const playSelectSfx = useSelectSfx(settings.sfxVol);

  async function handleSession(session: { user: { id: string; user_metadata: Record<string, unknown> } }, fromEvent = false) {
    if (fromEvent && sessionHandledRef.current) return;
    sessionHandledRef.current = true;
    const meta = session.user.user_metadata;
    const userId = session.user.id;
    const photoUrl = (meta?.avatar_url as string) ?? null;
    const displayName = (meta?.full_name as string) ?? (meta?.name as string) ?? '';
    const profile = await getProfile(userId);
    if (profile) {
      setAuthProfile(profile);
      setName(profile.nickname);
      setScreen('select');
    } else {
      const nickname = (displayName || 'Player').slice(0, 20);
      await upsertProfile(userId, nickname, photoUrl);
      const newProfile: UserProfile = { id: userId, nickname, photo_url: photoUrl, created_at: '' };
      setAuthProfile(newProfile);
      setName(nickname);
      setScreen('select');
    }
  }

  // Check for existing Supabase session (covers redirect-back-from-OAuth and returning users)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setScreen('auth'); return; }
      await handleSession(session);
    });

    // Listen for session changes — covers native Google Sign-In (signInWithIdToken)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await handleSession(session, true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Handle deep link callback from native Google OAuth (com.madnessarena.game://auth/callback?code=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isNative = Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios';
    if (!isNative) return;
    let handle: { remove: () => void } | null = null;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', async ({ url }) => {
        try {
          const code = new URL(url).searchParams.get('code');
          if (!code) return;
          const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !session) return;
          import('@capacitor/browser').then(({ Browser }) => Browser.close().catch(() => {}));
          await handleSession(session, true);
        } catch { /* ignore malformed URLs */ }
      }).then(h => { handle = h; });
    });
    return () => { handle?.remove(); };
  }, []);


  function handleAuthDone(result: { kind: 'guest'; name: string } | { kind: 'google'; profile: UserProfile }) {
    if (result.kind === 'guest') {
      setName(result.name);
      setAuthProfile(null);
      setScreen('select');
    } else {
      setAuthProfile(result.profile);
      setName(result.profile.nickname);
      setScreen('select');
    }
  }

  const triggerNameError = (msg: string) => {
    setNameError(msg);
    setNameShake(true);
    setTimeout(() => setNameShake(false), 500);
  };

  const handleStart = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      triggerNameError(t.nameRequired);
      return;
    }
    if (isBlockedName(trimmed)) {
      triggerNameError(t.nameTaken);
      return;
    }
    setNameError(null);
    setCreateName(`${trimmed}'s Room`);
    setScreen('browser');
  };

  const LOBBY_URL = (() => {
    if (typeof window === 'undefined') return '';
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (host) return `https://${host}/parties/lobby/main`;
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:1999/parties/lobby/main' : '';
  })();

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      if (LOBBY_URL) {
        const res = await fetch(LOBBY_URL);
        if (res.ok) {
          const data = await res.json();
          setRooms(Array.isArray(data) ? data : (data.rooms ?? []));
        }
      }
    } catch {}
    setLoadingRooms(false);
  };

  const enterGame = (id: string, displayName: string, password: string, mode?: GameMode) => {
    setRoomId(id);
    setRoomDisplayName(displayName);
    setRoomPassword(password);
    setSelectedGameMode(mode ?? 'arena');
    setScreen('game');
  };

  const joinRoom = (room: RoomInfo) => {
    if (room.hasPassword) {
      setJoinPassFor(room.id);
      setJoinPassInput('');
    } else {
      enterGame(room.id, room.name, '', room.gameMode ?? 'arena');
    }
  };

  const createRoom = () => {
    const id = generateRoomCode();
    enterGame(id, createName.trim() || `${name}'s Room`, createPass, createMode);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://ipapi.co/country/', { cache: 'force-cache' });
        if (!res.ok) throw new Error('non-ok');
        const code = (await res.text()).trim();
        if (!cancelled && /^[A-Z]{2}$/.test(code)) setCountry(code);
      } catch {
        // Fallback: extract from browser locale ('pt-BR' → 'BR')
        if (!cancelled) {
          const parts = (navigator.language ?? '').split('-');
          if (parts.length >= 2) setCountry(parts[parts.length - 1].toUpperCase());
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const prevScreen = useRef(screen);
  useEffect(() => {
    if (screen === 'browser' && prevScreen.current !== 'browser') fetchRooms();
    prevScreen.current = screen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Auth screen — shown on first visit or when not logged in
  if (screen === 'loading') {
    return <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center, #1a0a2e 0%, #0a050f 100%)' }} />;
  }

  if (screen === 'auth') {
    return <AuthScreen onDone={handleAuthDone} lang={settings.lang} />;
  }

  if (screen === 'game') {
    return (
      <Game
        name={name || 'Player'}
        character={character}
        color={0xffffff}
        hue={0}
        room={roomId}
        country={country}
        roomName={roomDisplayName}
        roomPassword={roomPassword}
        gameMode={selectedGameMode}
        musicVol={settings.musicVol}
        sfxVol={settings.sfxVol}
        lang={settings.lang}
      />
    );
  }

  const gameModes = [
    { mode: 'arena' as const, label: t.modeArena, sub: t.modeArenaDesc, glyph: '⚔', clr: 'arena' },
  ];

  if (screen === 'browser') {
    return (
      <div className="menu-root">
        <div className="scanlines" />
        <div id="madness-banner-ad" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }} />
        <div className="menu-card" style={{ maxWidth: 720, minHeight: '80vh' }}>
          <div className="room-browser">
            <div className="room-browser-header">
              <div className="room-browser-title">{t.chooseRoom}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="leaderboard-btn" style={{ marginTop: 0, padding: '6px 14px', fontSize: 9, letterSpacing: 1 }} onClick={fetchRooms} type="button">
                  {t.refresh}
                </button>
                <button className="leaderboard-btn" style={{ marginTop: 0, padding: '6px 14px', fontSize: 9, letterSpacing: 1 }} onClick={() => setScreen('select')} type="button">
                  {t.back}
                </button>
              </div>
            </div>

            <table className="room-table">
              <thead>
                <tr>
                  <th style={{ width: 20 }}></th>
                  <th>{t.roomNameCol}</th>
                  <th>{t.players}</th>
                  <th>{t.wave}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loadingRooms ? (
                  <tr><td colSpan={5} className="room-empty">{t.loading}</td></tr>
                ) : rooms.length === 0 ? (
                  <tr><td colSpan={5} className="room-empty">{t.noRooms}</td></tr>
                ) : (
                  rooms.map((r) => {
                    const isFull = r.playerCount >= r.maxPlayers;
                    const modeTitle = t.modeArena;
                    return (
                      <tr key={r.id}>
                        <td className="room-row-lock">{r.hasPassword ? '🔒' : ''}</td>
                        <td className="room-row-name">
                          <span title={modeTitle} style={{ marginRight: 4 }}>
                            {'⚔️'}
                          </span>
                          {r.name}
                        </td>
                        <td className={`room-row-players${isFull ? ' room-row-full' : ''}`}>
                          {r.playerCount}/{r.maxPlayers}
                        </td>
                        <td className="room-row-wave">
                          {r.wave > 0 ? `W${r.wave}${r.waveName ? ` · ${r.waveName}` : ''}` : '—'}
                        </td>
                        <td>
                          {isFull ? (
                            <span className="room-row-full" style={{ fontSize: 8, fontFamily: "'Press Start 2P', monospace" }}>{t.full}</span>
                          ) : joinPassFor === r.id ? (
                            <span className="room-pass-prompt">
                              <input
                                type="password"
                                placeholder={t.passwordPlaceholder}
                                value={joinPassInput}
                                onChange={(e) => setJoinPassInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') enterGame(r.id, r.name, joinPassInput, r.gameMode); }}
                                style={{ background: 'transparent', border: 'none', color: '#e0d8c0', fontFamily: "'VT323', monospace", fontSize: 16, outline: 'none', width: 80 }}
                                autoFocus
                              />
                              <button
                                className="leaderboard-btn"
                                style={{ marginTop: 0, padding: '2px 8px', fontSize: 8, letterSpacing: 1 }}
                                onClick={() => enterGame(r.id, r.name, joinPassInput, r.gameMode)}
                                type="button"
                              >{t.go}</button>
                              <button
                                className="leaderboard-btn"
                                style={{ marginTop: 0, padding: '2px 8px', fontSize: 8, letterSpacing: 1 }}
                                onClick={() => setJoinPassFor(null)}
                                type="button"
                              >✕</button>
                            </span>
                          ) : (
                            <button
                              className="leaderboard-btn"
                              style={{ marginTop: 0, padding: '4px 10px', fontSize: 8, letterSpacing: 1 }}
                              onClick={() => joinRoom(r)}
                              type="button"
                            >{t.join}</button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div className="room-browser-footer">
              <div className="room-create-section">
                <button
                  className="leaderboard-btn"
                  style={{ marginTop: 0 }}
                  onClick={() => setShowCreate((v) => !v)}
                  type="button"
                >
                  {showCreate ? t.cancel : t.createRoom}
                </button>
                {showCreate && (
                  <div className="room-create-form">
                    <input
                      type="text"
                      placeholder={t.roomNamePlaceholder}
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      maxLength={32}
                      className="room-input"
                      style={{ fontSize: 12, letterSpacing: 1 }}
                    />
                    <div className="room-pass-row">
                      <input
                        type="password"
                        placeholder={t.passwordOptional}
                        value={createPass}
                        onChange={(e) => setCreatePass(e.target.value)}
                        maxLength={32}
                        className="room-input"
                        style={{ fontSize: 12, letterSpacing: 1, flex: 1 }}
                      />
                    </div>
                    <div className="room-mode-grid">
                      {gameModes.map(({ mode, label, sub, glyph, clr }) => (
                        <button
                          key={mode}
                          type="button"
                          className={`room-mode-card room-mode-card--${clr}${createMode === mode ? ' active' : ''}`}
                          onClick={() => setCreateMode(mode)}
                        >
                          <span className="rmc-glyph">{glyph}</span>
                          <span className="rmc-label">{label}</span>
                          <span className="rmc-sub">{sub}</span>
                        </button>
                      ))}
                    </div>
                    <button className="start-btn" onClick={createRoom} type="button">
                      {t.createPlay}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button className="settings-btn" onClick={() => setShowSettings(true)} title={t.settings}>⚙️</button>
        {showSettings && (
          <SettingsModal settings={settings} onClose={() => setShowSettings(false)} onChange={setSettings} />
        )}
      </div>
    );
  }

  // === SELECT screen ===
  return (
    <div className="menu-root">
      <div className="scanlines" />
      <div id="madness-banner-ad" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }} />


      <div className="menu-card">
        <img
          src="/wizard_arena_plus_logo.png"
          alt="Madness Arena"
          className="menu-logo"
        />
        <p className="sub">{t.subtitle}</p>

        <div className="field">
          <label>{t.chooseWizard}</label>
          <div className="char-grid characters">
            {CHAR_INFO.map((c) => (
              <button
                key={c.id}
                className={`char-pick ${character === c.id ? 'active' : ''}`}
                onClick={() => { setCharacter(c.id); playSelectSfx(); }}
                type="button"
              >
                <img
                  src={`/portraits/${c.id}.png`}
                  alt={c.name}
                  className="char-portrait"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallback) {
                      img.dataset.fallback = '1';
                      img.src = `/sprites/${c.id}_south.png`;
                    }
                  }}
                />
                <span className="char-name">{c.name}</span>
                <span className="blurb">{c.weapon} · {String(t[c.descKey])}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>{t.nameLabel} {country ? <span style={{ marginLeft: 6 }}>{countryFlag(country)}</span> : null}</label>
          <input
            type="text"
            placeholder={t.namePlaceholder}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            maxLength={16}
            className={[
              nameError ? 'invalid' : '',
              nameShake ? 'shake' : '',
            ].filter(Boolean).join(' ')}
          />
          {nameError && <div className="name-error">{nameError}</div>}
        </div>

        <button className="start-btn" onClick={handleStart}>
          {t.playBtn}
        </button>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/leaderboard" className="leaderboard-btn lb-link-btn">
            {t.leaderboard}
          </Link>
          <Link href="/about" className="leaderboard-btn lb-link-btn" style={{ opacity: 0.7 }}>
            About
          </Link>
        </div>
      </div>

      <button className="settings-btn" onClick={() => setShowSettings(true)} title={t.settings}>⚙️</button>
      {authProfile && (
        <div style={{
          position: 'fixed', top: 12, left: 12, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(20,10,35,0.85)', border: '1px solid rgba(200,16,46,0.3)',
          borderRadius: 20, padding: '4px 10px 4px 4px',
        }}>
          {authProfile.photo_url && (
            <img src={authProfile.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #c8102e' }} />
          )}
          <span style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: '#c8a46e' }}>
            {authProfile.nickname}
          </span>
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); setAuthProfile(null); setScreen('auth'); }}
            style={{ background: 'none', border: 'none', color: '#5a4858', cursor: 'pointer', fontSize: 12, padding: 0 }}
            title="Sair"
          >✕</button>
        </div>
      )}
      {showSettings && (
        <SettingsModal settings={settings} onClose={() => setShowSettings(false)} onChange={setSettings} />
      )}
    </div>
  );
}
