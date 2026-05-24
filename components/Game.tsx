'use client';
import { useEffect, useRef, useState } from 'react';
import type { CharacterKind } from '../shared/constants';
import type { LeaderboardEntry, PlayerState } from '../shared/types';
import { dedupeBestByName } from '../shared/leaderboard';

type Props = {
  name: string;
  character: CharacterKind;
  color: number;
  hue: number;
  room: string;
  country?: string;
  roomName?: string;
  roomPassword?: string;
};

type LevelUpData = {
  level: number;
  choices: { id: string; name: string; description: string }[];
};

function flag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const cps = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
}

export default function Game({ name, character, color, hue, room, country, roomName, roomPassword }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const [hud, setHud] = useState<{
    self?: PlayerState;
    players: PlayerState[];
    wave?: number;
    waveName?: string;
    waveTimeLeftMs?: number;
    survivalWave?: number;
    npcs?: number;
    gems?: number;
  }>({ players: [] });
  const [levelUp, setLevelUp] = useState<LevelUpData | null>(null);
  const [levelUpFocus, setLevelUpFocus] = useState(0);
  const [dead, setDead] = useState(false);
  // Captured at moment of death so the death screen still shows them after
  // the server has reset the player's HUD state for respawn.
  const [deathStats, setDeathStats] = useState<{ level: number; wave: number; score: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roomFull, setRoomFull] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [bossAlert, setBossAlert] = useState<string | null>(null);
  const [inSmoke, setInSmoke] = useState(false);
  const [novaFlash, setNovaFlash] = useState(false);
  const [arenaElement, setArenaElement] = useState<'normal' | 'lava' | 'ice' | 'fog'>('normal');
  // Track latest hud.self level/wave/bossKills so the 'died' handler can read them
  // synchronously (the bus.on closure would otherwise capture an empty hud).
  const lastSelfRef = useRef<{ level: number; wave: number; bossKills: number } | null>(null);

  useEffect(() => {
    let game: any;
    let cancelled = false;

    (async () => {
      const { createGame } = await import('../game/scene');
      if (cancelled || !containerRef.current) return;

      const result = createGame(containerRef.current, { name, character, color, hue, room, country, roomName, roomPassword });
      sceneRef.current = result.scene;
      game = result.game;

      result.scene.bus.on('hud', (h: any) => {
        setHud(h);
        if (h.self) {
          lastSelfRef.current = { level: h.self.level, wave: h.self.waveNumber ?? 0, bossKills: h.self.bossKills ?? 0 };
        }
      });
      result.scene.bus.on('levelUp', (data: LevelUpData) => {
        result.scene.clearMovement();
        setLevelUp(data);
        setLevelUpFocus(0);
      });
      result.scene.bus.on('died', () => {
        const stats = lastSelfRef.current;
        if (stats) {
          setDeathStats({
            level: stats.level,
            wave: stats.wave,
            score: stats.level * 100 + stats.wave * 50 + stats.bossKills * 500,
          });
        }
        setDead(true);
      });
      result.scene.bus.on('respawned', () => {
        setDead(false);
        setDeathStats(null);
      });
      result.scene.bus.on('leaderboard', (entries: LeaderboardEntry[]) => setLeaderboard(entries));
      result.scene.bus.on('roomFull', () => setRoomFull(true));
      result.scene.bus.on('bossAlert', (name: string) => {
        setBossAlert(name);
        setTimeout(() => setBossAlert(null), 3500);
      });
      result.scene.bus.on('smokeZone', (inside: boolean) => setInSmoke(inside));
      result.scene.bus.on('arenaElement', (el: 'normal' | 'lava' | 'ice' | 'fog') => setArenaElement(el));
      result.scene.bus.on('authError', (reason: string) => setAuthError(reason));
      result.scene.bus.on('nova', () => {
        setNovaFlash(true);
        setTimeout(() => setNovaFlash(false), 700);
      });
    })();

    return () => {
      cancelled = true;
      if (game) game.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickChoice = (idx: number) => {
    sceneRef.current?.pickPowerup(idx);
    setLevelUp(null);
  };

  const respawn = () => {
    sceneRef.current?.respawn();
  };

  // Press Enter (or Space) on the death screen to respawn instantly.
  useEffect(() => {
    if (!dead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        respawn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dead]);

  // Keyboard nav while level-up modal is open: ←/→ to move focus, Enter/Space to confirm.
  useEffect(() => {
    if (!levelUp) return;
    const onKey = (e: KeyboardEvent) => {
      const total = levelUp.choices.length;
      if (total === 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setLevelUpFocus((f) => (f - 1 + total) % total);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setLevelUpFocus((f) => (f + 1) % total);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickChoice(levelUpFocus);
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx < total) pickChoice(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [levelUp, levelUpFocus]);

  const isConnecting = !hud.self && !dead && !roomFull && !authError;
  const hpPct = hud.self ? Math.max(0, (hud.self.hp / hud.self.maxHp) * 100) : 100;
  const hpColor = hpPct > 60 ? '#22cc44' : hpPct > 30 ? '#ddcc22' : '#cc3333';
  const xpPct = hud.self ? Math.min(100, (hud.self.xp / Math.max(1, hud.self.xpToNext)) * 100) : 0;

  return (
    <div className="game-root">
      <div id="phaser-container" ref={containerRef} />

      {isConnecting && (
        <div className="connecting-overlay">
          <div className="connecting-text">
            CONNECTING
            <span className="connecting-dot dot1">.</span>
            <span className="connecting-dot dot2">.</span>
            <span className="connecting-dot dot3">.</span>
          </div>
        </div>
      )}

      {roomFull && (
        <div className="connecting-overlay">
          <div className="room-full-card">
            <h2>Arena Is Full</h2>
            <p>The public arena is at capacity. Try again in a moment, or jump into a fresh private room with friends.</p>
            <div className="room-full-actions">
              <button
                className="start-btn"
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.reload();
                }}
              >
                Try Again
              </button>
              <button
                className="leaderboard-btn"
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.href = '/';
                }}
              >
                ← Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {authError && (
        <div className="connecting-overlay">
          <div className="room-full-card">
            <h2>Wrong Password</h2>
            <p>{authError}</p>
            <div className="room-full-actions">
              <button className="leaderboard-btn" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {bossAlert && (
        <div className="boss-alert-overlay">
          <div className="boss-alert-text">⚠ {bossAlert.toUpperCase()} APPROACHES ⚠</div>
        </div>
      )}

      <div className="top-bar">
        <div className="top-bar-level">L{hud.self?.level ?? 1}</div>
        <div className="top-bar-xp">
          <div
            className="top-bar-xp-fill"
            style={{
              width: hud.self
                ? `${Math.min(100, (hud.self.xp / Math.max(1, hud.self.xpToNext)) * 100)}%`
                : '0%',
            }}
          />
          <div className="top-bar-xp-text">
            {hud.self
              ? `${hud.self.xp} / ${hud.self.xpToNext} GEMS`
              : 'connecting...'}
          </div>
        </div>
        <div className="top-bar-wave">
          <div className="top-bar-wave-num">
            {hud.wave ? `WAVE ${hud.wave}` : 'WAVE -'}
          </div>
          {hud.waveName && (
            <div className="top-bar-wave-name">{hud.waveName}</div>
          )}
          {hud.waveTimeLeftMs !== undefined && hud.waveTimeLeftMs > 0 && (
            <div className="top-bar-wave-time">{Math.ceil(hud.waveTimeLeftMs / 1000)}s</div>
          )}
        </div>
      </div>

      {inSmoke && <div className="smoke-overlay" />}
      {novaFlash && <div className="nova-flash" />}
      {arenaElement === 'lava' && <div className="arena-lava-overlay" />}
      {arenaElement === 'ice'  && <div className="arena-ice-overlay"  />}
      {arenaElement === 'fog'  && <div className="arena-fog-overlay"  />}

      {hud.self && (
        <div className="unit-frame">
          <div className="unit-frame-level">{hud.self.level}</div>
          <img className="unit-frame-portrait" src={`/portraits/${character}.png`} alt="" />
          <div className="unit-frame-info">
            <div className="unit-frame-name">{hud.self.name}</div>
            {(hud.survivalWave ?? 0) > 0 && (
              <div className="unit-frame-survival">⚔ Wave {hud.survivalWave}</div>
            )}
            <div className="unit-frame-hp-bar">
              <div className="unit-frame-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
              <span className="unit-frame-hp-text">
                {Math.max(0, Math.round(hud.self.hp))}/{hud.self.maxHp}
              </span>
            </div>
            <div className="unit-frame-xp-bar">
              <div className="unit-frame-xp-fill" style={{ width: `${xpPct}%` }} />
            </div>
            <div className="unit-frame-spells">
              {hud.self.weapons.join(' · ')}
              {hud.self.projectileBonus > 0 ? ` +${hud.self.projectileBonus}` : ''}
            </div>
            {(() => {
              const now = Date.now();
              const buffs: { icon: string; cls: string; until: number }[] = [];
              if (hud.self.speedBoostUntil > now)
                buffs.push({ icon: '⚡', cls: 'speed', until: hud.self.speedBoostUntil });
              if (hud.self.damageBoostUntil > now)
                buffs.push({ icon: '🗡', cls: 'damage', until: hud.self.damageBoostUntil });
              if (hud.self.berserkerUntil > now)
                buffs.push({ icon: '💀', cls: 'berserker', until: hud.self.berserkerUntil });
              if (hud.self.damageImmuneUntil > now)
                buffs.push({ icon: '🛡', cls: 'shield', until: hud.self.damageImmuneUntil });
              if (!buffs.length) return null;
              return (
                <div className="unit-frame-buffs">
                  {buffs.map((b) => (
                    <div key={b.cls} className={`buff-pill buff-pill-${b.cls}`}>
                      <span>{b.icon}</span>
                      <span>{Math.max(1, Math.ceil((b.until - now) / 1000))}s</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {levelUp && (
        <div className="levelup-overlay">
          <div className="levelup-card">
            <h2>LEVEL UP — {levelUp.level}</h2>
            <div className="lvl-sub">← / → to choose · ENTER to confirm · or click</div>
            <div className="choice-row">
              {levelUp.choices.map((c, i) => {
                const sprite = (c as any).iconSprite as string | undefined;
                return (
                  <button
                    key={c.id + i}
                    className={`choice ${i === levelUpFocus ? 'focused' : ''}`}
                    onClick={() => pickChoice(i)}
                    onMouseEnter={() => setLevelUpFocus(i)}
                  >
                    <div className="choice-num">[{i + 1}]</div>
                    <div className="choice-icon">
                      {sprite ? (
                        <img src={sprite} alt="" className="choice-sprite" />
                      ) : (
                        (c as any).icon ?? ''
                      )}
                    </div>
                    <div className="name">{c.name}</div>
                    <div className="desc">{c.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {dead && (
        <div className="death-overlay">
          <h2>YOU DIED</h2>
          {deathStats && (() => {
            // Rank against the deduped leaderboard (one row per name) so ranks
            // match what the leaderboard page shows. Server pushes an updated
            // leaderboard event right after recordDeath().
            const ranked = dedupeBestByName(leaderboard);
            // Find by name only — server is authoritative on score (includes bossKills).
            const myRank = ranked.findIndex((e) => e.name === name);
            return (
              <div className="death-stats">
                <div className="death-stat-row">
                  <span className="death-stat-label">Level</span>
                  <span className="death-stat-value">{deathStats.level}</span>
                </div>
                <div className="death-stat-row">
                  <span className="death-stat-label">Wave</span>
                  <span className="death-stat-value">{deathStats.wave}</span>
                </div>
                <div className="death-stat-row">
                  <span className="death-stat-label">Score</span>
                  <span className="death-stat-value">{deathStats.score}</span>
                </div>
                <div className="death-rank">
                  {myRank >= 0
                    ? `🏆 Rank #${myRank + 1} on the all-time leaderboard!`
                    : 'Did not crack the top 100 — try again.'}
                </div>
              </div>
            );
          })()}
          <button className="start-btn" style={{ maxWidth: 240 }} onClick={respawn}>
            Respawn (Enter)
          </button>
          <button
            className="leaderboard-btn"
            style={{ maxWidth: 200, marginTop: 8, fontSize: 8 }}
            onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}
          >
            Back to Menu
          </button>
        </div>
      )}
    </div>
  );
}
