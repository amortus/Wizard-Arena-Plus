import type * as Party from 'partykit/server';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  CHARACTER_BASES,
  GEM_PICKUP_RADIUS,
  GEM_RADIUS,
  LEVEL_DAMAGE_CAP_LEVELS,
  LEVEL_DAMAGE_MUL,
  LEVEL_UP_INVULN_MS,
  MONSTER_BASES,
  MONSTER_FORMATION,
  MONSTER_WAVE_SIZE_OVERRIDE,
  MONSTER_SEPARATION_RADIUS_OVERRIDE,
  MONSTER_GROUP_JITTER_OVERRIDE,
  NPC_SPEED_CAP_FRAC,
  SPAWN_INVULN_MS,
  NPC_BASE_HP,
  NPC_BASE_SPEED,
  NPC_DAMAGE,
  NPC_MAX_COUNT,
  NPC_RADIUS,
  NPC_SEPARATION_FORCE,
  NPC_SEPARATION_RADIUS,
  NPC_TOUCH_COOLDOWN_MS,
  NPC_XP_DROP,
  PLAYER_BASE_HP,
  PLAYER_MAX_PER_ROOM,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PROJECTILE_LIFETIME_MS,
  MAX_PROJECTILES,
  PROJECTILE_RADIUS,
  TICK_MS,
  WAVE_BASE_SIZE,
  WAVE_COOLDOWN_MS,
  WAVE_DURATION_MS,
  WAVE_GROWTH,
  WAVE_INITIAL_BURST_FRAC,
  WAVE_TRICKLE_INTERVAL_MS,
  WEAPON_DEFS,
  WEAPON_PATTERN,
  WEAPON_SPREAD,
  XP_FOR_LEVEL,
  WAVE_ANCHORS_AT,
  themeForWave,
  BOSS_ROSTER,
  type BossAiKind,
  type CharacterKind,
  type MonsterKind,
  type WeaponKind,
} from '../shared/constants';
import { rollPowerupChoices, POWERUPS } from '../shared/powerups';
import { isBlockedName } from '../shared/profanity';
import type {
  ClientToServer,
  GemState,
  HazardState,
  LeaderboardEntry,
  NPCState,
  PlayerState,
  ProjectileState,
  ServerToClient,
  Snapshot,
} from '../shared/types';

const LEADERBOARD_KEY = 'leaderboard:v1';
const LEADERBOARD_SIZE = 100;

type ServerPlayer = PlayerState & {
  input: { dx: number; dy: number };
  weaponCooldowns: Record<string, number>;
  lastTouchAt: number;
  // Time-shield scheduling
  nextTimeShieldAt: number;
  // Lightning strike scheduling
  nextLightningAt: number;
  // New auto-passive scheduling
  nextMeteorAt: number;
  nextFrostNovaAt: number;
  nextHolySmiteAt: number;
  nextBlackHoleAt: number;
  nextMissileAt: number;
  nextEarthquakeAt: number;
  nextTimeStopAt: number;
  // Trail of Fire breadcrumbs — server-side damage application; client renders independently.
  trailBreadcrumbs: { x: number; y: number; expiresAt: number; hitNpcs: Set<string> }[];
  trailLastDropAt: number;
  pendingChoices: { id: string; name: string; description: string; icon: string; iconSprite?: string }[][];
  // Per-player wave engine
  pwWaveStartedAt: number;
  pwWaveActive: boolean;
  pwWaveSpawnedSoFar: number;
  pwWaveTotal: number;
  pwWaveLastTrickleAt: number;
  pwWaveAnchors: { x: number; y: number }[];
  pwWaveKind: MonsterKind;
  // AI mode applied to all NPCs spawned in this wave. Most waves are 'chase',
  // a small fraction get a varied AI (regroup pauses, flank from the side).
  pwWaveAi: NpcAi;
  // High-wave bonus injections: extra zombie bears and rats that spawn
  // alongside the regular wave theme to keep late-game runs spicy.
  pwBonusBearTarget: number;
  pwBonusBearsSpawned: number;
  pwBonusBearLastAt: number;
  pwBonusRatTarget: number;
  pwBonusRatsSpawned: number;
  pwBonusRatLastAt: number;
  // Aura: per-NPC last hit time (so we don't drain HP every tick)
  pwAuraLastHits: Map<string, number>;
  // Set each tick by updateHazards — not part of PlayerState, server-only
  inSlowZone: boolean;
};

type ServerProjectile = ProjectileState & {
  lifetime: number;
  piercesLeft: number;
  pattern: 'straight' | 'wave' | 'homing' | 'orbital';
  // Wave: linear baseline + perpendicular sin offset
  baseX?: number;
  baseY?: number;
  perpX?: number;
  perpY?: number;
  waveTime?: number;
  // Orbital: spin around the owner
  orbitAngle?: number;
  orbitSpinSpeed?: number;
  orbitRadius?: number;
  // Per-NPC hit cooldowns (for orbitals — they can hit each enemy every X ms)
  hitCooldowns?: Map<string, number>;
};

let nextId = 1;
const genId = (prefix: string) => `${prefix}_${nextId++}`;

type NpcAi = 'chase' | 'regroup' | 'flank' | BossAiKind;

type ServerNpc = NPCState & {
  speed: number;
  baseSpeed: number;
  slowUntil: number;     // Date.now() ms; 0 = not slowed
  slowMul: number;       // 0..1 multiplier applied while slowUntil > now
  freezeUntil: number;   // hard-stop while > now (Time Stop)
  lastHitAt: number;
  baseHp: number;
  ownerPlayerId: string;
  // AI behavior — most NPCs are 'chase'. A small fraction of wave groups get
  // a varied AI to add visual interest (regroup pauses, flanks from the side).
  ai: NpcAi;
  aiPhase: 'pursue' | 'pause';
  aiPhaseEndsAt: number;
  flankSide: 1 | -1;
  // Boss-only fields (undefined on regular NPCs)
  bossPhase?: 'idle' | 'windup' | 'dash' | 'recover';
  bossPhaseUntil?: number;
  bossDashVx?: number;
  bossDashVy?: number;
  bossEnraged?: boolean;
  bossNextSummonAt?: number;
  bossSummonKind?: MonsterKind | null;
  bossSummonCount?: number;
  bossSummonIntervalMs?: number;
};

type ServerHazard = HazardState & {
  lastDamageAt: number;
  lightningFired?: boolean;
};

type ServerWolf = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  state: 'orbit' | 'lunge' | 'cooldown';
  orbitAngle: number;        // current angle around owner
  orbitOffset: number;       // each wolf has a different offset for orbit position
  targetId: string | null;
  cooldownUntil: number;
  lastDamageAt: number;
};

type ServerBlackHole = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  spawnedAt: number;
  expiresAt: number;
  damage: number;        // per-tick (0.3s) damage to NPCs in radius
  pullRadius: number;    // px — NPCs within get dragged in
  pullStrength: number;  // px/sec
  damageRadius: number;  // px — NPCs within take periodic damage
  lastTickDamageAt: number;
};

export default class GameServer implements Party.Server {
  players = new Map<string, ServerPlayer>();
  npcs = new Map<string, ServerNpc>();
  gems = new Map<string, GemState>();
  projectiles = new Map<string, ServerProjectile>();
  blackHoles = new Map<string, ServerBlackHole>();
  wolves = new Map<string, ServerWolf>();
  // Arena boss — at most one alive at a time per room. Hunts the top-scoring
  // alive player at L13+. When that player dies, the dragon dies too and
  // drops a feast of loot. There's a brief cooldown after a dragon dies
  // before another can spawn so victories actually feel earned.
  dragonId: string | null = null;
  nextDragonAllowedAt = 0;
  // Boss roster system — cycles through 8 unique bosses as the game progresses
  activeBossId: string | null = null;
  nextBossAllowedAt = 0;
  bossRosterIdx = 0;
  bossGeneration = 0;
  // Environmental hazards — fire pools and lightning strikes
  hazards = new Map<string, ServerHazard>();
  nextHazardAt = 0;
  lastTickAt = 0;
  tickHandle: ReturnType<typeof setInterval> | null = null;
  // Persistent all-time leaderboard (top 10 by score)
  allTimeLeaderboard: LeaderboardEntry[] = [];
  leaderboardLoaded = false;

  constructor(readonly room: Party.Room) {
    void this.loadLeaderboard();
  }

