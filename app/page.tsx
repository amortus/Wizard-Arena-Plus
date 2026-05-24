'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { CharacterKind } from '../shared/constants';
import { isBlockedName } from '../shared/profanity';
import type { GameMode, RoomInfo } from '../shared/types';

// Tiny synth chime played whenever a gladiator is picked. Lazily creates an
// AudioContext on first click so the browser allows playback.
function useSelectSfx() {
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
      const now = ctx.currentTime;
      const blip = (freq: number, t0: number, dur: number, gain: number, type: OscillatorType) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + t0);
        osc.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0, now + t0);
        g.gain.linearRampToValueAtTime(gain, now + t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0008, now + t0 + dur);
        osc.start(now + t0);
        osc.stop(now + t0 + dur + 0.02);
      };
      // bright two-note pluck
      blip(880, 0, 0.10, 0.10, 'triangle');
      blip(1320, 0.04, 0.12, 0.07, 'sine');
    } catch { /* audio errors are non-fatal */ }
  };
}

const Game = dynamic(() => import('../components/Game'), { ssr: false });

const CHAR_INFO: { id: CharacterKind; name: string; blurb: string }[] = [
  { id: 'blue_wizard',       name: 'Kael',      blurb: 'Arcane Blade · balanced' },
  { id: 'fire_wizard',       name: 'Ignis',     blurb: 'Fire Lash · fragile dmg' },
  { id: 'salamander_wizard', name: 'Brazok',    blurb: 'Fire Lash · tanky' },
  { id: 'lightning_wizard',  name: 'Zarak',     blurb: 'Storm Spear · fast multi' },
  { id: 'earth_wizard',      name: 'Stonehide', blurb: 'Earth Slam · heavy hit' },
  { id: 'forest_wizard',     name: 'Thornback', blurb: 'Thorn Blade · balanced' },
  { id: 'shadow_wizard',     name: 'Shade',     blurb: 'Shadow Strike · agile' },
  { id: 'mouse_apprentice',  name: 'Runt',      blurb: 'Quick Jab · tiny & fast' },
  { id: 'frog_wizard',       name: 'Murkus',    blurb: 'Swamp Blade · resilient' },
  { id: 'old_man_wizard',    name: 'Elder Rex', blurb: 'Ancient Force · wise & tanky' },
  { id: 'owl_wizard',        name: 'Kestrel',   blurb: 'Talon Strike · agile homing' },
  { id: 'cat_wizard',        name: 'Velox',     blurb: 'Swift Claw · fast scatter' },
];

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const cps = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
}

