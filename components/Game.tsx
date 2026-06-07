'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterKind } from '../shared/constants';
import type { CastleState, GameMode, LeaderboardEntry, MobaCrystalState, MobaTeam, PlayerState, TowerState } from '../shared/types';
import { MOBA_ITEMS } from '../shared/items';
import { dedupeBestByName } from '../shared/leaderboard';
import { POWERUPS } from '../shared/powerups';
import { T, POWERUP_PT, type Lang } from '../shared/i18n';
import { getAdService } from '../lib/ads';

function PowerupsPanel({ powerups }: { powerups: string[] }) {
  const counts = powerups.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1; return acc;
  }, {});
  const dataMap = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return (
    <div style={{
      position: 'fixed', right: 18, top: '50%', transform: 'translateY(-50%)',
      display: 'grid', gridTemplateColumns: 'repeat(2, 34px)', gap: 4,
      maxHeight: '80vh', overflow: 'hidden', zIndex: 25,
      pointerEvents: 'none',
    }}>
      {entries.map(([id, count]) => {
        const pu = dataMap[id];
        return (
          <div key={id} style={{
            position: 'relative', width: 34, height: 34,
            background: 'rgba(20,10,40,0.85)',
            border: '1px solid rgba(255,204,68,0.35)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {pu?.iconSprite
              ? <img src={pu.iconSprite} alt="" style={{ width: 26, height: 26, imageRendering: 'pixelated', display: 'block', filter: 'drop-shadow(0 0 3px rgba(255,204,68,0.45))' }} />
              : <span style={{ fontSize: 18 }}>{pu?.icon ?? '✨'}</span>
            }
            {count > 1 && (
              <span style={{
                position: 'absolute', bottom: -3, right: -4,
                background: '#1a0a30', border: '1px solid #ffd700',
                color: '#ffd700', fontWeight: 700, fontSize: 9, lineHeight: 1,
                borderRadius: 3, padding: '1px 2px',
              }}>×{count}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}


type Props = {
  name: string;
  character: CharacterKind;
  color: number;
  hue: number;
  room: string;
  country?: string;
  roomName?: string;
  roomPassword?: string;
  gameMode?: GameMode;
  musicVol?: number;
  sfxVol?: number;
  lang?: Lang;
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

export default function Game({ name, character, color, hue, room, country, roomName, roomPassword, gameMode, musicVol = 0.5, sfxVol = 0.5, lang = 'en' }: Props) {
  const t = useMemo(() => T[lang], [lang]);

  const shopCategories = useMemo(() => [
    { key: 'damage',    label: t.shopDamage },
    { key: 'magic',     label: t.shopMagic },
    { key: 'lifesteal', label: t.shopLifesteal },
    { key: 'defense',   label: t.shopDefense },
    { key: 'speed',     label: t.shopSpeed },
    { key: 'legendary', label: t.shopLegendary },
  ] as const, [t]);

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
    castle?: CastleState;
    gameMode?: GameMode;
    towers?: TowerState[];
    mobaCrystals?: MobaCrystalState[];
    activeBossId?: string;
    bossMaxHp?: number;
    bossHp?: number;
  }>({ players: [] });
  const [castleDestroyed, setCastleDestroyed] = useState(false);
  const [mobaVictory, setMobaVictory] = useState<MobaTeam | null>(null);
  const [mobaRespawnMs, setMobaRespawnMs] = useState(0);
  const [levelUp, setLevelUp] = useState<LevelUpData | null>(null);
  const [levelUpFocus, setLevelUpFocus] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<string>('damage');
  const [dead, setDead] = useState(false);
  const adReviveUsedRef = useRef(false); // persists across deaths — 1 per room session
  const [adReviveUsed, setAdReviveUsed] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [deathStats, setDeathStats] = useState<{ level: number; wave: number; score: number; killerName: string; killerIcon: string; finalDamage: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roomFull, setRoomFull] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [bossAlert, setBossAlert] = useState<string | null>(null);
  const [inSmoke, setInSmoke] = useState(false);
  const [novaFlash, setNovaFlash] = useState(false);
  const lastSelfRef = useRef<{ level: number; wave: number; bossKills: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [localMusicVol, setLocalMusicVol] = useState(musicVol);
  const [localSfxVol, setLocalSfxVol] = useState(sfxVol);

  useEffect(() => {
    let game: any;
    let cancelled = false;

    (async () => {
      const { createGame } = await import('../game/scene');
      if (cancelled || !containerRef.current) return;

      const result = createGame(containerRef.current, { name, character, color, hue, room, country, roomName, roomPassword, gameMode, musicVol, sfxVol });
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
      result.scene.bus.on('died', (info: { killerName?: string; killerIcon?: string; finalDamage?: number } = {}) => {
        const stats = lastSelfRef.current;
        if (stats) {
          setDeathStats({
            level: stats.level,
            wave: stats.wave,
            score: stats.level * 100 + stats.wave * 50 + stats.bossKills * 500,
            killerName: info.killerName ?? 'Unknown',
            killerIcon: info.killerIcon ?? '💀',
            finalDamage: info.finalDamage ?? 0,
          });
        }
        setDead(true);
        setAdLoading(false);
      });
      result.scene.bus.on('respawned', () => {
        setDead(false);
        setDeathStats(null);
      });
      result.scene.bus.on('leaderboard', (entries: LeaderboardEntry[]) => setLeaderboard(entries));
      result.scene.bus.on('roomFull', () => setRoomFull(true));
      result.scene.bus.on('bossAlert', (n: string) => {
        setBossAlert(n);
        setTimeout(() => setBossAlert(null), 3500);
      });
      result.scene.bus.on('smokeZone', (inside: boolean) => setInSmoke(inside));
      result.scene.bus.on('authError', (reason: string) => setAuthError(reason));
      result.scene.bus.on('nova', () => {
        setNovaFlash(true);
        setTimeout(() => setNovaFlash(false), 700);
      });
      result.scene.bus.on('castleDestroyed', () => setCastleDestroyed(true));
      result.scene.bus.on('mobaVictory', (team: MobaTeam) => setMobaVictory(team));
      result.scene.bus.on('crystalDestroyed', () => {});
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

  const respawn = () => { sceneRef.current?.respawn(); };

  const handleWatchAd = async () => {
    setAdLoading(true);
    const rewarded = await getAdService().showRewarded();
    setAdLoading(false);
    if (rewarded) {
      adReviveUsedRef.current = true;
      setAdReviveUsed(true);
      sceneRef.current?.revive();
    }
  };
  const buyItem = (itemId: string) => { sceneRef.current?.buyItem(itemId); };

  useEffect(() => {
    if (!dead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); respawn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dead]);

  useEffect(() => {
    if (hud.gameMode !== 'moba' && hud.gameMode !== 'aram') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'b' || e.key === 'B') && !levelUp) { e.preventDefault(); setShopOpen((v) => !v); }
      if (e.key === 'Escape') setShopOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.gameMode, levelUp]);

  useEffect(() => {
    if (!dead || (hud.gameMode !== 'moba' && hud.gameMode !== 'aram')) return;
    const iv = setInterval(() => {
      const at = hud.self?.mobaRespawnAt ?? 0;
      setMobaRespawnMs(Math.max(0, at - Date.now()));
    }, 100);
    return () => clearInterval(iv);
  }, [dead, hud.gameMode, hud.self?.mobaRespawnAt]);

  useEffect(() => {
    if (!levelUp) return;
    const onKey = (e: KeyboardEvent) => {
      const total = levelUp.choices.length;
      if (total === 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault(); setLevelUpFocus((f) => (f - 1 + total) % total);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault(); setLevelUpFocus((f) => (f + 1) % total);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); pickChoice(levelUpFocus);
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
            {t.connecting}
            <span className="connecting-dot dot1">.</span>
            <span className="connecting-dot dot2">.</span>
            <span className="connecting-dot dot3">.</span>
          </div>
        </div>
      )}

      {roomFull && (
        <div className="connecting-overlay">
          <div className="room-full-card">
            <h2>{t.arenaFull}</h2>
            <p>{t.arenaFullMsg}</p>
            <div className="room-full-actions">
              <button className="start-btn" onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
                {t.tryAgain}
              </button>
              <button className="leaderboard-btn" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
                {t.backMenu}
              </button>
            </div>
          </div>
        </div>
      )}

      {authError && (
        <div className="connecting-overlay">
          <div className="room-full-card">
            <h2>{t.wrongPassword}</h2>
            <p>{authError}</p>
            <div className="room-full-actions">
              <button className="leaderboard-btn" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
                {t.backMenu}
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

      {hud.gameMode !== 'moba' && hud.gameMode !== 'aram' && <div className="top-bar">
        <div className="top-bar-level">L{hud.self?.level ?? 1}</div>
        {hud.activeBossId && hud.bossMaxHp ? (
          <div className="top-bar-xp top-bar-boss-hp">
            <div className="top-bar-boss-hp-fill" style={{ width: `${Math.max(0, Math.min(100, ((hud.bossHp ?? 0) / hud.bossMaxHp) * 100))}%` }} />
            <div className="top-bar-xp-text">
              {`${Math.max(0, Math.round(hud.bossHp ?? 0))} / ${Math.round(hud.bossMaxHp)} HP`}
            </div>
          </div>
        ) : (
          <div className="top-bar-xp">
            <div className="top-bar-xp-fill" style={{ width: hud.self ? `${Math.min(100, (hud.self.xp / Math.max(1, hud.self.xpToNext)) * 100)}%` : '0%' }} />
            <div className="top-bar-xp-text">
              {hud.self ? `${hud.self.xp} / ${hud.self.xpToNext} GEMS` : t.connectingDots}
            </div>
          </div>
        )}
        <div className="top-bar-wave">
          <div className="top-bar-wave-num">{hud.wave ? `WAVE ${hud.wave}` : 'WAVE -'}</div>
          {hud.waveName && <div className="top-bar-wave-name">{hud.waveName}</div>}
          {hud.waveTimeLeftMs !== undefined && hud.waveTimeLeftMs > 0 && (
            <div className="top-bar-wave-time">{Math.ceil(hud.waveTimeLeftMs / 1000)}s</div>
          )}
        </div>
        <button className="ingame-settings-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
      </div>}

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()}>
            <h2>⚙ {t.settings}</h2>
            <div className="settings-row">
              <label>🎵 {t.musicVol}</label>
              <input type="range" min={0} max={1} step={0.05} value={localMusicVol}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setLocalMusicVol(v);
                  sceneRef.current?.setMusicVolume(v);
                }} />
              <span>{Math.round(localMusicVol * 100)}%</span>
            </div>
            <div className="settings-row">
              <label>🔊 {t.sfxVol}</label>
              <input type="range" min={0} max={1} step={0.05} value={localSfxVol}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setLocalSfxVol(v);
                  sceneRef.current?.setSfxVolume(v);
                }} />
              <span>{Math.round(localSfxVol * 100)}%</span>
            </div>
            <div className="settings-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <button className="leaderboard-btn" style={{ flex: 1, marginRight: 8 }}
                onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
                🏠 {t.backMenu ?? 'Menu'}
              </button>
              <button className="start-btn" style={{ flex: 1 }} onClick={() => setShowSettings(false)}>
                ✓ {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.castle && hud.gameMode === 'castle' && (
        <div className="castle-hp-bar-wrap">
          <span className="castle-hp-icon">🏰</span>
          <div className="castle-hp-track">
            <div className="castle-hp-fill" style={{
              width: `${Math.max(0, (hud.castle.hp / hud.castle.maxHp) * 100)}%`,
              background: hud.castle.hp / hud.castle.maxHp > 0.5 ? '#44cc22' : hud.castle.hp / hud.castle.maxHp > 0.25 ? '#ddaa22' : '#cc2222',
            }} />
          </div>
          <span className="castle-hp-text">{Math.max(0, Math.round(hud.castle.hp))}/{hud.castle.maxHp}</span>
        </div>
      )}

      {(hud.gameMode === 'moba' || hud.gameMode === 'aram') && hud.mobaCrystals && (
        <div className="moba-crystal-bars">
          {(['blue', 'red'] as MobaTeam[]).map((team) => {
            const crystal = hud.mobaCrystals!.find((c) => c.team === team);
            const pct = crystal ? crystal.hp / crystal.maxHp : 1;
            return (
              <div key={team} className={`moba-crystal-bar ${team}`}>
                <span className="moba-crystal-icon">{team === 'blue' ? '💎' : '💢'}</span>
                <div className="moba-crystal-track">
                  <div className="moba-crystal-fill" style={{ width: `${Math.max(0, pct * 100)}%`, background: team === 'blue' ? '#4488ff' : '#ff4444' }} />
                </div>
                <span className="moba-crystal-hp">{crystal ? Math.max(0, Math.round(crystal.hp)) : 0}</span>
              </div>
            );
          })}
        </div>
      )}

      {(hud.gameMode === 'moba' || hud.gameMode === 'aram') && hud.towers && (
        <div className="moba-tower-status">
          {(['blue', 'red'] as MobaTeam[]).map((team) => (
            <div key={team} className={`moba-tower-row ${team}`}>
              {hud.towers!.filter((tower) => tower.team === team).sort((a, b) => a.lane - b.lane || a.tier - b.tier).map((tower) => (
                <div key={tower.id} className={`moba-tower-dot ${tower.alive ? 'alive' : 'dead'}`} title={`${team} lane${tower.lane + 1} T${tower.tier}`} />
              ))}
            </div>
          ))}
        </div>
      )}

      {(hud.gameMode === 'moba' || hud.gameMode === 'aram') && hud.self && (
        <div className="moba-bottom-hud">
          <div className="moba-gold-display">
            <span className="moba-gold-icon">🪙</span>
            <span className="moba-gold-value">{hud.self.mobaGold ?? 0}</span>
          </div>
          <div className="moba-item-slots">
            {Array.from({ length: 6 }, (_, i) => {
              const itemId = (hud.self!.mobaItems ?? [])[i];
              const item = itemId ? MOBA_ITEMS.find((x) => x.id === itemId) : null;
              return (
                <div key={i} className={`moba-item-slot ${item ? 'filled' : 'empty'}`} title={item?.name ?? ''}>
                  {item ? item.icon : ''}
                </div>
              );
            })}
          </div>
          <button className="moba-shop-btn" onClick={() => setShopOpen((v) => !v)} title="Shop (B)">
            🛒
          </button>
        </div>
      )}

      {shopOpen && (hud.gameMode === 'moba' || hud.gameMode === 'aram') && (
        <div className="moba-shop-overlay" onClick={() => setShopOpen(false)}>
          <div className="moba-shop-panel" onClick={(e) => e.stopPropagation()}>
            <div className="moba-shop-header">
              <span className="moba-shop-title">{t.shopTitle}</span>
              <span className="moba-shop-gold">🪙 {hud.self?.mobaGold ?? 0}</span>
              <button className="moba-shop-close" onClick={() => setShopOpen(false)}>✕</button>
            </div>
            <div className="moba-shop-tabs">
              {shopCategories.map((cat) => (
                <button
                  key={cat.key}
                  className={`moba-shop-tab ${shopTab === cat.key ? 'active' : ''}`}
                  onClick={() => setShopTab(cat.key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="moba-shop-items">
              {MOBA_ITEMS.filter((item) => item.category === shopTab).map((item) => {
                const owned = hud.self?.mobaItems ?? [];
                const slots = owned.length;
                const alreadyOwned = item.unique && owned.includes(item.id);
                const noGold = (hud.self?.mobaGold ?? 0) < item.cost;
                const slotsFull = slots >= 6;
                const disabled = alreadyOwned || noGold || slotsFull;
                return (
                  <div key={item.id} className={`moba-shop-item ${disabled ? 'disabled' : ''}`}>
                    <div className="moba-shop-item-icon">{item.icon}</div>
                    <div className="moba-shop-item-info">
                      <div className="moba-shop-item-name">{item.name}{item.unique ? ' ✦' : ''}</div>
                      <div className="moba-shop-item-desc">{item.description}</div>
                    </div>
                    <button
                      className="moba-shop-buy-btn"
                      disabled={disabled}
                      onClick={() => { if (!disabled) buyItem(item.id); }}
                      title={
                        alreadyOwned ? t.alreadyOwned :
                        noGold ? t.notEnoughGold :
                        slotsFull ? t.slotsFull :
                        t.buyFor(item.cost)
                      }
                    >
                      {alreadyOwned ? '✓' : `${item.cost}🪙`}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="moba-shop-slots-row">
              {Array.from({ length: 6 }, (_, i) => {
                const itemId = (hud.self?.mobaItems ?? [])[i];
                const item = itemId ? MOBA_ITEMS.find((x) => x.id === itemId) : null;
                return (
                  <div key={i} className={`moba-item-slot ${item ? 'filled' : 'empty'}`} title={item?.name ?? t.emptySlot}>
                    {item ? item.icon : ''}
                  </div>
                );
              })}
              <span className="moba-shop-slots-label">{t.slotsLabel((hud.self?.mobaItems ?? []).length)}</span>
            </div>
          </div>
        </div>
      )}

      {inSmoke && <div className="smoke-overlay" />}
      {novaFlash && <div className="nova-flash" />}

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
            {hud.gameMode === 'aram' && (
              <div className="aram-char-badge">🎲 {hud.self.character.replace(/_/g, ' ')}</div>
            )}
            {(() => {
              const now = Date.now();
              const buffs: { icon: string; cls: string; until: number }[] = [];
              if (hud.self.speedBoostUntil > now) buffs.push({ icon: '⚡', cls: 'speed', until: hud.self.speedBoostUntil });
              if (hud.self.damageBoostUntil > now) buffs.push({ icon: '🗡', cls: 'damage', until: hud.self.damageBoostUntil });
              if (hud.self.berserkerUntil > now) buffs.push({ icon: '💀', cls: 'berserker', until: hud.self.berserkerUntil });
              if (hud.self.damageImmuneUntil > now) buffs.push({ icon: '🛡', cls: 'shield', until: hud.self.damageImmuneUntil });
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
            <h2>{t.levelUpTitle(levelUp.level)}</h2>
            <div className="lvl-sub">{t.levelUpHint}</div>
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
                      {sprite ? <img src={sprite} alt="" className="choice-sprite" /> : (c as any).icon ?? ''}
                    </div>
                    <div className="name">{lang === 'pt' ? (POWERUP_PT[c.id]?.name ?? c.name) : c.name}</div>
                    <div className="desc">{lang === 'pt' ? (POWERUP_PT[c.id]?.desc ?? c.description) : c.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {castleDestroyed && (
        <div className="death-overlay castle-destroyed-overlay">
          <h2>{t.castleDestroyed}</h2>
          <p style={{ color: '#cc4444', marginBottom: 16 }}>{t.castleFallen}</p>
          <div className="death-stats">
            <div className="death-stat-row">
              <span className="death-stat-label">{t.wavesSurvived}</span>
              <span className="death-stat-value">{hud.wave ?? 0}</span>
            </div>
          </div>
          <button className="start-btn" style={{ maxWidth: 240 }} onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
            {t.playAgain}
          </button>
          <button className="leaderboard-btn" style={{ maxWidth: 200, marginTop: 8, fontSize: 8 }} onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
            {t.backMenu}
          </button>
        </div>
      )}

      {dead && (hud.gameMode === 'moba' || hud.gameMode === 'aram') && (
        <div className="moba-respawn-overlay">
          <h2>{t.defeated}</h2>
          <div className="moba-respawn-timer">{mobaRespawnMs > 0 ? `${Math.ceil(mobaRespawnMs / 1000)}` : '...'}</div>
          <div className="moba-respawn-label">{t.respawning}</div>
          <button className="moba-shop-btn moba-respawn-shop-btn" onClick={() => setShopOpen((v) => !v)}>
            🛒 Shop (B)
          </button>
        </div>
      )}

      {mobaVictory && (
        <div className="moba-victory-overlay">
          <h2>{mobaVictory === hud.self?.mobaTeam ? t.victory : t.defeat}</h2>
          <p style={{ color: mobaVictory === 'blue' ? '#4488ff' : '#ff4444' }}>
            {mobaVictory === 'blue' ? t.crystalDestroyedBlue : t.crystalDestroyedRed}
          </p>
          <button className="start-btn" style={{ maxWidth: 240 }} onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
            {t.playAgain}
          </button>
          <button className="leaderboard-btn" style={{ maxWidth: 200, marginTop: 8, fontSize: 8 }} onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
            {t.backMenu}
          </button>
        </div>
      )}

      {dead && hud.gameMode !== 'moba' && hud.gameMode !== 'aram' && (
        <div className="death-overlay">
          <h2>{t.youDied}</h2>
          {deathStats && (() => {
            const ranked = dedupeBestByName(leaderboard);
            const myRank = ranked.findIndex((e) => e.name === name);
            return (
              <div className="death-stats">
                <div className="death-stat-row">
                  <span className="death-stat-label">{t.level}</span>
                  <span className="death-stat-value">{deathStats.level}</span>
                </div>
                <div className="death-stat-row">
                  <span className="death-stat-label">{t.waveLabel}</span>
                  <span className="death-stat-value">{deathStats.wave}</span>
                </div>
                <div className="death-stat-row">
                  <span className="death-stat-label">{t.score}</span>
                  <span className="death-stat-value">{deathStats.score}</span>
                </div>
                <div className="death-stat-row">
                  <span className="death-stat-label">{t.killedBy}</span>
                  <span className="death-stat-value">{deathStats.killerIcon} {deathStats.killerName}</span>
                </div>
                <div className="death-stat-row">
                  <span className="death-stat-label">{t.finalBlow}</span>
                  <span className="death-stat-value">{Math.round(deathStats.finalDamage)} {t.dmg}</span>
                </div>
                <div className="death-rank">
                  {myRank >= 0 ? t.rankSuccess(myRank + 1) : t.rankFail}
                </div>
              </div>
            );
          })()}
          {!adReviveUsed && (
            <button
              className="start-btn"
              style={{ maxWidth: 240, background: 'linear-gradient(180deg,#7a3a00,#4a2000)', borderColor: '#ffa040', color: '#ffd080', marginBottom: 6, opacity: adLoading ? 0.6 : 1 }}
              onClick={handleWatchAd}
              disabled={adLoading}
            >
              {adLoading ? '...' : '📺 Watch Ad → Revive'}
            </button>
          )}
          <button className="leaderboard-btn" style={{ maxWidth: 200, marginTop: 8, fontSize: 8 }} onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
            {t.backMenu}
          </button>
        </div>
      )}

      {hud.self && !dead && (
        <PowerupsPanel powerups={hud.self.collectedPowerups ?? []} />
      )}
    </div>
  );
}
