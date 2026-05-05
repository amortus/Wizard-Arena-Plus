'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { CharacterKind } from '../shared/constants';
import { isBlockedName } from '../shared/profanity';

// Tiny synth chime played whenever a wizard is picked. Lazily creates an
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
  { id: 'blue_wizard',       name: 'Azuriel',    blurb: 'Magic Orb · balanced' },
  { id: 'fire_wizard',       name: 'Pyrion',     blurb: 'Fireball · fragile dmg' },
  { id: 'salamander_wizard', name: 'Scorch',     blurb: 'Fireball · tanky' },
  { id: 'lightning_wizard',  name: 'Voltaric',   blurb: 'Spark · fast multi' },
  { id: 'earth_wizard',      name: 'Mossback',   blurb: 'Rock · heavy hit' },
  { id: 'forest_wizard',     name: 'Briarwick',  blurb: 'Leaf · balanced' },
  { id: 'shadow_wizard',     name: 'Umbra',      blurb: 'Magic Orb · agile' },
  { id: 'mouse_apprentice',  name: 'Pip',        blurb: 'Spark · tiny & fast' },
  { id: 'frog_wizard',       name: 'Croakwell',  blurb: 'Leaf · forest spirit' },
  { id: 'old_man_wizard',    name: 'Eldwin',     blurb: 'Arcane · wise & tanky' },
  { id: 'owl_wizard',        name: 'Hootley',    blurb: 'Shadow · agile homing' },
  { id: 'cat_wizard',        name: 'Whiskerwhip',blurb: 'Leaf · fast scatter' },
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
  const [started, setStarted] = useState(false);
  const [name, setName] = useState('');
  const [character, setCharacter] = useState<CharacterKind>('blue_wizard');
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameShake, setNameShake] = useState(false);
  // Room state — defaults to "main" public, but can be overridden by ?room= or
  // by clicking Play with Friends to mint a private room code.
  const [room, setRoom] = useState<string>('main');
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [pendingRoomCode, setPendingRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);
  const playSelectSfx = useSelectSfx();

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
    setStarted(true);
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

  // Read ?room= on first load so a shared link drops you straight into the right room.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    if (r) {
      const normalized = normalizeRoomCode(r);
      if (normalized.length >= 3) setRoom(normalized);
    }
  }, []);

  const openRoomModal = () => {
    if (!pendingRoomCode) setPendingRoomCode(generateRoomCode());
    setJoinInput('');
    setCopied(false);
    setShowRoomModal(true);
  };

  const shareUrlFor = (code: string) => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    return url.toString();
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(pendingRoomCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const useRoom = (code: string) => {
    setRoom(code);
    setShowRoomModal(false);
    // Reflect the room in the URL bar so refresh keeps you in the same room.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('room', code);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const handleJoin = () => {
    const code = normalizeRoomCode(joinInput);
    if (code.length < 3) return;
    useRoom(code);
  };

  if (started) {
    return (
      <Game
        name={name || 'Player'}
        character={character}
        color={0xffffff}
        hue={0}
        room={room}
        country={country}
      />
    );
  }

  return (
    <div className="menu-root">
      <div className="scanlines" />
      <div className="menu-card">
        <img
          src="/wizard_arena_logo.png"
          alt="Wizard Arena Online"
          className="menu-logo"
        />
        <p className="sub">WASD or mouse to move · Spells cast automatically · Survive the hordes</p>

        <div className="field">
          <label>Choose Your Wizard</label>
          <div className="char-grid wizards">
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
          Enter Wizard Arena
        </button>
        <button
          className="leaderboard-btn"
          onClick={openRoomModal}
          type="button"
        >
          👥 Play with Friends
          {room !== 'main' && <span className="room-tag">Room: {room}</span>}
        </button>
        <Link href="/leaderboard" className="leaderboard-btn lb-link-btn">
          🏆 Leaderboard
        </Link>
      </div>

      {showRoomModal && (
        <div
          className="lb-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRoomModal(false);
          }}
        >
          <div className="lb-modal">
            <h2>Play with Friends</h2>
            <p className="lb-sub">Share this code or link — only people with it can join.</p>

            <div className="room-block">
              <div className="room-label">Your Room Code</div>
              <div className="room-code">{pendingRoomCode}</div>
              <div className="room-actions">
                <button
                  className="leaderboard-btn"
                  onClick={() => setPendingRoomCode(generateRoomCode())}
                  type="button"
                >
                  🎲 New Code
                </button>
                <button
                  className="leaderboard-btn"
                  onClick={copyShareUrl}
                  type="button"
                >
                  {copied ? '✅ Copied' : '📋 Copy Link'}
                </button>
              </div>
              <button className="start-btn" onClick={() => useRoom(pendingRoomCode)}>
                Use This Room
              </button>
            </div>

            <div className="room-divider">— or join existing —</div>

            <div className="room-block">
              <input
                type="text"
                placeholder="Enter room code..."
                value={joinInput}
                onChange={(e) => setJoinInput(normalizeRoomCode(e.target.value))}
                maxLength={12}
                className="room-input"
              />
              <button
                className="leaderboard-btn"
                onClick={handleJoin}
                disabled={normalizeRoomCode(joinInput).length < 3}
                type="button"
              >
                Join Room
              </button>
            </div>

            {room !== 'main' && (
              <button
                className="leaderboard-btn"
                onClick={() => useRoom('main')}
                type="button"
                style={{ marginTop: 12 }}
              >
                ← Back to Public Room
              </button>
            )}

            <button className="start-btn lb-close" onClick={() => setShowRoomModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
