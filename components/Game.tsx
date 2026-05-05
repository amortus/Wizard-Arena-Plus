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

export default function Game({ name, character, color, hue, room, country }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const [hud, setHud] = useState<{
    self?: PlayerState;
    players: PlayerState[];
    wave?: number;
    waveName?: string;
    waveTimeLeftMs?: number;
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
  // Track latest hud.self level/wave so the 'died' event handler can read them
  // synchronously (the bus.on closure would otherwise capture an empty hud).
  const lastSelfRef = useRef<{ level: number; wave: number } | null>(null);

  useEffect(() => {
    let game: any;
    let cancelled = false;

    (async () => {
      const { createGame } = await import('../game/scene');
      if (cancelled || !containerRef.current) return;

      const result = createGame(containerRef.current, { name, character, color, hue, room, country });
      sceneRef.current = result.scene;
      game = result.game;

      result.scene.bus.on('hud', (h: any) => {
        setHud(h);
        if (h.self) {
          lastSelfRef.current = { level: h.self.level, wave: h.self.waveNumber ?? 0 };
        }
      });
      result.scene.bus.on('levelUp', (data: LevelUpData) => {
        setLevelUp(data);
        setLevelUpFocus(0);
      });
      result.scene.bus.on('died', () => {
        const stats = lastSelfRef.current;
        if (stats) {
          setDeathStats({
            level: stats.level,
            wave: stats.wave,
            score: stats.level * 100 + stats.wave * 50,
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

  const isConnecting = !hud.self && !dead && !roomFull;

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

      <div className="hud">
        <div className="row">
          <strong>{hud.self?.name ?? '...'}</strong>
          {hud.self && (
            <> · HP {Math.max(0, Math.round(hud.self.hp))}/{hud.self.maxHp}</>
          )}
        </div>
        {hud.self && (
          <div className="row" style={{ opacity: 0.7, marginTop: 4 }}>
            Spells: {hud.self.weapons.join(', ')}
            {hud.self.projectileBonus > 0 ? ` · +${hud.self.projectileBonus} proj` : ''}
          </div>
        )}
      </div>

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
            const myRank = ranked.findIndex(
              (e) => e.name === name && e.score === deathStats.score,
            );
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
        </div>
      )}
    </div>
  );
}