  // HTTP handler — lets the menu fetch the leaderboard before connecting via websocket.
  async onRequest(req: Party.Request) {
    if (!this.leaderboardLoaded) await this.loadLeaderboard();
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers });
    return new Response(
      JSON.stringify({ entries: this.allTimeLeaderboard }),
      { status: 200, headers },
    );
  }

  async loadLeaderboard() {
    try {
      const stored = await this.room.storage.get<LeaderboardEntry[]>(LEADERBOARD_KEY);
      if (stored && Array.isArray(stored)) {
        this.allTimeLeaderboard = stored;
      }
    } catch (e) { void e; }
    this.leaderboardLoaded = true;
  }

  async saveLeaderboard() {
    try {
      await this.room.storage.put(LEADERBOARD_KEY, this.allTimeLeaderboard);
    } catch (e) { void e; }
  }

  recordDeath(p: ServerPlayer) {
    const score = p.level * 100 + p.waveNumber * 50;
    if (score <= 0) return;
    const entry: LeaderboardEntry = {
      name: p.name,
      country: p.country,
      character: p.character,
      level: p.level,
      wave: p.waveNumber,
      score,
      ts: Date.now(),
    };
    this.allTimeLeaderboard.push(entry);
    this.allTimeLeaderboard.sort((a, b) => b.score - a.score);
    this.allTimeLeaderboard = this.allTimeLeaderboard.slice(0, LEADERBOARD_SIZE);
    void this.saveLeaderboard();
    this.broadcastLeaderboard();
  }

  broadcastLeaderboard() {
    const msg: ServerToClient = { type: 'leaderboard', entries: this.allTimeLeaderboard };
    this.room.broadcast(JSON.stringify(msg));
  }

  onConnect(conn: Party.Connection) {
    // Reap stale entries before checking the cap, in case zombie players
    // are still occupying slots from a hibernation cycle.
    this.reapZombiePlayers();
    // Public 'main' room is more permissive (6) since it's first-come-first-served
    // for everyone on the site. Private friend rooms stay tight at 4 for chaos.
    const cap = this.room.id === 'main' ? 6 : PLAYER_MAX_PER_ROOM;
    if (this.players.size >= cap) {
      conn.send(JSON.stringify({ type: 'full' }));
      conn.close();
      return;
    }
    const welcome: ServerToClient = {
      type: 'welcome',
      selfId: conn.id,
      arenaWidth: ARENA_WIDTH,
      arenaHeight: ARENA_HEIGHT,
    };
    conn.send(JSON.stringify(welcome));
    // Send the all-time leaderboard so the new player sees it immediately
    const lb: ServerToClient = { type: 'leaderboard', entries: this.allTimeLeaderboard };
    conn.send(JSON.stringify(lb));
    if (!this.tickHandle) this.startTicking();
  }

  onClose(conn: Party.Connection) {
    this.players.delete(conn.id);
    if (this.players.size === 0) {
      this.stopTicking();
      this.resetRoom();
    }
  }

  resetRoom() {
    this.npcs.clear();
    this.gems.clear();
    this.projectiles.clear();
    this.blackHoles.clear();
    this.wolves.clear();
    this.hazards.clear();
    this.dragonId = null;
    this.nextDragonAllowedAt = 0;
    this.activeBossId = null;
    this.nextBossAllowedAt = 0;
    this.bossRosterIdx = 0;
    this.bossGeneration = 0;
    this.nextHazardAt = 0;
    this.lastTickAt = 0;
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientToServer;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    // Heartbeat: every message from a known player counts as activity. Used
    // by the zombie reaper to detect dead clients that PartyKit hasn't yet
    // declared closed.
    {
      const p = this.players.get(sender.id);
      if (p) p.lastTouchAt = Date.now();
    }

    if (msg.type === 'join') {
      this.spawnPlayer(sender.id, msg.name, msg.character, msg.color, msg.hue ?? 0, msg.country);
    } else if (msg.type === 'input') {
      const p = this.players.get(sender.id);
      if (p && p.alive) {
        const len = Math.hypot(msg.dx, msg.dy);
        p.input.dx = len > 0 ? msg.dx / len : 0;
        p.input.dy = len > 0 ? msg.dy / len : 0;
        if (Math.abs(p.input.dx) > Math.abs(p.input.dy)) {
          p.facing = p.input.dx > 0 ? 'east' : p.input.dx < 0 ? 'west' : p.facing;
        } else if (p.input.dy !== 0) {
          p.facing = p.input.dy > 0 ? 'south' : 'north';
        }
        // Moving cancels invuln immediately — but only when not in a level-up choice.
        if (len > 0 && p.pendingChoices.length === 0 && p.invulnerableUntil > Date.now()) {
          p.invulnerableUntil = 0;
        }
      }
    } else if (msg.type === 'pickPowerup') {
      const p = this.players.get(sender.id);
      if (p && p.pendingChoices.length > 0) {
        const choices = p.pendingChoices.shift()!;
        const choice = choices[msg.choiceIdx];
        if (choice) {
          const powerup = POWERUPS.find((pw) => pw.id === choice.id);
          if (powerup) powerup.apply(p);
        }
        p.pendingLevelUps = p.pendingChoices.length;
        if (p.pendingChoices.length > 0) {
          // Still more level-ups pending — keep the shield up for the next pick
          this.sendLevelUp(sender.id, p.level, p.pendingChoices[0]);
        } else {
          // All choices picked — end invulnerability immediately so combat resumes
          p.invulnerableUntil = 0;
        }
      }
    } else if (msg.type === 'respawn') {
      const p = this.players.get(sender.id);
      if (p && !p.alive) {
        this.respawnPlayer(p);
      }
    }
  }

  spawnPlayer(id: string, name: string, character: CharacterKind, color: number, hue: number, country?: string) {
    const base = CHARACTER_BASES[character] ?? CHARACTER_BASES.blue_wizard;
    const maxHp = Math.round(PLAYER_BASE_HP * base.hpMul);
    const safeName = isBlockedName(name) ? 'Player' : (name || 'Player').slice(0, 16);
    const player: ServerPlayer = {
      id,
      name: safeName,
      character,
      color: color | 0,
      hue: hue || 0,
      country: country?.slice(0, 2).toUpperCase(),
      x: ARENA_WIDTH / 2 + (Math.random() - 0.5) * 200,
      y: ARENA_HEIGHT / 2 + (Math.random() - 0.5) * 200,
      hp: maxHp,
      maxHp,
      level: 1,
      xp: 0,
      xpToNext: XP_FOR_LEVEL(1),
      alive: true,
      facing: 'south',
      damageMul: 1,
      speedMul: base.speedMul,
      pickupMul: 1,
      cooldownMul: 1,
      weapons: [base.weapon],
      waveNumber: 0,
      waveName: '',
      waveTimeLeftMs: 0,
      invulnerableUntil: Date.now() + SPAWN_INVULN_MS,
      projectileBonus: 0,
      bigHitMul: 1,
      splashRadius: 0,
      vampireFraction: 0,
      regenPerSec: 0,
      critChance: 0,
      pierceCount: 0,
      frostAuraDmg: 0,
      frostAuraRadius: 0,
      xpMul: 1,
      projectileLifeMul: 1,
      timeShieldEnabled: false,
      damageImmuneUntil: 0,
      lightningStrikeEnabled: false,
      meteorShowerEnabled: false,
      frostNovaEnabled: false,
      holySmiteEnabled: false,
      blackHoleEnabled: false,
      phoenixRebirthEnabled: false,
      phoenixUsed: false,
      chainReactionEnabled: false,
      missileBarrageEnabled: false,
      earthquakeEnabled: false,
      spiritWolvesEnabled: false,
      spiritWolfCount: 0,
      bloodbathEnabled: false,
      soulHarvestEnabled: false,
      soulHarvestStacks: 0,
      trailOfFireEnabled: false,
      timeStopEnabled: false,
      auraShieldRangeMul: 1,
      trailDurationMul: 1,
      frostNovaRadiusMul: 1,
      lightningCooldownMul: 1,
      pendingLevelUps: 0,
      input: { dx: 0, dy: 0 },
      weaponCooldowns: {},
      lastTouchAt: Date.now(),
      nextTimeShieldAt: 0,
      nextLightningAt: 0,
      nextMeteorAt: 0,
      nextFrostNovaAt: 0,
      nextHolySmiteAt: 0,
      nextBlackHoleAt: 0,
      nextMissileAt: 0,
      nextEarthquakeAt: 0,
      nextTimeStopAt: 0,
      trailBreadcrumbs: [],
      trailLastDropAt: 0,
      pendingChoices: [],
      pwWaveStartedAt: 0,
      pwWaveActive: false,
      pwWaveSpawnedSoFar: 0,
      pwWaveTotal: 0,
      pwWaveLastTrickleAt: 0,
      pwWaveAnchors: [],
      pwWaveKind: 'goblin',
      pwWaveAi: 'chase',
      pwBonusBearTarget: 0,
      pwBonusBearsSpawned: 0,
      pwBonusBearLastAt: 0,
      pwBonusRatTarget: 0,
      pwBonusRatsSpawned: 0,
      pwBonusRatLastAt: 0,
      pwAuraLastHits: new Map(),
      inSlowZone: false,
    };
    this.players.set(id, player);
    // Defensive: if a Durable Object woke from hibernation and lost the tick
    // interval (but kept WebSocket connections), the next join will restart it.
    if (!this.tickHandle) this.startTicking();
  }

  respawnPlayer(p: ServerPlayer) {
    const base = CHARACTER_BASES[p.character];
    const maxHp = Math.round(PLAYER_BASE_HP * base.hpMul);
    p.hp = maxHp;
    p.maxHp = maxHp;
    p.level = 1;
    p.xp = 0;
    p.xpToNext = XP_FOR_LEVEL(1);
    p.alive = true;
    p.damageMul = 1;
    p.speedMul = base.speedMul;
    p.pickupMul = 1;
    p.cooldownMul = 1;
    p.weapons = [base.weapon];
    p.invulnerableUntil = Date.now() + SPAWN_INVULN_MS;
    p.projectileBonus = 0;
    p.bigHitMul = 1;
    p.splashRadius = 0;
    p.vampireFraction = 0;
    p.regenPerSec = 0;
    p.critChance = 0;
    p.pierceCount = 0;
    p.frostAuraDmg = 0;
    p.frostAuraRadius = 0;
    p.xpMul = 1;
    p.projectileLifeMul = 1;
    p.timeShieldEnabled = false;
    p.damageImmuneUntil = 0;
    p.nextTimeShieldAt = 0;
    p.lightningStrikeEnabled = false;
    p.nextLightningAt = 0;
    p.meteorShowerEnabled = false;
    p.nextMeteorAt = 0;
    p.frostNovaEnabled = false;
    p.nextFrostNovaAt = 0;
    p.holySmiteEnabled = false;
    p.nextHolySmiteAt = 0;
    p.blackHoleEnabled = false;
    p.nextBlackHoleAt = 0;
    p.phoenixRebirthEnabled = false;
    p.phoenixUsed = false;
    p.chainReactionEnabled = false;
    p.missileBarrageEnabled = false;
    p.nextMissileAt = 0;
    p.earthquakeEnabled = false;
    p.nextEarthquakeAt = 0;
    p.spiritWolvesEnabled = false;
    p.spiritWolfCount = 0;
    p.bloodbathEnabled = false;
    p.soulHarvestEnabled = false;
    p.soulHarvestStacks = 0;
    p.trailOfFireEnabled = false;
    p.trailBreadcrumbs = [];
    p.trailLastDropAt = 0;
    p.timeStopEnabled = false;
    p.nextTimeStopAt = 0;
    p.auraShieldRangeMul = 1;
    p.trailDurationMul = 1;
    p.frostNovaRadiusMul = 1;
    p.lightningCooldownMul = 1;
    // Despawn this player's wolves on death/respawn
    for (const [wid, w] of this.wolves) {
      if (w.ownerId === p.id) this.wolves.delete(wid);
    }
    p.pendingChoices = [];
    p.pendingLevelUps = 0;
    p.x = ARENA_WIDTH / 2 + (Math.random() - 0.5) * 200;
    p.y = ARENA_HEIGHT / 2 + (Math.random() - 0.5) * 200;
  }

  startTicking() {
    this.lastTickAt = Date.now();
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }
  stopTicking() {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.players.clear();
    this.npcs.clear();
    this.gems.clear();
    this.projectiles.clear();
    this.blackHoles.clear();
    this.wolves.clear();
  }

  // Spirit Wolves: spawn 2 wolves per player who has the powerup, then tick AI.
  // Each wolf orbits its owner; if a foe enters its detection radius, it lunges
  // and deals contact damage, then returns to orbit on a brief cooldown.
  updateWolves(dt: number, now: number) {
    // Ensure each enabled player has exactly spiritWolfCount wolves (1..3).
    // If the count goes down (shouldn't happen via gameplay) we trim extras.
    for (const p of this.players.values()) {
      if (!p.alive || !p.spiritWolvesEnabled) continue;
      const desired = Math.max(1, Math.min(3, p.spiritWolfCount || 1));
      const owned: ServerWolf[] = [];
      for (const w of this.wolves.values()) if (w.ownerId === p.id) owned.push(w);
      while (owned.length < desired) {
        const id = genId('wolf');
        const w: ServerWolf = {
          id,
          ownerId: p.id,
          x: p.x,
          y: p.y,
          state: 'orbit',
          orbitAngle: Math.random() * Math.PI * 2,
          orbitOffset: 0, // recomputed below to spread evenly
          targetId: null,
          cooldownUntil: 0,
          lastDamageAt: 0,
        };
        this.wolves.set(id, w);
        owned.push(w);
      }
      while (owned.length > desired) {
        const w = owned.pop()!;
        this.wolves.delete(w.id);
      }
      // Spread orbit offsets evenly so wolves are equidistant around the player.
      for (let i = 0; i < owned.length; i++) {
        owned[i].orbitOffset = (i / owned.length) * Math.PI * 2;
      }
    }
    // Despawn wolves whose owner is missing or dead
    for (const [id, w] of this.wolves) {
      const owner = this.players.get(w.ownerId);
      if (!owner || !owner.alive || !owner.spiritWolvesEnabled) {
        this.wolves.delete(id);
      }
    }

    const ORBIT_RADIUS = 60;
    const ORBIT_SPEED = 2.4; // rad/s
    const DETECT_RADIUS = 220;
    const LUNGE_SPEED = 360;
    const HIT_RADIUS = 18;

    for (const w of this.wolves.values()) {
      const owner = this.players.get(w.ownerId);
      if (!owner) continue;

      if (w.state === 'cooldown') {
        if (now >= w.cooldownUntil) {
          w.state = 'orbit';
          w.targetId = null;
        } else {
          // Glide back toward orbit position while cooling down
          w.orbitAngle += ORBIT_SPEED * dt;
          const tx = owner.x + Math.cos(w.orbitAngle + w.orbitOffset) * ORBIT_RADIUS;
          const ty = owner.y + Math.sin(w.orbitAngle + w.orbitOffset) * ORBIT_RADIUS;
          w.x += (tx - w.x) * 0.18;
          w.y += (ty - w.y) * 0.18;
          continue;
        }
      }

      if (w.state === 'orbit') {
        w.orbitAngle += ORBIT_SPEED * dt;
        const tx = owner.x + Math.cos(w.orbitAngle + w.orbitOffset) * ORBIT_RADIUS;
        const ty = owner.y + Math.sin(w.orbitAngle + w.orbitOffset) * ORBIT_RADIUS;
        w.x += (tx - w.x) * 0.20;
        w.y += (ty - w.y) * 0.20;
        // Look for a target in detection radius (around the wolf)
        let bestId: string | null = null;
        let bestD2 = DETECT_RADIUS * DETECT_RADIUS;
        for (const n of this.npcs.values()) {
          const d2 = (n.x - w.x) ** 2 + (n.y - w.y) ** 2;
          if (d2 < bestD2) { bestD2 = d2; bestId = n.id; }
        }
        if (bestId) {
          w.state = 'lunge';
          w.targetId = bestId;
        }
        continue;
      }

      if (w.state === 'lunge') {
        const target = w.targetId ? this.npcs.get(w.targetId) : null;
        if (!target) {
          w.state = 'orbit';
          w.targetId = null;
          continue;
        }
        const dx = target.x - w.x;
        const dy = target.y - w.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < HIT_RADIUS) {
          // Bite!
          const dmg = 18 * owner.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, owner.level - 1) * LEVEL_DAMAGE_MUL);
          target.hp -= dmg;
          this.applyVampire(owner, dmg);
          if (target.hp <= 0) this.killNPC(target.id, owner.id);
          w.state = 'cooldown';
          w.cooldownUntil = now + 600;
          w.lastDamageAt = now;
          w.targetId = null;
        } else {
          w.x += (dx / dist) * LUNGE_SPEED * dt;
          w.y += (dy / dist) * LUNGE_SPEED * dt;
        }
      }
    }
  }

  // Tick black holes: damage NPCs in range every 300ms and prune expired ones.
  // Pull is handled in updateNPCs; this only deals damage and lifetime.
  updateBlackHoles(now: number) {
    for (const bh of [...this.blackHoles.values()]) {
      if (now >= bh.expiresAt) {
        this.blackHoles.delete(bh.id);
        continue;
      }
      if (now - bh.lastTickDamageAt < 300) continue;
      bh.lastTickDamageAt = now;
      const owner = this.players.get(bh.ownerId);
      const dr2 = bh.damageRadius * bh.damageRadius;
      for (const n of this.npcs.values()) {
        const d2 = (n.x - bh.x) ** 2 + (n.y - bh.y) ** 2;
        if (d2 < dr2) {
          n.hp -= bh.damage;
          if (owner) this.applyVampire(owner, bh.damage);
          if (n.hp <= 0) this.killNPC(n.id, bh.ownerId);
        }
      }
    }
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickAt) / 1000, 0.1);
    this.lastTickAt = now;

    this.reapZombiePlayers();
    this.updatePlayers(dt, now);
    this.updateProjectiles(dt);
    this.runWaves(now);
    this.maybeSpawnDragon(now);
    this.retargetDragon();
    this.maybeSpawnBoss(now);
    this.updateNPCs(dt, now);
    this.updateBlackHoles(now);
    this.updateWolves(dt, now);
    this.updateGems();
    this.scheduleHazard(now);
    this.updateHazards(now);

    this.broadcastSnapshot(now);
  }

  // Cloudflare hibernation can leave phantom players in our map: their
  // WebSocket disconnected without firing onClose, but PartyKit's hibernating
  // connection list might still include them. Two-pronged cleanup:
  //  1. Drop players whose connection is gone from getConnections().
  //  2. Drop players who haven't sent any message in ZOMBIE_TIMEOUT_MS — they
  //     might still appear "live" to PartyKit but are effectively gone.
  reapZombiePlayers() {
    if (this.players.size === 0) return;
    const live = new Set<string>();
    for (const c of this.room.getConnections()) live.add(c.id);
    const now = Date.now();
    const ZOMBIE_TIMEOUT_MS = 60_000;
    for (const [id, p] of this.players) {
      const noConn = !live.has(id);
      const idle = now - p.lastTouchAt > ZOMBIE_TIMEOUT_MS;
      if (noConn || idle) {
        this.players.delete(id);
        for (const [wid, w] of this.wolves) if (w.ownerId === id) this.wolves.delete(wid);
      }
    }
  }

  updatePlayers(dt: number, now: number) {
    const wallNow = Date.now();
    void now;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const speed = PLAYER_SPEED * p.speedMul * (p.inSlowZone ? 0.45 : 1);
      p.x = clamp(p.x + p.input.dx * speed * dt, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
      p.y = clamp(p.y + p.input.dy * speed * dt, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);

      // passive HP regen always allowed
      if (p.regenPerSec > 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.regenPerSec * dt);
      }

      // Time Shield — defensive, ticks regardless of invuln. Every 30s, 5s of damage immunity.
      if (p.timeShieldEnabled && wallNow >= p.nextTimeShieldAt) {
        p.damageImmuneUntil = wallNow + 5000;
        p.nextTimeShieldAt = wallNow + 30000;
      }

      // While invulnerable (level-up choice / spawn), the player can't deal damage.
      // This prevents the "stay invuln + keep killing" exploit during the choice modal.
      const isInvuln = wallNow < p.invulnerableUntil;
      if (isInvuln) continue;

      // Lightning Strike — every 4s (× cooldown multiplier), smite a random nearby NPC.
      if (p.lightningStrikeEnabled && wallNow >= p.nextLightningAt) {
        const target = this.pickRandomNearbyNpc(p, 520);
        if (target) {
          const baseDmg = 28 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
          const r2 = 70 * 70;
          for (const n of this.npcs.values()) {
            const d2 = (n.x - target.x) ** 2 + (n.y - target.y) ** 2;
            if (d2 < r2) {
              n.hp -= baseDmg;
              this.applyVampire(p, baseDmg);
              if (n.hp <= 0) this.killNPC(n.id, p.id);
            }
          }
          const fx: ServerToClient = { type: 'effect', effect: 'lightning', x: target.x, y: target.y };
          this.room.broadcast(JSON.stringify(fx));
        }
        p.nextLightningAt = wallNow + 4000 * (p.lightningCooldownMul || 1);
      }

      // Meteor Shower — every 8s, 3 meteors fall on random nearby NPCs (staggered for screen impact).
      if (p.meteorShowerEnabled && wallNow >= p.nextMeteorAt) {
        const baseDmg = 24 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
        const aoeR2 = 80 * 80;
        for (let i = 0; i < 3; i++) {
          const target = this.pickRandomNearbyNpc(p, 600);
          if (!target) break;
          // Slight stagger so meteors don't all explode the same tick visually
          setTimeout(() => {
            for (const n of this.npcs.values()) {
              const d2 = (n.x - target.x) ** 2 + (n.y - target.y) ** 2;
              if (d2 < aoeR2) {
                n.hp -= baseDmg;
                this.applyVampire(p, baseDmg);
                if (n.hp <= 0) this.killNPC(n.id, p.id);
              }
            }
            const fx: ServerToClient = { type: 'effect', effect: 'meteor', x: target.x, y: target.y };
            this.room.broadcast(JSON.stringify(fx));
          }, i * 220);
        }
        p.nextMeteorAt = wallNow + 8000;
      }

      // Frost Nova — every 6s, expanding ring around player damages + slows nearby foes.
      if (p.frostNovaEnabled && wallNow >= p.nextFrostNovaAt) {
        const radius = 160 * (p.frostNovaRadiusMul || 1);
        const r2 = radius * radius;
        const baseDmg = 16 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
        for (const n of this.npcs.values()) {
          const d2 = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
          if (d2 < r2) {
            n.hp -= baseDmg;
            this.applyVampire(p, baseDmg);
            // Slow effect: 40% speed for 1.5s
            n.slowUntil = Math.max(n.slowUntil, wallNow + 1500);
            n.slowMul = 0.4;
            if (n.hp <= 0) this.killNPC(n.id, p.id);
          }
        }
        const fx: ServerToClient = { type: 'effect', effect: 'frostNova', x: p.x, y: p.y, radius };
        this.room.broadcast(JSON.stringify(fx));
        p.nextFrostNovaAt = wallNow + 6000;
      }

      // Holy Smite — every 5s, a single column of light vaporises one random nearby NPC.
      if (p.holySmiteEnabled && wallNow >= p.nextHolySmiteAt) {
        const target = this.pickRandomNearbyNpc(p, 480);
        if (target) {
          const baseDmg = 60 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
          target.hp -= baseDmg;
          this.applyVampire(p, baseDmg);
          if (target.hp <= 0) this.killNPC(target.id, p.id);
          const fx: ServerToClient = { type: 'effect', effect: 'holySmite', x: target.x, y: target.y };
          this.room.broadcast(JSON.stringify(fx));
        }
        p.nextHolySmiteAt = wallNow + 5000;
      }

      // Black Hole — every 18s, spawn a 3-second vortex near a random nearby foe.
      if (p.blackHoleEnabled && wallNow >= p.nextBlackHoleAt) {
        const target = this.pickRandomNearbyNpc(p, 400);
        const cx = target?.x ?? p.x;
        const cy = target?.y ?? p.y;
        const durationMs = 3000;
        const id = genId('bh');
        this.blackHoles.set(id, {
          id,
          ownerId: p.id,
          x: cx, y: cy,
          spawnedAt: wallNow,
          expiresAt: wallNow + durationMs,
          damage: 8 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL),
          pullRadius: 220,
          pullStrength: 220,
          damageRadius: 100,
          lastTickDamageAt: 0,
        });
        const fx: ServerToClient = { type: 'effect', effect: 'blackHole', x: cx, y: cy, durationMs };
        this.room.broadcast(JSON.stringify(fx));
        p.nextBlackHoleAt = wallNow + 18000;
      }

      // Missile Barrage — every 12s, spawn 8 homing missiles at the 8 nearest NPCs.
      if (p.missileBarrageEnabled && wallNow >= p.nextMissileAt) {
        const candidates: { x: number; y: number; d2: number }[] = [];
        for (const n of this.npcs.values()) {
          const d2 = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
          if (d2 < 600 * 600) candidates.push({ x: n.x, y: n.y, d2 });
        }
        candidates.sort((a, b) => a.d2 - b.d2);
        const targets = candidates.slice(0, 8);
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          const angle = Math.atan2(t.y - p.y, t.x - p.x);
          const speed = 240;
          // Slight angular spread so missiles don't all overlap initially
          const spread = (i - (targets.length - 1) / 2) * 0.18;
          const a = angle + spread;
          const proj: ServerProjectile = {
            id: genId('proj'),
            ownerId: p.id,
            x: p.x,
            y: p.y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            weapon: 'shadow_bolt', // reuse homing pattern + shadow visual
            lifetime: 2200,
            piercesLeft: 0,
            pattern: 'homing',
          };
          this.projectiles.set(proj.id, proj);
        }
        p.nextMissileAt = wallNow + 12000;
      }

      // Time Stop — every 25s, freeze foes within 600px of the player for 2s.
      if (p.timeStopEnabled && wallNow >= p.nextTimeStopAt) {
        const r2 = 600 * 600;
        for (const n of this.npcs.values()) {
          if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 < r2) {
            n.freezeUntil = Math.max(n.freezeUntil, wallNow + 2000);
          }
        }
        const fx: ServerToClient = { type: 'effect', effect: 'timeStop', x: p.x, y: p.y, radius: 600 };
        this.room.broadcast(JSON.stringify(fx));
        p.nextTimeStopAt = wallNow + 25000;
      }

      // Trail of Fire — drop a breadcrumb every 100ms while moving; each
      // breadcrumb damages NPCs that touch it (once per breadcrumb per NPC).
      if (p.trailOfFireEnabled) {
        const moving = (p.input.dx * p.input.dx + p.input.dy * p.input.dy) > 0.01;
        if (moving && wallNow - p.trailLastDropAt >= 100) {
          p.trailLastDropAt = wallNow;
          p.trailBreadcrumbs.push({ x: p.x, y: p.y, expiresAt: wallNow + 2000 * (p.trailDurationMul || 1), hitNpcs: new Set() });
        }
        // prune expired
        p.trailBreadcrumbs = p.trailBreadcrumbs.filter((b) => b.expiresAt > wallNow);
        // damage NPCs touching breadcrumbs
        if (p.trailBreadcrumbs.length > 0) {
          const dmg = 10 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
          const r2 = 28 * 28;
          for (const b of p.trailBreadcrumbs) {
            for (const n of this.npcs.values()) {
              if (b.hitNpcs.has(n.id)) continue;
              if ((n.x - b.x) ** 2 + (n.y - b.y) ** 2 < r2) {
                b.hitNpcs.add(n.id);
                n.hp -= dmg;
                this.applyVampire(p, dmg);
                if (n.hp <= 0) this.killNPC(n.id, p.id);
              }
            }
          }
        }
      }

      // Earthquake — every 12s, shockwave around the player damages and pushes
      // back foes within 200px.
      if (p.earthquakeEnabled && wallNow >= p.nextEarthquakeAt) {
        const radius = 200;
        const r2 = radius * radius;
        const baseDmg = 24 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
        for (const n of this.npcs.values()) {
          const dx = n.x - p.x;
          const dy = n.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 && d2 > 1) {
            n.hp -= baseDmg;
            this.applyVampire(p, baseDmg);
            // Knockback: shove outward by a fixed distance, scaled by how close
            // the foe is to the center (closer = bigger push).
            const dist = Math.sqrt(d2);
            const kb = 80 * (1 - dist / radius);
            n.x += (dx / dist) * kb;
            n.y += (dy / dist) * kb;
            if (n.hp <= 0) this.killNPC(n.id, p.id);
          }
        }
        const fx: ServerToClient = { type: 'effect', effect: 'earthquake', x: p.x, y: p.y, radius };
        this.room.broadcast(JSON.stringify(fx));
        p.nextEarthquakeAt = wallNow + 12000;
      }

      // weapon cooldowns -> auto-fire (skip 0-cooldown passive weapons like aura)
      for (const w of p.weapons) {
        const def = WEAPON_DEFS[w];
        if (def.cooldownMs <= 0) continue; // aura_shield is handled below
        const cd = (p.weaponCooldowns[w] ?? 0) - dt * 1000;
        if (cd <= 0) {
          this.fireWeapon(p, w);
          p.weaponCooldowns[w] = def.cooldownMs * p.cooldownMul;
        } else {
          p.weaponCooldowns[w] = cd;
        }
      }

      // Aura Shield (skipped during invuln above)
      if (p.weapons.includes('aura_shield')) {
        const def = WEAPON_DEFS.aura_shield;
        const range = def.range * (p.auraShieldRangeMul || 1);
        const r2 = range * range;
        const tNow = Date.now();
        for (const n of this.npcs.values()) {
          if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 < r2) {
            const last = p.pwAuraLastHits.get(n.id) ?? 0;
            if (tNow - last >= 350) {
              p.pwAuraLastHits.set(n.id, tNow);
              const dmg = this.computeDamage(p, 'aura_shield');
              n.hp -= dmg;
              this.applyVampire(p, dmg);
              if (n.hp <= 0) this.killNPC(n.id, p.id);
            }
          }
        }
      }

      // Frost aura (skipped during invuln above)
      if (p.frostAuraDmg > 0 && p.frostAuraRadius > 0) {
        const r2 = p.frostAuraRadius * p.frostAuraRadius;
        const dmg = p.frostAuraDmg * dt;
        for (const n of this.npcs.values()) {
          if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 < r2) {
            n.hp -= dmg;
            if (n.hp <= 0) this.killNPC(n.id, p.id);
          }
        }
      }
    }
  }

  fireWeapon(p: ServerPlayer, w: WeaponKind) {
    const def = WEAPON_DEFS[w];
    const pattern = WEAPON_PATTERN[w];

    // Orbital spawns N projectiles spaced evenly around the player; doesn't need a target.
    if (pattern === 'orbital') {
      const totalProjectiles = def.projectiles + p.projectileBonus;
      if (this.projectiles.size + totalProjectiles > MAX_PROJECTILES) {
        let toEvict = this.projectiles.size + totalProjectiles - MAX_PROJECTILES;
        for (const key of this.projectiles.keys()) {
          this.projectiles.delete(key);
          if (--toEvict <= 0) break;
        }
      }
      const lifetime = 4500; // orbits for 4.5s
      const orbitRadius = 80;
      const spinSpeed = 3; // rad/sec
      for (let i = 0; i < totalProjectiles; i++) {
        const initAngle = (i / totalProjectiles) * Math.PI * 2;
        const proj: ServerProjectile = {
          id: genId('proj'),
          ownerId: p.id,
          x: p.x + Math.cos(initAngle) * orbitRadius,
          y: p.y + Math.sin(initAngle) * orbitRadius,
          vx: 0, vy: 0,
          weapon: w,
          lifetime,
          piercesLeft: 999, // orbitals don't get consumed
          pattern: 'orbital',
          orbitAngle: initAngle,
          orbitSpinSpeed: spinSpeed,
          orbitRadius,
          hitCooldowns: new Map(),
        };
        this.projectiles.set(proj.id, proj);
      }
      return;
    }

    // All other weapons need a target
    const target = this.findNearestTarget(p, def.range);
    if (!target) return;
    const totalProjectiles = def.projectiles + p.projectileBonus;
    if (this.projectiles.size + totalProjectiles > MAX_PROJECTILES) {
      let toEvict = this.projectiles.size + totalProjectiles - MAX_PROJECTILES;
      for (const key of this.projectiles.keys()) {
        this.projectiles.delete(key);
        if (--toEvict <= 0) break;
      }
    }
    const spread = totalProjectiles > 1 ? WEAPON_SPREAD[w] : 0;
    const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
    for (let i = 0; i < totalProjectiles; i++) {
      const angle = baseAngle + (i - (totalProjectiles - 1) / 2) * spread;
      const vx = Math.cos(angle) * def.speed;
      const vy = Math.sin(angle) * def.speed;
      const proj: ServerProjectile = {
        id: genId('proj'),
        ownerId: p.id,
        x: p.x,
        y: p.y,
        vx, vy,
        weapon: w,
        lifetime: PROJECTILE_LIFETIME_MS * p.projectileLifeMul,
        piercesLeft: p.pierceCount,
        pattern,
      };
      if (pattern === 'wave') {
        // perpendicular axis for sinusoidal offset (rotate velocity 90°, normalize)
        const speed = Math.hypot(vx, vy) || 1;
        proj.baseX = p.x;
        proj.baseY = p.y;
        proj.perpX = -vy / speed;
        proj.perpY = vx / speed;
        proj.waveTime = i * 0.15; // phase offset between bolts so they don't overlap
      }
      this.projectiles.set(proj.id, proj);
    }
  }

  computeDamage(owner: ServerPlayer | undefined, w: WeaponKind): number {
    const base = WEAPON_DEFS[w].damage;
    const dmgMul = owner?.damageMul ?? 1;
    // Capped per-level scaling — late game stops snowballing.
    const cappedLvl = Math.min(LEVEL_DAMAGE_CAP_LEVELS, ((owner?.level ?? 1) - 1));
    const lvlMul = 1 + cappedLvl * LEVEL_DAMAGE_MUL;
    let dmg = base * dmgMul * lvlMul;
    // Bloodbath: flat +30% while below 30% HP. Capped — does not stack.
    if (owner?.bloodbathEnabled && owner.maxHp > 0 && owner.hp / owner.maxHp < 0.3) {
      dmg *= 1.3;
    }
    // Soul Harvest: each kill adds a 0.1% stack (capped at 500 = +50%).
    if (owner?.soulHarvestEnabled && owner.soulHarvestStacks > 0) {
      dmg *= 1 + Math.min(500, owner.soulHarvestStacks) * 0.001;
    }
    const crit = owner?.critChance ?? 0;
    if (crit > 0 && Math.random() < crit) dmg *= 2;
    return dmg;
  }

  pickRandomNearbyNpc(p: ServerPlayer, maxDist: number): (NPCState & { speed: number; lastHitAt: number; baseHp: number; ownerPlayerId: string }) | null {
    const candidates: ((NPCState & { speed: number; lastHitAt: number; baseHp: number; ownerPlayerId: string }))[] = [];
    const r2 = maxDist * maxDist;
    for (const n of this.npcs.values()) {
      if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 < r2) candidates.push(n);
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  applyVampire(owner: ServerPlayer | undefined, dmgDealt: number) {
    if (!owner || !owner.alive) return;
    const frac = owner.vampireFraction;
    if (frac > 0) {
      owner.hp = Math.min(owner.maxHp, owner.hp + dmgDealt * frac);
    }
  }

  applySplash(originX: number, originY: number, owner: ServerPlayer | undefined, baseDmg: number) {
    const radius = owner?.splashRadius ?? 0;
    if (radius <= 0) return;
    const r2 = radius * radius;
    const splashDmg = baseDmg * 0.5;
    for (const n of this.npcs.values()) {
      const d2 = (n.x - originX) ** 2 + (n.y - originY) ** 2;
      if (d2 < r2) {
        n.hp -= splashDmg;
        this.applyVampire(owner, splashDmg);
        if (n.hp <= 0) this.killNPC(n.id, owner?.id);
      }
    }
  }

  findNearestTarget(from: ServerPlayer, range: number): { x: number; y: number } | null {
    // Co-op mode: only target NPCs, never other players
    let best: { x: number; y: number } | null = null;
    let bestD2 = range * range;
    for (const n of this.npcs.values()) {
      const d2 = (n.x - from.x) ** 2 + (n.y - from.y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { x: n.x, y: n.y };
      }
    }
    void from;
    return best;
  }

  updateProjectiles(dt: number) {
    const now = Date.now();
    for (const proj of this.projectiles.values()) {
      // ---- Movement per pattern ----
      if (proj.pattern === 'orbital') {
        const owner = this.players.get(proj.ownerId);
        if (!owner || !owner.alive) {
          this.projectiles.delete(proj.id);
          continue;
        }
        proj.orbitAngle = (proj.orbitAngle ?? 0) + (proj.orbitSpinSpeed ?? 3) * dt;
        proj.x = owner.x + Math.cos(proj.orbitAngle) * (proj.orbitRadius ?? 80);
        proj.y = owner.y + Math.sin(proj.orbitAngle) * (proj.orbitRadius ?? 80);
      } else if (proj.pattern === 'homing') {
        // Gradually turn velocity toward nearest NPC within search range
        let bestN: { x: number; y: number } | null = null;
        let bestD2 = 320 * 320;
        for (const n of this.npcs.values()) {
          const d2 = (n.x - proj.x) ** 2 + (n.y - proj.y) ** 2;
          if (d2 < bestD2) { bestD2 = d2; bestN = n; }
        }
        if (bestN) {
          const desired = Math.atan2(bestN.y - proj.y, bestN.x - proj.x);
          const cur = Math.atan2(proj.vy, proj.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = 4.5 * dt; // rad/sec turn rate
          const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
          const newAngle = cur + turn;
          const speed = Math.hypot(proj.vx, proj.vy);
          proj.vx = Math.cos(newAngle) * speed;
          proj.vy = Math.sin(newAngle) * speed;
        }
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
      } else if (proj.pattern === 'wave') {
        proj.baseX! += proj.vx * dt;
        proj.baseY! += proj.vy * dt;
        proj.waveTime! += dt;
        const offset = Math.sin(proj.waveTime! * 12) * 22;
        proj.x = proj.baseX! + (proj.perpX ?? 0) * offset;
        proj.y = proj.baseY! + (proj.perpY ?? 0) * offset;
      } else {
        // straight
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
      }

      proj.lifetime -= dt * 1000;
      if (
        proj.lifetime <= 0 ||
        proj.x < 0 || proj.x > ARENA_WIDTH ||
        proj.y < 0 || proj.y > ARENA_HEIGHT
      ) {
        this.projectiles.delete(proj.id);
        continue;
      }
      // hit NPC (collision radius scales with owner's bigHitMul)
      let consumed = false;
      const owner0 = this.players.get(proj.ownerId);
      const collR = NPC_RADIUS + PROJECTILE_RADIUS * (owner0?.bigHitMul ?? 1);
      const collR2 = collR * collR;
      const hitNpcs = new Set<string>();
      for (const n of this.npcs.values()) {
        if (hitNpcs.has(n.id)) continue;
        if ((n.x - proj.x) ** 2 + (n.y - proj.y) ** 2 < collR2) {
          // Orbitals have a per-NPC hit cooldown (don't drain HP every tick)
          if (proj.pattern === 'orbital') {
            const last = proj.hitCooldowns?.get(n.id) ?? 0;
            if (now - last < 500) continue;
            proj.hitCooldowns?.set(n.id, now);
          }
          const dmg = this.computeDamage(owner0, proj.weapon);
          n.hp -= dmg;
          this.applyVampire(owner0, dmg);
          if (n.hp <= 0) this.killNPC(n.id, owner0?.id);
          this.applySplash(proj.x, proj.y, owner0, dmg);
          hitNpcs.add(n.id);
          if (proj.pattern === 'orbital') {
            // orbitals never consume — they keep spinning
            continue;
          }
          if (proj.piercesLeft > 0) {
            proj.piercesLeft -= 1;
            continue;
          }
          consumed = true;
          break;
        }
      }
      if (consumed) {
        this.projectiles.delete(proj.id);
        continue;
      }
      // Co-op: friendly fire is disabled. Projectiles pass through other players.
      if (consumed) this.projectiles.delete(proj.id);
    }
  }

  // Per-player wave system: each player has their own horde scaled to their level.
  runWaves(now: number) {
    if (this.npcs.size >= NPC_MAX_COUNT) return;
    for (const p of this.players.values()) {
      this.runWaveForPlayer(p, now);
    }
  }

  runWaveForPlayer(p: ServerPlayer, now: number) {
    if (this.npcs.size >= NPC_MAX_COUNT) return;
    if (!p.alive) return;

    if (!p.pwWaveActive) {
      const cooldownDone =
        p.waveNumber === 0 || now - p.pwWaveStartedAt >= WAVE_DURATION_MS + WAVE_COOLDOWN_MS;
      if (!cooldownDone) return;
      p.waveNumber += 1;
      p.pwWaveActive = true;
      p.pwWaveStartedAt = now;
      // Wave size scales with this player's level (not avg)
      const lvlBonus = Math.floor((p.level - 1) * 2);
      p.pwWaveTotal = WAVE_BASE_SIZE + WAVE_GROWTH * (p.waveNumber - 1) + lvlBonus;
      p.pwWaveSpawnedSoFar = 0;
      p.pwWaveLastTrickleAt = now;
      const theme = themeForWave(p.waveNumber);
      p.pwWaveKind = theme.kind;
      p.waveName = theme.name;
      // Wave AI roll: most waves chase normally, ~20% get varied behavior.
      // Boss waves stay 'chase' since they're already distinctive.
      const tier = MONSTER_BASES[theme.kind].tier;
      if (tier === 'boss') {
        p.pwWaveAi = 'chase';
      } else {
        const r = Math.random();
        p.pwWaveAi = r < 0.10 ? 'regroup' : r < 0.20 ? 'flank' : 'chase';
      }
      // Boss-style waves cap their spawn count (e.g. only 3 zombie bears).
      const sizeOverride = MONSTER_WAVE_SIZE_OVERRIDE[theme.kind];
      if (sizeOverride !== undefined) p.pwWaveTotal = sizeOverride;
      // Spawn anchors are positioned around THIS player (not random arena edges)
      p.pwWaveAnchors = pickAnchorsAround(p.x, p.y, WAVE_ANCHORS_AT(p.waveNumber));

      // High-wave bonus injection targets. These spawn ALONGSIDE the regular
      // wave theme as extras — they don't replace anything, they just pile on.
      // Bears: from wave 15+, +1 per 5 waves, capped at 6.
      // Rats:  from wave 10+, +1.5 per wave, capped at 30.
      p.pwBonusBearTarget = Math.min(6, Math.max(0, Math.floor((p.waveNumber - 15) / 5)));
      p.pwBonusRatTarget = Math.min(30, Math.max(0, Math.floor((p.waveNumber - 10) * 1.5)));
      p.pwBonusBearsSpawned = 0;
      p.pwBonusRatsSpawned = 0;
      p.pwBonusBearLastAt = now;
      p.pwBonusRatLastAt = now;

      const initial = Math.max(1, Math.floor(p.pwWaveTotal * WAVE_INITIAL_BURST_FRAC));
      for (let i = 0; i < initial; i++) this.spawnInWave(p);
    } else {
      if (now - p.pwWaveStartedAt >= WAVE_DURATION_MS) {
        p.pwWaveActive = false;
        return;
      }
      if (
        p.pwWaveSpawnedSoFar < p.pwWaveTotal &&
        now - p.pwWaveLastTrickleAt >= WAVE_TRICKLE_INTERVAL_MS
      ) {
        p.pwWaveLastTrickleAt = now;
        const remaining = p.pwWaveTotal - p.pwWaveSpawnedSoFar;
        const trickleSize = Math.max(4, Math.min(remaining, 6));
        for (let i = 0; i < trickleSize; i++) this.spawnInWave(p);
      }

      // Bonus bear/rat injection during the wave.
      if (this.npcs.size < NPC_MAX_COUNT) {
        if (
          p.pwBonusBearsSpawned < p.pwBonusBearTarget &&
          now - p.pwBonusBearLastAt >= 2500
        ) {
          p.pwBonusBearLastAt = now;
          this.spawnBonusMonster(p, 'zombie_bear');
          p.pwBonusBearsSpawned += 1;
        }
        if (
          p.pwBonusRatsSpawned < p.pwBonusRatTarget &&
          now - p.pwBonusRatLastAt >= 250
        ) {
          p.pwBonusRatLastAt = now;
          this.spawnBonusMonster(p, 'rat');
          p.pwBonusRatsSpawned += 1;
        }
      }
    }

    // Update player's wave time-left for HUD
    p.waveTimeLeftMs = p.pwWaveActive
      ? Math.max(0, WAVE_DURATION_MS - (now - p.pwWaveStartedAt))
      : Math.max(0, WAVE_DURATION_MS + WAVE_COOLDOWN_MS - (now - p.pwWaveStartedAt));
  }

  spawnInWave(p: ServerPlayer) {
    if (this.npcs.size >= NPC_MAX_COUNT) return;
    if (p.pwWaveSpawnedSoFar >= p.pwWaveTotal) return;
    const anchor = p.pwWaveAnchors[p.pwWaveSpawnedSoFar % Math.max(1, p.pwWaveAnchors.length)];
    const kind = p.pwWaveKind;
    const formation = MONSTER_FORMATION[kind];
    const idx = p.pwWaveSpawnedSoFar;
    const total = Math.max(1, p.pwWaveTotal);
    let x: number, y: number;

    if (formation === 'line') {
      // Disciplined line — perpendicular to (anchor → player), evenly spaced
      const dxToP = p.x - anchor.x;
      const dyToP = p.y - anchor.y;
      const len = Math.hypot(dxToP, dyToP) || 1;
      const perpX = -dyToP / len;
      const perpY = dxToP / len;
      const lineLength = Math.min(420, total * 32);
      const t = (idx / Math.max(1, total - 1)) - 0.5; // -0.5..0.5
      const offsetX = perpX * t * lineLength;
      const offsetY = perpY * t * lineLength;
      x = clamp(anchor.x + offsetX + (Math.random() - 0.5) * 24, 20, ARENA_WIDTH - 20);
      y = clamp(anchor.y + offsetY + (Math.random() - 0.5) * 24, 20, ARENA_HEIGHT - 20);
    } else if (formation === 'swarm') {
      // Flying enemies converge from random angles around the player
      const angle = Math.random() * Math.PI * 2;
      const dist = 480 + Math.random() * 240;
      x = clamp(p.x + Math.cos(angle) * dist, 20, ARENA_WIDTH - 20);
      y = clamp(p.y + Math.sin(angle) * dist, 20, ARENA_HEIGHT - 20);
    } else if (formation === 'ambush') {
      // Spawn surprisingly close to the player
      const angle = Math.random() * Math.PI * 2;
      const dist = 160 + Math.random() * 120;
      x = clamp(p.x + Math.cos(angle) * dist, 20, ARENA_WIDTH - 20);
      y = clamp(p.y + Math.sin(angle) * dist, 20, ARENA_HEIGHT - 20);
    } else {
      // 'group' (default) — clustered around the wave anchor with jitter
      const jitter = MONSTER_GROUP_JITTER_OVERRIDE[kind] ?? 120;
      x = clamp(anchor.x + (Math.random() - 0.5) * jitter, 20, ARENA_WIDTH - 20);
      y = clamp(anchor.y + (Math.random() - 0.5) * jitter, 20, ARENA_HEIGHT - 20);
    }

    const base = MONSTER_BASES[kind];
    // HP curve: linear up to wave 20, then a quadratic late-game term so
    // high-wave runs (50+, 100+) keep being threatening despite stacked
    // player damage powerups.
    const waveDiffMul = 1 + (p.waveNumber - 1) * 0.13
      + Math.pow(Math.max(0, p.waveNumber - 20), 1.5) * 0.02;
    const levelDiffMul = 1 + (p.level - 1) * 0.10;
    const hp = NPC_BASE_HP * base.hpMul * waveDiffMul * levelDiffMul;
    // Hard cap on speed so player can always run away
    const cappedSpeed = Math.min(
      PLAYER_SPEED * NPC_SPEED_CAP_FRAC,
      NPC_BASE_SPEED * base.speedMul * Math.min(1.8, 0.95 + (p.waveNumber - 1) * 0.05),
    );
    const id = genId('npc');
    this.npcs.set(id, {
      id, kind, x, y,
      hp, baseHp: hp,
      speed: cappedSpeed,
      baseSpeed: cappedSpeed,
      slowUntil: 0,
      slowMul: 1,
      freezeUntil: 0,
      lastHitAt: 0,
      ownerPlayerId: p.id,
      ai: p.pwWaveAi,
      aiPhase: 'pursue',
      // First regroup pause comes 5-7s in so NPCs reach the player before pausing
      aiPhaseEndsAt: Date.now() + 5000 + Math.random() * 2000,
      flankSide: Math.random() < 0.5 ? -1 : 1,
    });
    p.pwWaveSpawnedSoFar += 1;
  }

  // Each tick, sync the dragon's ownerPlayerId to whoever is currently top.
  // The existing targetForNpc logic then drives chase movement and damage.
  retargetDragon() {
    if (!this.dragonId) return;
    const dragon = this.npcs.get(this.dragonId);
    if (!dragon) { this.dragonId = null; return; }
    let best: ServerPlayer | null = null;
    let bestScore = -1;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const score = p.level * 100 + p.waveNumber * 50;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (best) dragon.ownerPlayerId = best.id;
  }

  // Dragon-on-death loot: 12 golds + 4 epics scattered around the body.
  dropDragonFeast(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      this.dropGem(x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.5) * 80, 5);
    }
    for (let i = 0; i < 4; i++) {
      this.dropGem(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 50, 10);
    }
  }

  // Boss spawn check. Conditions: (1) no dragon currently alive in the room,
  // (2) at least one alive player is level 13+, (3) we're past the post-death
  // cooldown. Picks the top-scoring eligible player and drops the dragon
  // ~700-900px away, just off-screen at default zoom.
  maybeSpawnDragon(now: number) {
    if (this.dragonId) {
      // Lazily clear the handle if the dragon NPC was killed somewhere else.
      if (!this.npcs.has(this.dragonId)) {
        this.dragonId = null;
        this.nextDragonAllowedAt = now + 60_000; // 1-minute breather
      } else {
        return;
      }
    }
    if (now < this.nextDragonAllowedAt) return;
    let target: ServerPlayer | null = null;
    let bestScore = -1;
    for (const p of this.players.values()) {
      if (!p.alive || p.level < 13) continue;
      const score = p.level * 100 + p.waveNumber * 50;
      if (score > bestScore) { target = p; bestScore = score; }
    }
    if (!target) return;
    if (this.npcs.size >= NPC_MAX_COUNT) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 700 + Math.random() * 200;
    const x = clamp(target.x + Math.cos(angle) * dist, 30, ARENA_WIDTH - 30);
    const y = clamp(target.y + Math.sin(angle) * dist, 30, ARENA_HEIGHT - 30);

    // HP scales with both wave and level so the dragon stays a real threat
    // against players who've stacked damage powerups. 8000 floor guarantees
    // even a fresh L13 player faces a proper wall, not a 5-second pinata.
    const wMul = 1 + (target.waveNumber - 1) * 0.13
      + Math.pow(Math.max(0, target.waveNumber - 20), 1.5) * 0.02;
    const lMul = 1 + (target.level - 1) * 0.10;
    const hp = Math.max(8000, NPC_BASE_HP * 50 * wMul * lMul);
    // Dragon ignores the standard NPC speed cap — it's intentionally fast so
    // running away isn't a free out, but a player can micro-dodge it.
    const speed = PLAYER_SPEED * 0.95;

    const id = genId('dragon');
    this.dragonId = id;
    this.npcs.set(id, {
      id, kind: 'dragon', x, y,
      hp, baseHp: hp,
      speed, baseSpeed: speed,
      slowUntil: 0, slowMul: 1, freezeUntil: 0,
      lastHitAt: 0,
      ownerPlayerId: target.id,
      ai: 'chase',
      aiPhase: 'pursue',
      aiPhaseEndsAt: 0,
      flankSide: 1,
    });
  }

  maybeSpawnBoss(now: number) {
    // Clear stale handle
    if (this.activeBossId && !this.npcs.has(this.activeBossId)) {
      this.activeBossId = null;
      this.nextBossAllowedAt = now + 90_000;
      // Advance roster
      this.bossRosterIdx++;
      if (this.bossRosterIdx >= BOSS_ROSTER.length) {
        this.bossRosterIdx = 0;
        this.bossGeneration++;
      }
    }
    if (this.activeBossId) return;
    if (now < this.nextBossAllowedAt) return;
    // Find top-scoring player at L10+ to anchor the boss
    let target: ServerPlayer | null = null;
    let bestScore = -1;
    for (const p of this.players.values()) {
      if (!p.alive || p.level < 10) continue;
      const score = p.level * 100 + p.waveNumber * 50;
      if (score > bestScore) { target = p; bestScore = score; }
    }
    if (!target) return;
    if (this.npcs.size >= NPC_MAX_COUNT) return;

    const boss = BOSS_ROSTER[this.bossRosterIdx];
    const angle = Math.random() * Math.PI * 2;
    const dist = 700 + Math.random() * 200;
    const x = clamp(target.x + Math.cos(angle) * dist, 30, ARENA_WIDTH - 30);
    const y = clamp(target.y + Math.sin(angle) * dist, 30, ARENA_HEIGHT - 30);

    const wMul = 1 + (target.waveNumber - 1) * 0.10
      + Math.pow(Math.max(0, target.waveNumber - 20), 1.4) * 0.015;
    const lMul = 1 + (target.level - 1) * 0.08;
    const genMul = 1 + this.bossGeneration * 0.5;
    const hp = Math.round(NPC_BASE_HP * boss.hpMul * wMul * lMul * genMul);
    const speed = PLAYER_SPEED * boss.speedFrac;

    const id = genId('boss');
    this.activeBossId = id;
    this.npcs.set(id, {
      id, kind: boss.kind, x, y,
      hp, baseHp: hp,
      speed, baseSpeed: speed,
      slowUntil: 0, slowMul: 1, freezeUntil: 0,
      lastHitAt: 0,
      ownerPlayerId: target.id,
      ai: boss.ai,
      aiPhase: 'pursue',
      aiPhaseEndsAt: 0,
      flankSide: 1,
      // Boss-specific state
      bossPhase: boss.ai === 'boss_charge' ? 'idle' : undefined,
      bossPhaseUntil: boss.ai === 'boss_charge' ? now + 4000 + Math.random() * 2000 : undefined,
      bossEnraged: false,
      bossNextSummonAt: boss.summonKind ? now + boss.summonIntervalMs : undefined,
      bossSummonKind: boss.summonKind,
      bossSummonCount: boss.summonCount,
      bossSummonIntervalMs: boss.summonIntervalMs,
    });

    this.room.broadcast(JSON.stringify({ type: 'bossAlert', bossName: boss.name } satisfies ServerToClient));
  }

  spawnBossMinions(boss: ServerNpc, now: number) {
    if (!boss.bossSummonKind || !boss.bossSummonCount) return;
    const count = Math.min(boss.bossSummonCount, NPC_MAX_COUNT - this.npcs.size);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 80 + Math.random() * 60;
      const x = clamp(boss.x + Math.cos(angle) * dist, 20, ARENA_WIDTH - 20);
      const y = clamp(boss.y + Math.sin(angle) * dist, 20, ARENA_HEIGHT - 20);
      const base = MONSTER_BASES[boss.bossSummonKind];
      const hp = NPC_BASE_HP * base.hpMul;
      const speed = Math.min(PLAYER_SPEED * NPC_SPEED_CAP_FRAC, NPC_BASE_SPEED * base.speedMul);
      const sid = genId('minion');
      this.npcs.set(sid, {
        id: sid, kind: boss.bossSummonKind, x, y,
        hp, baseHp: hp,
        speed, baseSpeed: speed,
        slowUntil: 0, slowMul: 1, freezeUntil: 0,
        lastHitAt: 0,
        ownerPlayerId: boss.ownerPlayerId,
        ai: 'chase',
        aiPhase: 'pursue',
        aiPhaseEndsAt: now + 3000,
        flankSide: Math.random() < 0.5 ? -1 : 1,
      });
    }
    boss.bossNextSummonAt = now + (boss.bossSummonIntervalMs ?? 8000);
  }

  // High-wave injection: spawn a single NPC of the given kind near the player's
  // wave anchors, sharing the regular wave HP curve. Doesn't count toward
  // pwWaveTotal — these are extras layered on top of the theme.
  spawnBonusMonster(p: ServerPlayer, kind: MonsterKind) {
    if (this.npcs.size >= NPC_MAX_COUNT) return;
    if (p.pwWaveAnchors.length === 0) return;
    const anchor = p.pwWaveAnchors[Math.floor(Math.random() * p.pwWaveAnchors.length)];
    const jitter = MONSTER_GROUP_JITTER_OVERRIDE[kind] ?? 120;
    const x = clamp(anchor.x + (Math.random() - 0.5) * jitter, 20, ARENA_WIDTH - 20);
    const y = clamp(anchor.y + (Math.random() - 0.5) * jitter, 20, ARENA_HEIGHT - 20);
    const base = MONSTER_BASES[kind];
    const waveDiffMul = 1 + (p.waveNumber - 1) * 0.13
      + Math.pow(Math.max(0, p.waveNumber - 20), 1.5) * 0.02;
    const levelDiffMul = 1 + (p.level - 1) * 0.10;
    const hp = NPC_BASE_HP * base.hpMul * waveDiffMul * levelDiffMul;
    const cappedSpeed = Math.min(
      PLAYER_SPEED * NPC_SPEED_CAP_FRAC,
      NPC_BASE_SPEED * base.speedMul * Math.min(1.8, 0.95 + (p.waveNumber - 1) * 0.05),
    );
    const id = genId('npc');
    this.npcs.set(id, {
      id, kind, x, y,
      hp, baseHp: hp,
      speed: cappedSpeed,
      baseSpeed: cappedSpeed,
      slowUntil: 0,
      slowMul: 1,
      freezeUntil: 0,
      lastHitAt: 0,
      ownerPlayerId: p.id,
      ai: 'chase', // bonus monsters always chase straight toward the player
      aiPhase: 'pursue',
      aiPhaseEndsAt: Date.now() + 5000 + Math.random() * 2000,
      flankSide: Math.random() < 0.5 ? -1 : 1,
    });
  }

  updateNPCs(dt: number, now: number) {
    // Each NPC chases its owner (the player whose wave spawned it). If owner is
    // invulnerable (picking a powerup), the NPC switches to the nearest non-invuln
    // player — so picking transfers your hordes to your teammates.
    for (const n of this.npcs.values()) {
      const target = this.targetForNpc(n);
      // Freeze (Time Stop): hard-stop while > now. Slow + freeze are independent;
      // freeze takes precedence because it's a stronger effect.
      const frozen = now < n.freezeUntil;
      const slowed = now < n.slowUntil;
      let speedNow = frozen ? 0 : (slowed ? n.baseSpeed * n.slowMul : n.baseSpeed);
      n.speed = speedNow;
      if (!target) continue;
      // Resolve AI move target (can differ from `target` for flank/regroup)
      let aimX = target.x;
      let aimY = target.y;
      if (n.ai === 'regroup') {
        // Cycle: pursue 5-7s, then pause 1.2-1.6s drifting outward, then resume.
        if (now > n.aiPhaseEndsAt) {
          if (n.aiPhase === 'pursue') {
            n.aiPhase = 'pause';
            n.aiPhaseEndsAt = now + 1200 + Math.random() * 400;
          } else {
            n.aiPhase = 'pursue';
            n.aiPhaseEndsAt = now + 5000 + Math.random() * 2000;
          }
        }
        if (n.aiPhase === 'pause') {
          // Drift outward: aim opposite of target, but slowly
          aimX = n.x + (n.x - target.x);
          aimY = n.y + (n.y - target.y);
          speedNow *= 0.35;
        }
      } else if (n.ai === 'flank') {
        // Aim at a perpendicular point ~110px to one side of the target until
        // close to that flank position; then revert to direct chase.
        const dxToT = target.x - n.x;
        const dyToT = target.y - n.y;
        const distToT = Math.hypot(dxToT, dyToT) || 1;
        if (distToT > 90) {
          const px = -dyToT / distToT;
          const py = dxToT / distToT;
          aimX = target.x + px * 110 * n.flankSide;
          aimY = target.y + py * 110 * n.flankSide;
        }
      } else if (n.ai === 'boss_charge') {
        // Cycle: idle (slow chase) → windup (stop) → dash (3× speed) → recover (stop)
        const phase = n.bossPhase ?? 'idle';
        if (now >= (n.bossPhaseUntil ?? 0)) {
          if (phase === 'idle') {
            n.bossPhase = 'windup';
            n.bossPhaseUntil = now + 1200;
          } else if (phase === 'windup') {
            // Lock in dash direction toward current target position
            const ddx = target.x - n.x;
            const ddy = target.y - n.y;
            const ddist = Math.hypot(ddx, ddy) || 1;
            n.bossDashVx = ddx / ddist;
            n.bossDashVy = ddy / ddist;
            n.bossPhase = 'dash';
            n.bossPhaseUntil = now + 450;
          } else if (phase === 'dash') {
            n.bossPhase = 'recover';
            n.bossPhaseUntil = now + 2000;
          } else {
            n.bossPhase = 'idle';
            n.bossPhaseUntil = now + 4000 + Math.random() * 2000;
          }
        }
        if (n.bossPhase === 'windup' || n.bossPhase === 'recover') {
          speedNow = 0;
        } else if (n.bossPhase === 'dash' && n.bossDashVx != null && n.bossDashVy != null) {
          n.x += n.bossDashVx * n.baseSpeed * 3 * dt;
          n.y += n.bossDashVy * n.baseSpeed * 3 * dt;
          n.x = clamp(n.x, 20, ARENA_WIDTH - 20);
          n.y = clamp(n.y, 20, ARENA_HEIGHT - 20);
          speedNow = 0; // position already updated
        } else {
          speedNow = n.baseSpeed * 0.5; // slow idle chase
        }
        // Summon minions on timer (warchief has summon + charge)
        if (n.bossSummonKind && n.bossNextSummonAt && now >= n.bossNextSummonAt) {
          this.spawnBossMinions(n, now);
        }
      } else if (n.ai === 'boss_summon') {
        // Chase normally + spawn minions on timer
        if (n.bossSummonKind && n.bossNextSummonAt && now >= n.bossNextSummonAt) {
          this.spawnBossMinions(n, now);
        }
      } else if (n.ai === 'boss_enrage') {
        // Enrage trigger at 40% HP
        if (!n.bossEnraged && n.hp < n.baseHp * 0.4) {
          n.bossEnraged = true;
          n.baseSpeed = n.baseSpeed * 1.8;
          n.speed = n.baseSpeed;
          speedNow = n.baseSpeed;
        }
      }
      const dx = aimX - n.x;
      const dy = aimY - n.y;
      const dist = Math.hypot(dx, dy) || 1;
      n.x += (dx / dist) * speedNow * dt;
      n.y += (dy / dist) * speedNow * dt;

      // Black-hole pull: any active black hole drags this NPC toward its center.
      for (const bh of this.blackHoles.values()) {
        const bdx = bh.x - n.x;
        const bdy = bh.y - n.y;
        const bdist2 = bdx * bdx + bdy * bdy;
        if (bdist2 < bh.pullRadius * bh.pullRadius && bdist2 > 1) {
          const bdist = Math.sqrt(bdist2);
          n.x += (bdx / bdist) * bh.pullStrength * dt;
          n.y += (bdy / bdist) * bh.pullStrength * dt;
        }
      }

      // touch damage uses distance to the actual target (not the flank aim),
      // so flanking NPCs still apply damage when they reach the player.
      const playerDist = Math.hypot(target.x - n.x, target.y - n.y);
      if (
        playerDist < PLAYER_RADIUS + NPC_RADIUS &&
        now - n.lastHitAt > NPC_TOUCH_COOLDOWN_MS &&
        now >= target.invulnerableUntil &&
        now >= target.damageImmuneUntil
      ) {
        const dmgMul = 1 + (target.waveNumber - 1) * 0.05;
        target.hp -= NPC_DAMAGE * dmgMul;
        n.lastHitAt = now;
        if (target.hp <= 0) this.killPlayer(target, '__npc__');
      }
    }

    // 2) NPC-NPC separation (push overlapping pairs apart)
    const list = Array.from(this.npcs.values());
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        if (dx > NPC_SEPARATION_RADIUS || dx < -NPC_SEPARATION_RADIUS) continue;
        const dy = b.y - a.y;
        if (dy > NPC_SEPARATION_RADIUS || dy < -NPC_SEPARATION_RADIUS) continue;
        const distSq = dx * dx + dy * dy;
        // Per-pair separation radius: minimum of the two monsters' overrides.
        // Lets rats bunch tightly while still spreading from larger monsters they overlap with.
        const aMin = MONSTER_SEPARATION_RADIUS_OVERRIDE[a.kind] ?? NPC_SEPARATION_RADIUS;
        const bMin = MONSTER_SEPARATION_RADIUS_OVERRIDE[b.kind] ?? NPC_SEPARATION_RADIUS;
        const minDist = Math.min(aMin, bMin);
        if (distSq < minDist * minDist && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) / minDist; // 0..1
          const force = NPC_SEPARATION_FORCE * overlap * dt;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * force;
          a.y -= ny * force;
          b.x += nx * force;
          b.y += ny * force;
        } else if (distSq <= 0.01) {
          // exact overlap — nudge in a deterministic direction
          a.x -= 0.5;
          b.x += 0.5;
        }
      }
    }
    // Clamp to arena bounds after separation
    for (const n of list) {
      n.x = clamp(n.x, NPC_RADIUS, ARENA_WIDTH - NPC_RADIUS);
      n.y = clamp(n.y, NPC_RADIUS, ARENA_HEIGHT - NPC_RADIUS);
    }
  }

  // NPCs prefer their owner (the player whose wave spawned them).
  // If the owner is dead/invulnerable, fall back to the nearest non-invuln player.
  // If everyone is invuln, returns null and the NPC stands still.
  targetForNpc(n: { x: number; y: number; ownerPlayerId: string }): ServerPlayer | null {
    const wallNow = Date.now();
    const owner = this.players.get(n.ownerPlayerId);
    if (owner && owner.alive && wallNow >= owner.invulnerableUntil) return owner;
    let best: ServerPlayer | null = null;
    let bestD2 = Infinity;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (wallNow < p.invulnerableUntil) continue;
      const d2 = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  }

  killNPC(id: string, killerId?: string, causeChain = true) {
    const n = this.npcs.get(id);
    if (!n) return;
    this.npcs.delete(id);
    if (n.kind === 'dragon') {
      // Dragon defeated by players — feast! Plus reset cooldown so a new
      // dragon doesn't spawn immediately, giving the room a victory lap.
      this.dropDragonFeast(n.x, n.y);
      if (this.dragonId === n.id) {
        this.dragonId = null;
        this.nextDragonAllowedAt = Date.now() + 60_000;
      }
    } else if (n.id === this.activeBossId) {
      // Unique roster boss — big feast
      for (let i = 0; i < 15; i++) this.dropGem(n.x, n.y, 5);
      for (let i = 0; i < 5; i++) this.dropGem(n.x, n.y, 10);
      // Do NOT null activeBossId here — maybeSpawnBoss() detects the dead boss
      // on next tick and handles cooldown + roster advance atomically.
    } else {
      const tier = MONSTER_BASES[n.kind].tier;
      if (tier === 'boss') {
        // Wave boss drops — many greens + golds + epic
        for (let i = 0; i < 6; i++) this.dropGem(n.x, n.y, 3);
        for (let i = 0; i < 2; i++) this.dropGem(n.x, n.y, 5);
        this.dropGem(n.x, n.y, 10);
      } else if (tier === 'elite') {
        // Elites always drop 2 greens, often a gold
        for (let i = 0; i < 2; i++) this.dropGem(n.x, n.y, 3);
        if (Math.random() < 0.5) this.dropGem(n.x, n.y, 5);
      } else {
        // Minions: usually 1 blue, occasional green, very rare gold
        const r = Math.random();
        const value = r < 0.03 ? 5 : r < 0.15 ? 3 : 1;
        this.dropGem(n.x, n.y, value);
      }
    }

    // Soul Harvest stack: each kill grants a permanent +0.1% damage stack
    // (capped at 500 = +50%). Counts every kind of kill, including chains.
    if (killerId) {
      const killer = this.players.get(killerId);
      if (killer && killer.soulHarvestEnabled && killer.soulHarvestStacks < 500) {
        killer.soulHarvestStacks += 1;
      }
    }

    // Chain Reaction: 25% chance to detonate the corpse, hitting nearby foes.
    // causeChain=false on splashed kills to prevent infinite cascades — chains
    // can only fire from "primary" kills (player weapon / aura / lightning / etc).
    if (causeChain && killerId) {
      const killer = this.players.get(killerId);
      if (killer && killer.alive && killer.chainReactionEnabled && Math.random() < 0.25) {
        this.spawnChainExplosion(killer, n.x, n.y);
      }
    }
  }

  // Damage NPCs in a small radius; victims of this explosion CANNOT chain again.
  spawnChainExplosion(owner: ServerPlayer, x: number, y: number) {
    const radius = 90;
    const r2 = radius * radius;
    const dmg = 18 * owner.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, owner.level - 1) * LEVEL_DAMAGE_MUL);
    for (const n of this.npcs.values()) {
      if ((n.x - x) ** 2 + (n.y - y) ** 2 < r2) {
        n.hp -= dmg;
        this.applyVampire(owner, dmg);
        if (n.hp <= 0) this.killNPC(n.id, owner.id, false);
      }
    }
    const fx: ServerToClient = { type: 'effect', effect: 'chainExplosion', x, y };
    this.room.broadcast(JSON.stringify(fx));
  }

  dropGem(x: number, y: number, value: number) {
    const gid = genId('gem');
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 12;
    this.gems.set(gid, {
      id: gid,
      x: x + Math.cos(angle) * r,
      y: y + Math.sin(angle) * r,
      value,
    });
  }

  killPlayer(p: ServerPlayer, killerId: string) {
    if (!p.alive) return;

    // Phoenix Rebirth — once per life, ignore the kill, full-heal, and detonate
    // a fire AOE around the player. Sets phoenixUsed so subsequent deaths land.
    if (p.phoenixRebirthEnabled && !p.phoenixUsed) {
      p.phoenixUsed = true;
      p.hp = p.maxHp;
      // brief invulnerability so the player can recover
      p.invulnerableUntil = Date.now() + 1500;
      // AOE damage on revive
      const aoeR2 = 250 * 250;
      const baseDmg = 80 * p.damageMul * (1 + Math.min(LEVEL_DAMAGE_CAP_LEVELS, p.level - 1) * LEVEL_DAMAGE_MUL);
      for (const n of this.npcs.values()) {
        const d2 = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
        if (d2 < aoeR2) {
          n.hp -= baseDmg;
          this.applyVampire(p, baseDmg);
          if (n.hp <= 0) this.killNPC(n.id, p.id);
        }
      }
      const fx: ServerToClient = { type: 'effect', effect: 'phoenixRevive', x: p.x, y: p.y };
      this.room.broadcast(JSON.stringify(fx));
      return;
    }

    p.alive = false;
    p.hp = 0;
    this.recordDeath(p);

    // If a dragon was hunting this player, the dragon dies along with its
    // target — drops a feast and triggers the spawn cooldown. Doesn't matter
    // who actually landed the killing blow on the player.
    if (this.dragonId) {
      const dragon = this.npcs.get(this.dragonId);
      if (dragon && dragon.ownerPlayerId === p.id) {
        this.dropDragonFeast(dragon.x, dragon.y);
        this.npcs.delete(this.dragonId);
        this.dragonId = null;
        this.nextDragonAllowedAt = Date.now() + 60_000;
      }
    }

    // Drop gems proportional to player level: a few greens + a gold
    const greens = Math.max(2, Math.floor(p.level / 2) + 1);
    const golds = Math.max(0, Math.floor(p.level / 4));
    for (let i = 0; i < greens; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 30;
      this.dropGem(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 3);
    }
    for (let i = 0; i < golds; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 30;
      this.dropGem(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 5);
    }
    const msg: ServerToClient = { type: 'died', playerId: p.id };
    this.room.broadcast(JSON.stringify(msg));
    if (killerId !== '__npc__') {
      const killMsg: ServerToClient = { type: 'killed', killerId, victimId: p.id };
      this.room.broadcast(JSON.stringify(killMsg));
    }
  }

  updateGems() {
    for (const gem of this.gems.values()) {
      // find any player within pickup range
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const range = GEM_PICKUP_RADIUS * p.pickupMul;
        const d2 = (p.x - gem.x) ** 2 + (p.y - gem.y) ** 2;
        if (d2 < (PLAYER_RADIUS + GEM_RADIUS) ** 2) {
          // collected
          this.collectGem(p, gem);
          this.gems.delete(gem.id);
          break;
        } else if (d2 < range * range) {
          // vacuum toward player
          const dx = p.x - gem.x;
          const dy = p.y - gem.y;
          const len = Math.hypot(dx, dy) || 1;
          gem.x += (dx / len) * 220 * (TICK_MS / 1000);
          gem.y += (dy / len) * 220 * (TICK_MS / 1000);
        }
      }
    }
  }

  collectGem(p: ServerPlayer, gem: GemState) {
    p.xp += Math.max(1, Math.round(gem.value * p.xpMul));
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.xpToNext = XP_FOR_LEVEL(p.level);
      this.queueLevelUp(p);
    }
  }

  queueLevelUp(p: ServerPlayer) {
    const choices = rollPowerupChoices(p, 3).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      iconSprite: c.iconSprite,
    }));
    if (choices.length === 0) return;
    p.pendingChoices.push(choices);
    p.pendingLevelUps = p.pendingChoices.length;
    // 5-second breather while picking
    p.invulnerableUntil = Math.max(p.invulnerableUntil, Date.now() + LEVEL_UP_INVULN_MS);
    if (p.pendingChoices.length === 1) {
      this.sendLevelUp(p.id, p.level, choices);
    }
  }

  sendLevelUp(
    playerId: string,
    level: number,
    choices: { id: string; name: string; description: string; icon: string; iconSprite?: string }[],
  ) {
    const msg: ServerToClient = { type: 'levelUp', playerId, level, choices };
    this.room.broadcast(JSON.stringify(msg));
  }

  broadcastSnapshot(now: number) {
    // Build arrays inline with for-of to avoid intermediate spread allocations each tick.
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        name: p.name,
        character: p.character,
        color: p.color,
        hue: p.hue,
        country: p.country,
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp,
        level: p.level,
        xp: p.xp,
        xpToNext: p.xpToNext,
        alive: p.alive,
        facing: p.facing,
        damageMul: p.damageMul,
        speedMul: p.speedMul,
        pickupMul: p.pickupMul,
        cooldownMul: p.cooldownMul,
        weapons: p.weapons,
        waveNumber: p.waveNumber,
        waveName: p.waveName,
        waveTimeLeftMs: p.waveTimeLeftMs,
        invulnerableUntil: p.invulnerableUntil,
        damageImmuneUntil: p.damageImmuneUntil,
        timeShieldEnabled: p.timeShieldEnabled,
        lightningStrikeEnabled: p.lightningStrikeEnabled,
        meteorShowerEnabled: p.meteorShowerEnabled,
        frostNovaEnabled: p.frostNovaEnabled,
        holySmiteEnabled: p.holySmiteEnabled,
        blackHoleEnabled: p.blackHoleEnabled,
        phoenixRebirthEnabled: p.phoenixRebirthEnabled,
        phoenixUsed: p.phoenixUsed,
        chainReactionEnabled: p.chainReactionEnabled,
        missileBarrageEnabled: p.missileBarrageEnabled,
        earthquakeEnabled: p.earthquakeEnabled,
        spiritWolvesEnabled: p.spiritWolvesEnabled,
        spiritWolfCount: p.spiritWolfCount,
        bloodbathEnabled: p.bloodbathEnabled,
        soulHarvestEnabled: p.soulHarvestEnabled,
        soulHarvestStacks: p.soulHarvestStacks,
        trailOfFireEnabled: p.trailOfFireEnabled,
        timeStopEnabled: p.timeStopEnabled,
        auraShieldRangeMul: p.auraShieldRangeMul,
        trailDurationMul: p.trailDurationMul,
        frostNovaRadiusMul: p.frostNovaRadiusMul,
        lightningCooldownMul: p.lightningCooldownMul,
        projectileBonus: p.projectileBonus,
        bigHitMul: p.bigHitMul,
        splashRadius: p.splashRadius,
        vampireFraction: p.vampireFraction,
        regenPerSec: p.regenPerSec,
        critChance: p.critChance,
        pierceCount: p.pierceCount,
        frostAuraDmg: p.frostAuraDmg,
        frostAuraRadius: p.frostAuraRadius,
        xpMul: p.xpMul,
        projectileLifeMul: p.projectileLifeMul,
        pendingLevelUps: p.pendingLevelUps,
      });
    }
    const npcs = [];
    for (const n of this.npcs.values()) {
      npcs.push({ id: n.id, kind: n.kind, x: n.x, y: n.y, hp: n.hp });
    }
    const gems = [];
    for (const g of this.gems.values()) {
      gems.push(g);
    }
    const projectiles = [];
    for (const p of this.projectiles.values()) {
      projectiles.push({ id: p.id, ownerId: p.ownerId, x: p.x, y: p.y, vx: p.vx, vy: p.vy, weapon: p.weapon });
    }
    const wolves = [];
    for (const w of this.wolves.values()) {
      wolves.push({ id: w.id, ownerId: w.ownerId, x: w.x, y: w.y, state: w.state });
    }
    const hazards: HazardState[] = [];
    for (const h of this.hazards.values()) {
      hazards.push({ id: h.id, kind: h.kind, x: h.x, y: h.y, radius: h.radius, warningUntilMs: h.warningUntilMs, activeUntilMs: h.activeUntilMs });
    }
    const snap: Snapshot = {
      type: 'snapshot',
      t: now,
      wave: 0,
      waveName: '',
      waveTimeLeftMs: 0,
      players,
      npcs,
      gems,
      projectiles,
      wolves,
      hazards,
    };
    this.room.broadcast(JSON.stringify(snap));
  }

  scheduleHazard(now: number) {
    if (now < this.nextHazardAt) return;
    if (this.hazards.size >= 2) return;
    // Only spawn if at least one player is past wave 3
    let anyEligible = false;
    let anchorPlayer: ServerPlayer | null = null;
    for (const p of this.players.values()) {
      if (p.alive && p.waveNumber >= 3) { anyEligible = true; anchorPlayer = p; break; }
    }
    if (!anyEligible || !anchorPlayer) return;

    const roll = Math.random();
    const kind = roll < 0.2 ? 'fire_pool'
      : roll < 0.4 ? 'lightning_strike'
      : roll < 0.6 ? 'poison_cloud'
      : roll < 0.8 ? 'slow_zone'
      : 'smoke_zone';
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 200;
    const x = clamp(anchorPlayer.x + Math.cos(angle) * dist, 40, ARENA_WIDTH - 40);
    const y = clamp(anchorPlayer.y + Math.sin(angle) * dist, 40, ARENA_HEIGHT - 40);
    const radius = kind === 'fire_pool' ? 70
      : kind === 'lightning_strike' ? 80
      : kind === 'poison_cloud' ? 80
      : kind === 'slow_zone' ? 90
      : 120; // smoke_zone
    const duration = kind === 'fire_pool' ? 8000
      : kind === 'lightning_strike' ? 0
      : kind === 'poison_cloud' ? 10000
      : kind === 'slow_zone' ? 8000
      : 12000; // smoke_zone
    const id = genId('hazard');
    this.hazards.set(id, {
      id, kind, x, y, radius,
      warningUntilMs: now + 3000,
      activeUntilMs: now + 3000 + duration,
      lastDamageAt: 0,
      lightningFired: false,
    });
    this.nextHazardAt = now + 35_000 + Math.random() * 35_000;
  }

  updateHazards(now: number) {
    // Reset slow_zone state — will be set below for each player in range
    for (const p of this.players.values()) p.inSlowZone = false;

    for (const [id, h] of this.hazards) {
      const active = now >= h.warningUntilMs;

      if (h.kind === 'fire_pool' && active) {
        if (now - h.lastDamageAt > 500) {
          h.lastDamageAt = now;
          const r2 = h.radius * h.radius;
          for (const p of this.players.values()) {
            if (!p.alive) continue;
            if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < r2) {
              p.hp -= 5;
              if (p.hp <= 0) this.killPlayer(p, '__hazard__');
            }
          }
        }
      } else if (h.kind === 'lightning_strike' && !h.lightningFired && active) {
        h.lightningFired = true;
        const r2 = h.radius * h.radius;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < r2) {
            p.hp -= 35;
            if (p.hp <= 0) this.killPlayer(p, '__hazard__');
          }
        }
        const fx: ServerToClient = { type: 'effect', effect: 'lightning', x: h.x, y: h.y };
        this.room.broadcast(JSON.stringify(fx));
        h.activeUntilMs = now;
      } else if (h.kind === 'poison_cloud' && active) {
        if (now - h.lastDamageAt > 500) {
          h.lastDamageAt = now;
          const r2 = h.radius * h.radius;
          for (const p of this.players.values()) {
            if (!p.alive) continue;
            if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < r2) {
              p.hp -= 4; // 8/s at 500ms tick
              if (p.hp <= 0) this.killPlayer(p, '__hazard__');
            }
          }
        }
      } else if (h.kind === 'slow_zone' && active) {
        const r2 = h.radius * h.radius;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < r2) {
            p.inSlowZone = true;
          }
        }
        // smoke_zone: no server effect, client handles visual
      }

      if (now > h.activeUntilMs) {
        this.hazards.delete(id);
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Pick N anchor points around a player position (so hordes converge on them).
// Anchors sit ~600-800px from the player at distinct random angles.
function pickAnchorsAround(px: number, py: number, n: number): { x: number; y: number }[] {
  const N = Math.max(1, Math.min(4, n));
  const out: { x: number; y: number }[] = [];
  const baseAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < N; i++) {
    const angle = baseAngle + (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 600 + Math.random() * 200;
    const x = clamp(px + Math.cos(angle) * dist, 30, ARENA_WIDTH - 30);
    const y = clamp(py + Math.sin(angle) * dist, 30, ARENA_HEIGHT - 30);
    out.push({ x, y });
  }
  return out;
}

GameServer satisfies Party.Worker;