// Generate a 6-char readable room code (no ambiguous 0/O/1/I/l).
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Sanitize a user-typed code: uppercase, strip non-alphanumeric, max 12.
function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export default function Page() {
  const [screen, setScreen] = useState<'select' | 'browser' | 'game'>('select');
  const [name, setName] = useState('');
  const [character, setCharacter] = useState<CharacterKind>('blue_wizard');
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameShake, setNameShake] = useState(false);
  const [roomId, setRoomId] = useState('main');
  const [roomDisplayName, setRoomDisplayName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  // Room browser state
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPass, setCreatePass] = useState('');
  const [createMode, setCreateMode] = useState<GameMode>('arena');
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('arena');
  const [joinPassFor, setJoinPassFor] = useState<string | null>(null);
  const [joinPassInput, setJoinPassInput] = useState('');
  const [showSupportPopup, setShowSupportPopup] = useState(false);
  const playSelectSfx = useSelectSfx();

  useEffect(() => {
    if (!sessionStorage.getItem('support_popup_shown')) {
      const t = setTimeout(() => {
        setShowSupportPopup(true);
        sessionStorage.setItem('support_popup_shown', '1');
      }, 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const triggerNameError = (msg: string) => {
    setNameError(msg);
    setNameShake(true);
    // clear shake class after animation finishes so it can re-trigger on next click
    setTimeout(() => setNameShake(false), 500);
  };

  const handleStart = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      triggerNameError('Please enter a name.');
      return;
    }
    if (isBlockedName(trimmed)) {
      triggerNameError('Please choose a different name.');
      return;
    }
    setNameError(null);
    setCreateName(`${trimmed}'s Room`);
    setScreen('browser');
  };

  // Lobby URL — determined once on client
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
        if (res.ok) setRooms(await res.json());
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
    // Best-effort geolocation — silent fail if blocked or offline.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://ipapi.co/country/', { cache: 'force-cache' });
        if (!res.ok) return;
        const code = (await res.text()).trim();
        if (!cancelled && code && code.length === 2) setCountry(code.toUpperCase());
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch rooms when entering browser screen
  const prevScreen = useRef(screen);
  useEffect(() => {
    if (screen === 'browser' && prevScreen.current !== 'browser') {
      fetchRooms();
    }
    prevScreen.current = screen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

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
      />
    );
  }

  if (screen === 'browser') {
    return (
      <div className="menu-root">
        <div className="scanlines" />
        <div className="menu-card" style={{ maxWidth: 720 }}>
          <div className="room-browser">
            <div className="room-browser-header">
              <div className="room-browser-title">Choose a Room</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="leaderboard-btn" style={{ marginTop: 0, padding: '6px 14px', fontSize: 9, letterSpacing: 1 }} onClick={fetchRooms} type="button">
                  Refresh
                </button>
                <button className="leaderboard-btn" style={{ marginTop: 0, padding: '6px 14px', fontSize: 9, letterSpacing: 1 }} onClick={() => setScreen('select')} type="button">
                  Back
                </button>
              </div>
            </div>

            <table className="room-table">
              <thead>
                <tr>
                  <th style={{ width: 20 }}></th>
                  <th>Room Name</th>
                  <th>Players</th>
                  <th>Wave</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loadingRooms ? (
                  <tr><td colSpan={5} className="room-empty">Loading...</td></tr>
                ) : rooms.length === 0 ? (
                  <tr><td colSpan={5} className="room-empty">No active rooms. Be the first to create one!</td></tr>
                ) : (
                  rooms.map((r) => {
                    const isFull = r.playerCount >= r.maxPlayers;
                    return (
                      <tr key={r.id}>
                        <td className="room-row-lock">{r.hasPassword ? '🔒' : ''}</td>
                        <td className="room-row-name">
                          <span title={r.gameMode === 'castle' ? 'Castle Defender' : r.gameMode === 'moba' ? 'Crystal Rush' : 'Arena'} style={{ marginRight: 4 }}>
                            {r.gameMode === 'castle' ? '🏰' : r.gameMode === 'moba' ? '🗡️' : '⚔️'}
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
                            <span className="room-row-full" style={{ fontSize: 8, fontFamily: "'Press Start 2P', monospace" }}>FULL</span>
                          ) : joinPassFor === r.id ? (
                            <span className="room-pass-prompt">
                              <input
                                type="password"
                                placeholder="Password"
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
                              >Go</button>
                              <button
                                className="leaderboard-btn"
                                style={{ marginTop: 0, padding: '2px 8px', fontSize: 8, letterSpacing: 1 }}
                                onClick={() => setJoinPassFor(null)}
                                type="button"
                              >X</button>
                            </span>
                          ) : (
                            <button
                              className="leaderboard-btn"
                              style={{ marginTop: 0, padding: '4px 10px', fontSize: 8, letterSpacing: 1 }}
                              onClick={() => joinRoom(r)}
                              type="button"
                            >Join</button>
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
                  {showCreate ? 'Cancel' : '+ Create Room'}
                </button>
                {showCreate && (
                  <div className="room-create-form">
                    <input
                      type="text"
                      placeholder="Room name..."
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      maxLength={32}
                      className="room-input"
                      style={{ fontSize: 12, letterSpacing: 1 }}
                    />
                    <div className="room-pass-row">
                      <input
                        type="password"
                        placeholder="Password (optional)"
                        value={createPass}
                        onChange={(e) => setCreatePass(e.target.value)}
                        maxLength={32}
                        className="room-input"
                        style={{ fontSize: 12, letterSpacing: 1, flex: 1 }}
                      />
                    </div>
                    <div className="room-mode-row">
                      <button
                        type="button"
                        className={`room-mode-btn${createMode === 'arena' ? ' active' : ''}`}
                        onClick={() => setCreateMode('arena')}
                      >
                        ⚔️ Arena
                      </button>
                      <button
                        type="button"
                        className={`room-mode-btn${createMode === 'castle' ? ' active' : ''}`}
                        onClick={() => setCreateMode('castle')}
                      >
                        🏰 Castle Defender
                      </button>
                      <button
                        type="button"
                        className={`room-mode-btn${createMode === 'moba' ? ' active' : ''}`}
                        onClick={() => setCreateMode('moba')}
                      >
                        🗡️ Crystal Rush
                      </button>
                    </div>
                    <button className="start-btn" onClick={createRoom} type="button">
                      Create &amp; Play
                    </button>
                  </div>
                )}
              </div>
              <div>
                <Link href="/leaderboard" className="leaderboard-btn lb-link-btn" style={{ marginTop: 0, display: 'inline-block', padding: '12px 16px' }}>
                  Leaderboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="menu-root">
      <div className="scanlines" />

      {showSupportPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'linear-gradient(180deg, #2d1010 0%, #1a0808 100%)', border: '3px solid #c8a46e', borderRadius: 6, padding: '28px 28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 60px rgba(255,204,68,0.1)' }}>
            <p style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#c8a46e', letterSpacing: 1, marginBottom: 6 }}>SUPPORT THE ARENA</p>
            <p style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: '#ecddd0', margin: '0 0 16px', lineHeight: 1.3 }}>
              This game is free & made with passion.<br />
              A coffee goes a long way! ☕
            </p>
            <img
              src="/QRcode.jpeg"
              alt="PIX QR Code"
              style={{ width: 160, height: 160, border: '2px solid #c8a46e', borderRadius: 4, marginBottom: 10 }}
            />
            <p style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#9a8878', marginBottom: 20, letterSpacing: 1 }}>PIX — scan with any bank app</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Link
                href="/donate"
                onClick={() => setShowSupportPopup(false)}
                style={{ background: '#ff6b35', color: '#fff', fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 11, textDecoration: 'none', padding: '9px 14px', borderRadius: 4 }}
              >
                More options
              </Link>
              <button
                onClick={() => setShowSupportPopup(false)}
                style={{ border: '2px solid #6b3a1a', color: '#9a8878', fontFamily: "'Cinzel', serif", fontSize: 11, padding: '9px 14px', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="menu-card">
        <img
          src="/wizard_arena_plus_logo.png"
          alt="Madness Arena"
          className="menu-logo"
        />
        <p className="sub">WASD or mouse to move · Weapons strike automatically · Survive the arena</p>

        <div className="field">
          <label>Choose Your Wizard</label>
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
                <span className="blurb">{c.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Name {country ? <span style={{ marginLeft: 6 }}>{countryFlag(country)}</span> : null}</label>
          <input
            type="text"
            placeholder="Enter your name..."
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
          Enter Wizard Arena Plus
        </button>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/leaderboard" className="leaderboard-btn lb-link-btn">
            Leaderboard
          </Link>
          <Link href="/donate" className="leaderboard-btn lb-link-btn" style={{ color: 'var(--amber)' }}>
            ♥ Support
          </Link>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--cream-dim)', letterSpacing: 1 }}>PIX</span>
            <img src="/QRcode.jpeg" alt="PIX QR Code" style={{ width: 80, height: 80, border: '1px solid var(--gold-dim)', borderRadius: 2, opacity: 0.85 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--cream-dim)', letterSpacing: 1 }}>WISE</span>
            <img src="/wise_qr.jpeg" alt="Wise QR Code" style={{ width: 80, height: 80, border: '1px solid var(--gold-dim)', borderRadius: 2, opacity: 0.85 }} />
            <span style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: 'var(--cream-dim)' }}>@alyssong10</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, height: 80, marginTop: 18 }}>
            <a
              href="https://ko-fi.com/wizardarenaplus"
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#ff6b35', color: '#fff', fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 11, textDecoration: 'none', padding: '8px 14px', borderRadius: 4, whiteSpace: 'nowrap' }}
            >
              ☕ Ko-fi
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
