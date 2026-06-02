import * as Phaser from 'phaser';
import PartySocket from 'partysocket';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  CHARACTERS,
  ELEMENT_VISUAL,
  MOBA_COLLISION_RECTS,
  MOBA_TOWER_ATTACK_RANGE,
  ARAM_TOWER_ATTACK_RANGE,
  MONSTERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WEAPON_ELEMENT,
  type CharacterKind,
  type CollisionRect,
} from '../shared/constants';
import type { BossProjectileState, CastleState, ClientToServer, GameMode, MobaCrystalState, MobaTeam, PlayerState, ServerToClient, Snapshot, TowerState } from '../shared/types';
import { decodeSnapshot, isBinarySnapshot } from '../shared/snapshot-codec';
import { loadVsMeta } from '../lib/vs-meta';

type SceneInit = {
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
};

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const cps = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
}

function resolveCollision(x: number, y: number, r: number, rects: CollisionRect[]): { x: number; y: number } {
  let nx = x, ny = y;
  for (const rect of rects) {
    const closestX = Math.max(rect.x, Math.min(nx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(ny, rect.y + rect.h));
    const dx = nx - closestX;
    const dy = ny - closestY;
    const dist2 = dx * dx + dy * dy;
    if (dist2 === 0) {
      const dL = nx - rect.x, dR = rect.x + rect.w - nx;
      const dT = ny - rect.y, dB = rect.y + rect.h - ny;
      const m = Math.min(dL, dR, dT, dB);
      if (m === dL)      nx = rect.x - r;
      else if (m === dR) nx = rect.x + rect.w + r;
      else if (m === dT) ny = rect.y - r;
      else               ny = rect.y + rect.h + r;
    } else if (dist2 < r * r) {
      const dist = Math.sqrt(dist2);
      nx += (dx / dist) * (r - dist);
      ny += (dy / dist) * (r - dist);
    }
  }
  return { x: nx, y: ny };
}

// Convert a hue (radians) to a tint color. hue=0 gives white (no shift).
// Uses HSL with high lightness so the existing colors come through but get a strong wash.
function hueToTint(hueRad: number): number {
  if (!hueRad) return 0xffffff;
  const h = (((hueRad * 180) / Math.PI) % 360 + 360) % 360;
  // Saturation 0.85, lightness 0.65 — vivid wash that's visible on top of the texture
  const s = 0.85, l = 0.65;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)        { r = c; g = x; b = 0; }
  else if (h < 120)  { r = x; g = c; b = 0; }
  else if (h < 180)  { r = 0; g = c; b = x; }
  else if (h < 240)  { r = 0; g = x; b = c; }
  else if (h < 300)  { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }
  const R = Math.round((r + m) * 255) & 0xff;
  const G = Math.round((g + m) * 255) & 0xff;
  const B = Math.round((b + m) * 255) & 0xff;
  return (R << 16) | (G << 8) | B;
}

// PartyKit always runs on :1999 in dev. In production set NEXT_PUBLIC_PARTYKIT_HOST.
const PARTY_HOST = (() => {
  if (typeof window === 'undefined') return 'localhost:1999';
  const env = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (env) return env;
  // Local dev only — production must set NEXT_PUBLIC_PARTYKIT_HOST.
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost:1999';
  console.error('[party] NEXT_PUBLIC_PARTYKIT_HOST is not set — multiplayer will not work.');
  return 'localhost:1999';
})();

const DIRS = ['south', 'north', 'east', 'west'] as const;
const WALK_FRAMES = 8; // default; used by animation builder (guards with textures.exists)

// Per-kind walk frame count. 0 = static sprites only, no walk animation.
// Anything not listed defaults to WALK_FRAMES (8).
const KIND_WALK_FRAMES: Record<string, number> = {
  // Static only (no walk sheet)
  dragon: 0, wraith: 0,
  // 4-frame kinds
  rat: 4, zombie_bear: 4, spider: 4, werewolf: 4,
  // All player characters: 4 frames
  blue_wizard: 4, fire_wizard: 4, salamander_wizard: 4, lightning_wizard: 4,
  earth_wizard: 4, forest_wizard: 4, shadow_wizard: 4, frog_wizard: 4,
  cat_wizard: 4, owl_wizard: 4, old_man_wizard: 4, mouse_apprentice: 4,
  knight: 4, rogue: 4, mage: 4,
};

// Per-kind per-direction overrides (takes priority over KIND_WALK_FRAMES).
// Used when a kind is missing walk frames for specific directions only.
const KIND_DIR_FRAMES: Record<string, Partial<Record<string, number>>> = {
  lightning_wizard: { north: 0 },
  forest_wizard:    { north: 0 },
  frog_wizard:      { north: 0 },
};

// Per-character render scale — default 1.0. All 12 wizards at 56×56.
const PLAYER_SPRITE_SCALE: Record<string, number> = {};

// Per-NPC render scale — overrides the default SHRINK for specific monsters.
// Used to make rats tiny (small swarm) and zombie bears huge (boss tank).
const NPC_SPRITE_SCALE: Record<string, number> = {
  rat: 0.55,
  rat_elite: 0.55, rat_veteran: 0.55,
  zombie_bear: 1.28,
  zombie_bear_elite: 1.28, zombie_bear_black: 1.28,
  dragon: 1.5,
  // Unique bosses — scaled up versions of base sprites
  rat_king: 3.5,
  bone_colossus: 2.8,
  plague_lord: 2.5,
  wraith_lord: 3.0,
  warchief: 2.8,
  ancient_treant: 2.2,
  alpha_wolf: 3.0,
  death_titan: 2.2,
};

// Variant kinds reuse their base kind's sprite sheet.
const VARIANT_BASE: Record<string, string> = {
  goblin_elite: 'goblin',    goblin_veteran: 'goblin',
  skeleton_elite: 'skeleton', skeleton_veteran: 'skeleton',
  zombie_elite: 'zombie_v2', zombie_veteran: 'zombie_v2',
  wraith_elite: 'wraith',    wraith_veteran: 'wraith',
  werewolf_elite: 'werewolf', werewolf_veteran: 'werewolf',
  rat_elite: 'rat',          rat_veteran: 'rat',
  zombie_bear_elite: 'zombie_bear', zombie_bear_black: 'zombie_bear',
  // Unique bosses
  rat_king: 'rat',
  bone_colossus: 'skeleton',
  plague_lord: 'bloated_zombie',
  wraith_lord: 'wraith',
  warchief: 'goblin_brute',
  ancient_treant: 'treant',
  alpha_wolf: 'werewolf',
  death_titan: 'zombie_bear',
};

// Only preload sprite sheets for kinds that have their own assets.
// VARIANT_BASE kinds reuse an existing base-kind sheet — skip them to avoid 404s.
const ALL_KINDS: readonly string[] = [
  ...CHARACTERS,
  ...MONSTERS.filter(m => !(m in VARIANT_BASE)),
];

// Tint applied to variant kinds so they're visually distinct from their base.
const VARIANT_TINT: Record<string, number> = {
  goblin_elite:      0xff9944,
  skeleton_elite:    0x44ccff,
  zombie_elite:      0x88ff44,
  wraith_elite:      0xff44ff,
  werewolf_elite:    0xff4444,
  rat_elite:         0xffcc44,
  zombie_bear_elite: 0xff6600,
  goblin_veteran:    0xff2200,
  skeleton_veteran:  0x2244ff,
  zombie_veteran:    0x44ff88,
  wraith_veteran:    0xcc00cc,
  werewolf_veteran:  0x880000,
  rat_veteran:       0xff8800,
  zombie_bear_black: 0x440044,
  // Unique bosses
  rat_king:       0xffd700,
  bone_colossus:  0x88ccff,
  plague_lord:    0x66ff22,
  wraith_lord:    0xee00ff,
  warchief:       0xff2200,
  ancient_treant: 0xff7700,
  alpha_wolf:     0x8b0000,
  death_titan:    0x440055,
};

// Global multiplier applied to every gameplay sprite (players, NPCs, projectiles, gems).
// Bump down to make the world feel less cluttered without regenerating assets.
const SPRITE_SHRINK = 0.72; // 0.8 × 0.9 — additional 10% on top of original 20% shrink

// Render-in-the-past buffer. Server ticks at 50Hz (20ms). 60ms = 3 ticks of
// headroom — masks any jitter where individual packets are 1-2 ticks late.
// Render this far in the past so interpolation always has a future snapshot to
// lerp toward. Measured live snapshot inter-arrival jitter (p99 ~86ms, peaks
// ~150ms under heavy waves) exceeded the old 60ms buffer, which caused entities
// to freeze-then-jump ("flick"). 120ms absorbs that jitter; the extra latency is
// imperceptible in a top-down survivor.
const INTERP_DELAY_MS = 120;

// Stable per-browser identity, persisted across reloads. Sent in the join payload so
// the server can replace this player's previous session on reconnect instead of
// leaving a duplicate ("stuck in room" bug). See dedupe-on-join in party/index.ts.
function getClientId(): string {
  const KEY = 'warena_client_id';
  const ephemeral = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ephemeral(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return ephemeral(); // localStorage blocked (private mode) — ephemeral id for this session
  }
}

type Facing = 'south' | 'north' | 'east' | 'west';

export class ArenaScene extends Phaser.Scene {
  // Public bus for React to listen on. Available immediately after construction
  // (Phaser's own `this.events` is only created during the scene lifecycle).
  bus: Phaser.Events.EventEmitter = new Phaser.Events.EventEmitter();

  init_: SceneInit;
  socket?: PartySocket;
  selfId = '';
  // Cached join payload so the watchdog can resend it after the server loses
  // our player record (e.g. Durable Object hibernation + cold-resume).
  joinPayload?: ClientToServer;
  // Timestamp of the last snapshot in which our own player appeared. If this
  // gets too stale, we resend join so the server respawns us.
  lastSelfSeenAt = 0;
  lastJoinResendAt = 0;
  // Snapshot history queue. Each entry stores the snapshot itself and the
  // perf.now() arrival time. We render at "now - INTERP_DELAY" so we always
  // have a future snapshot to lerp toward — masks network jitter completely.
  snapshotQueue: { snap: Snapshot; t: number }[] = [];
  // Convenience: latest received snapshot (used for HUD, self prediction).
  latestSnapshot?: Snapshot;
  prevSnapshot?: Snapshot;
  snapshotTime = 0;
  prevSnapshotTime = 0;

  // entity caches keyed by id
  playerSprites = new Map<string, Phaser.GameObjects.Container>();
  npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  npcPool = new Map<string, Phaser.GameObjects.Sprite[]>();
  gemSprites = new Map<string, Phaser.GameObjects.Sprite>();
  gemPool: Phaser.GameObjects.Sprite[] = [];
  projSprites = new Map<string, Phaser.GameObjects.Sprite>();
  projPool: Phaser.GameObjects.Sprite[] = [];
  wolfSprites = new Map<string, Phaser.GameObjects.Container>();
  wolfPool: Phaser.GameObjects.Container[] = [];
  dmgNumPool: Phaser.GameObjects.Text[] = [];
  // Per-player breadcrumb visuals for Trail of Fire (client-only).
  trailVisuals = new Map<string, { x: number; y: number; bornAt: number; sprite: Phaser.GameObjects.Graphics }[]>();
  trailPool: Phaser.GameObjects.Graphics[] = [];
  hazardVisuals = new Map<string, Phaser.GameObjects.Graphics>();
  hazardLabels = new Map<string, Phaser.GameObjects.Text>();
  waveAlerts: { x: number; y: number; bornAt: number }[] = [];
  // Last known facing per NPC — prevents snapping to 'south' when entity is stopped.
  npcFacing    = new Map<string, Facing>();
  // Smoothed movement velocity per NPC — exponential moving average to filter crowd-separation noise.
  npcSmoothVel = new Map<string, [number, number]>();
  pickupVisuals = new Map<string, Phaser.GameObjects.Graphics>();
  chestVisuals  = new Map<string, Phaser.GameObjects.Graphics>();
  _seenChests   = new Set<string>();
  bossProjectileVisuals = new Map<string, Phaser.GameObjects.Graphics>();
  bossAlertUntil = 0;
  bossAlertName = '';
  lastArenaElement: string = 'normal';
  // Castle Defender graphics
  castleGraphic: Phaser.GameObjects.Image | null = null;
  castleHpBar: Phaser.GameObjects.Graphics | null = null;
  castleGateMarkers: Phaser.GameObjects.Graphics[] = [];
  // Crystal Rush (MOBA) graphics
  mobaTowerGraphics   = new Map<string, Phaser.GameObjects.Image>();
  mobaTowerHpBars     = new Map<string, Phaser.GameObjects.Graphics>();
  mobaCrystalGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  mobaCrystalHpBars   = new Map<string, Phaser.GameObjects.Graphics>();
  mobaLanePaths: Phaser.GameObjects.Graphics | null = null;
  // Bush zones for vision mechanic: {x,y,r} circles
  mobaBushZones: { x: number; y: number; r: number }[] = [];
  selfMobaTeam: MobaTeam | undefined = undefined;
  prevPlayerPos = new Map<string, { x: number; y: number; t: number }>();
  // hit-flash tracking: playerId -> { lastHp, flashUntilMs }
  playerHpTrack = new Map<string, { lastHp: number; flashUntilMs: number }>();
  npcHpTrack = new Map<string, { lastHp: number; flashUntilMs: number }>();

  // Reusable collections — cleared and refilled each frame instead of
  // creating new Map/Set objects every render call.  Eliminates GC pressure
  // that manifests as periodic stutter even in single-player sessions.
  _prevPlayerById = new Map<string, PlayerState>();
  _prevNpcById    = new Map<string, { id: string; kind: string; x: number; y: number; hp: number; ownerPlayerId?: string }>();
  _seenPlayers    = new Set<string>();
  _seenNpcs       = new Set<string>();
  _seenGems       = new Set<string>();
  _seenProj       = new Set<string>();
  _renderProjBuf: { id: string; ownerId: string; x: number; y: number; vx: number; vy: number; weapon: string }[] = [];
  _playerById     = new Map<string, { id: string; x: number; y: number }>();
  _seenWolves     = new Set<string>();
  _seenPickups    = new Set<string>();
  _seenBossProj   = new Set<string>();
  _seenHazards    = new Set<string>();
  _cachedSelfPlayer: PlayerState | undefined = undefined;

  // Client-simulated projectiles (straight/wave/orbital) — no longer in snapshot
  clientProjs = new Map<string, {
    id: string; ownerId: string; x: number; y: number; vx: number; vy: number;
    weapon: string; lifetime: number; pattern: string;
    // orbital
    orbitAngle?: number; orbitSpinSpeed?: number; orbitRadius?: number;
    // wave
    perpX?: number; perpY?: number; baseX?: number; baseY?: number; waveTime?: number;
  }>();

  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keyW!: Phaser.Input.Keyboard.Key;
  keyA!: Phaser.Input.Keyboard.Key;
  keyS!: Phaser.Input.Keyboard.Key;
  keyD!: Phaser.Input.Keyboard.Key;
  keyM!: Phaser.Input.Keyboard.Key;
  // Mouse control: hold left button to move toward cursor; right-click toggles always-on
  mouseDown = false;
  mouseAlwaysOn = false;
  bgmTracks: Phaser.Sound.BaseSound[] = [];
  bgmIdx = 0;
  musicMuted = false;
  musicVol = 0.5;
  sfxVol = 0.5;
  // SFX synth
  audioCtx?: AudioContext;
  // Track previous values to detect events for SFX
  prevSelfXp = -1;
  prevSelfLevel = -1;
  prevSelfHp = -1;
  prevSelfAlive = true;

  inputDx = 0;
  inputDy = 0;
  lastSentInput = { dx: 0, dy: 0, t: 0 };

  // Virtual joystick (mobile only)
  isMobile = false;
  joystickPointer: Phaser.Input.Pointer | null = null;
  joystickOriginX = 0;
  joystickOriginY = 0;
  joystickDx = 0;
  joystickDy = 0;
  joystickBase: Phaser.GameObjects.Graphics | null = null;
  joystickKnob: Phaser.GameObjects.Graphics | null = null;

  // client-side prediction for self
  predictedSelf?: { x: number; y: number };
  // pending reconciliation correction — bled into predictedSelf gradually each frame
  // instead of applied all at once, eliminating the direction-change stutter
  corrX = 0;
  corrY = 0;
  // smoothed camera target — lerps toward predictedSelf to absorb reconciliation jolts
  camX?: number;
  camY?: number;

  constructor(init: SceneInit) {
    super('arena');
    this.init_ = init;
  }

  preload() {
    // Two texture atlases replace ~976 individual image loads.
    // atlas: standard sprites ≤56px. atlas_large: rat/dragon >56px.
    this.load.atlas('atlas', '/atlas.png', '/atlas.json');
    this.load.atlas('atlas_large', '/atlas_large.png', '/atlas_large.json');

    this.load.audio('bgm0', '/audio/bgm.mp3');
    this.load.audio('bgm1', '/audio/bmg1.mp3');
    this.load.audio('bgm2', '/audio/bmg2.mp3');

    // MOBA/ARAM scene objects (not in atlas — separate folder)
    for (const name of ['Bush1', 'Bush2', 'SmallTree1', 'SmallTree2', 'Tree1', 'Tree2', 'TowerBlue', 'TowerRed', 'InibidorBlue', 'InibidorRed']) {
      this.load.image(`scene_${name}`, `/Scene/${name}.png`);
    }

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      void file;
    });
  }

  hasFrame(key: string): boolean {
    const tex = this.textures.get('atlas');
    if (tex && tex.has(key)) return true;
    const large = this.textures.get('atlas_large');
    return !!large && large.has(key);
  }

  atlasFor(key: string): string {
    const large = this.textures.get('atlas_large');
    if (large && large.has(key)) return 'atlas_large';
    return 'atlas';
  }

  // ── Procedural ground tile generation ─────────────────────────────────
  buildGroundTextures() {
    const make = (key: string, w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void) => {
      if (this.textures.exists(key)) return;
      const ct = this.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture;
      const ctx = ct.getCanvas().getContext('2d');
      if (!ctx) return;
      fn(ctx);
      ct.refresh();
    };

    // Dark jungle grass — base color + random noise strips + grass blades + shadow patches
    make('tile_grass', 64, 64, (ctx) => {
      ctx.fillStyle = '#1c4209';
      ctx.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 130; i++) {
        const x = Math.random() * 64, y = Math.random() * 64;
        const l = 0.55 + Math.random() * 0.65;
        ctx.fillStyle = `rgba(${(26*l)|0},${(82*l)|0},${(10*l)|0},0.55)`;
        ctx.fillRect(x, y, 1 + Math.random() * 3, 1);
      }
      for (let i = 0; i < 14; i++) {
        const bx = (Math.random() * 60 + 2) | 0, by = (Math.random() * 57 + 5) | 0;
        ctx.fillStyle = 'rgba(55,132,22,0.82)';
        ctx.fillRect(bx, by - 3, 1, 4);
        ctx.fillStyle = 'rgba(82,168,36,0.55)';
        ctx.fillRect(bx + 1, by - 4, 1, 4);
      }
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fillRect(Math.random() * 56, Math.random() * 56, 5 + Math.random() * 8, 3 + Math.random() * 5);
      }
    });

    // Sandy dirt path — warm brown base + pebbles + scuff marks
    make('tile_dirt', 64, 64, (ctx) => {
      ctx.fillStyle = '#7a5a1e';
      ctx.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 110; i++) {
        const x = Math.random() * 64, y = Math.random() * 64;
        const l = 0.62 + Math.random() * 0.58;
        ctx.fillStyle = `rgba(${(132*l)|0},${(96*l)|0},${(30*l)|0},0.46)`;
        ctx.fillRect(x, y, 1 + Math.random() * 3, 1);
      }
      for (let i = 0; i < 9; i++) {
        const x = 2 + Math.random() * 60, y = 2 + Math.random() * 60;
        ctx.fillStyle = 'rgba(178,148,92,0.62)';
        ctx.beginPath();
        ctx.arc(x, y, 1 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(88,60,12,0.38)';
        ctx.fillRect(Math.random() * 52, Math.random() * 62, 4 + Math.random() * 10, 1);
      }
    });
  }

  create() {
    this.musicVol = this.init_.musicVol ?? 0.5;
    this.sfxVol = this.init_.sfxVol ?? 0.5;
    this.makeFallbackTextures();
    this.makeArenaBackground();
    this.registerAnimations();
    this.warmPools();

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey('W');
      this.keyA = this.input.keyboard.addKey('A');
      this.keyS = this.input.keyboard.addKey('S');
      this.keyD = this.input.keyboard.addKey('D');
      this.keyM = this.input.keyboard.addKey('M');
      this.keyM.on('down', () => this.toggleMusic());
    }

    // Mouse: hold LEFT to move toward cursor; right-click toggles always-on follow.
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.mouseAlwaysOn = !this.mouseAlwaysOn;
      } else if (pointer.leftButtonDown()) {
        this.mouseDown = true;
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) this.mouseDown = false;
    });

    // Virtual joystick — enabled on touch devices
    this.isMobile =
      ('ontouchstart' in window && navigator.maxTouchPoints > 0) ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (this.isMobile) {
      const RADIUS = 64;

      const clearJoystick = (ptr: Phaser.Input.Pointer) => {
        if (ptr !== this.joystickPointer) return;
        this.joystickPointer = null;
        this.joystickDx = 0;
        this.joystickDy = 0;
        this.joystickBase?.destroy();
        this.joystickKnob?.destroy();
        this.joystickBase = null;
        this.joystickKnob = null;
      };

      this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        if (this.joystickPointer) return; // already tracking a touch
        this.joystickPointer = ptr;
        this.joystickOriginX = ptr.x;
        this.joystickOriginY = ptr.y;
        this.joystickDx = 0;
        this.joystickDy = 0;
        this.renderJoystick(ptr.x, ptr.y, ptr.x, ptr.y, RADIUS);
      });

      this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
        if (ptr !== this.joystickPointer) return;
        const rawDx = ptr.x - this.joystickOriginX;
        const rawDy = ptr.y - this.joystickOriginY;
        const dist = Math.hypot(rawDx, rawDy) || 1;
        const scale = dist > RADIUS ? RADIUS / dist : 1;
        this.joystickDx = (rawDx * scale) / RADIUS;
        this.joystickDy = (rawDy * scale) / RADIUS;
        this.renderJoystick(
          this.joystickOriginX, this.joystickOriginY,
          this.joystickOriginX + rawDx * scale,
          this.joystickOriginY + rawDy * scale,
          RADIUS,
        );
      });

      this.input.on('pointerup', clearJoystick);
      this.input.on('pointerupoutside', clearJoystick);
    }

    // Background music playlist — advances to the next track when each one ends
    const trackKeys = ['bgm0', 'bgm1', 'bgm2'];
    for (const key of trackKeys) {
      if (this.cache.audio.exists(key)) {
        const t = this.sound.add(key, { loop: false, volume: this.musicVol * 0.32 });
        t.on('complete', () => {
          if (this.musicMuted) return;
          this.bgmIdx = (this.bgmIdx + 1) % this.bgmTracks.length;
          this.bgmTracks[this.bgmIdx]?.play();
        });
        this.bgmTracks.push(t);
      }
    }
    // Shuffle playlist order so it doesn't always start from track 0
    for (let i = this.bgmTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.bgmTracks[i], this.bgmTracks[j]] = [this.bgmTracks[j], this.bgmTracks[i]];
    }

    const startAudio = () => {
      if (!this.audioCtx) {
        try {
          const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (Ctx) this.audioCtx = new Ctx();
        } catch (e) { void e; }
      }
      if (this.bgmTracks.length > 0 && !this.bgmTracks[this.bgmIdx].isPlaying && !this.musicMuted) {
        this.bgmTracks[this.bgmIdx].play();
      }
    };
    this.input.once('pointerdown', startAudio);
    this.input.keyboard?.once('keydown', startAudio);

    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.cameras.main.setZoom(1.2); // matches the "browser at 80%" feel — more visible arena
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.cameras.main.setRoundPixels(false); // sub-pixel positioning = smoother camera

    this.connect();

    // Standalone connection watchdog: every 2 seconds, if the socket is open
    // but we still haven't seen our own player in any snapshot in 3+ seconds,
    // re-send the join payload. Catches the case where snapshots aren't
    // arriving at all (e.g. DO hibernation lost in-memory state).
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => this.connectionWatchdog(),
    });
  }

  connectionWatchdog() {
    if (!this.socket || this.socket.readyState !== 1) return;
    if (!this.joinPayload) return;
    const now = performance.now();
    const stale = now - this.lastSelfSeenAt > 3000;
    const cooldown = now - this.lastJoinResendAt > 2000;
    if (stale && cooldown) {
      this.lastJoinResendAt = now;
      this.socket.send(JSON.stringify(this.joinPayload));
    }
  }

  warmPools() {
    // Pre-allocate NPC sprites so first wave spawns never create objects from scratch.
    // Counts are tuned to typical wave sizes per kind.
    const npcWarmCount: Record<string, number> = {
      rat: 12, goblin: 10, goblin_scratcher: 10, feral_goblin: 10, wraith: 10,
      skeleton: 8, skeleton_knight: 8, stalker_skeleton: 8, crawling_skeleton: 8,
      zombie_v2: 8, zombie_b: 8, ghoul: 8, bloated_zombie: 8,
      goblin_brute: 6, fat_goblin: 6, spider: 6, treant: 4, slime: 4, werewolf: 4,
      zombie_bear: 3, dragon: 1,
      // Elite variants
      goblin_elite: 8, skeleton_elite: 8, zombie_elite: 8,
      wraith_elite: 6, werewolf_elite: 6, rat_elite: 14, zombie_bear_elite: 2,
      // Veteran variants
      goblin_veteran: 6, skeleton_veteran: 6, zombie_veteran: 6,
      wraith_veteran: 5, werewolf_veteran: 5, rat_veteran: 14, zombie_bear_black: 2,
      // Unique bosses — only 1 per kind ever active, but pre-allocate the sprite
      rat_king: 1, bone_colossus: 1, plague_lord: 1, wraith_lord: 1,
      warchief: 1, ancient_treant: 1, alpha_wolf: 1, death_titan: 1,
    };
    for (const [kind, count] of Object.entries(npcWarmCount)) {
      const baseKind = VARIANT_BASE[kind] ?? kind;
      const tex = `${baseKind}_south`;
      const npcScale = (NPC_SPRITE_SCALE[kind] ?? 1) * SPRITE_SHRINK;
      const pool: Phaser.GameObjects.Sprite[] = [];
      for (let i = 0; i < count; i++) {
        const frameKey = this.hasFrame(tex) ? tex : 'skeleton_south';
        const s = this.add.sprite(0, 0, this.atlasFor(frameKey), frameKey);
        s.setScale(npcScale).setData('baseScale', npcScale).setData('kind', kind);
        s.setDepth(10).setVisible(false).setActive(false);
        pool.push(s);
      }
      this.npcPool.set(kind, pool);
    }

    // Pre-allocate projectile sprites — 20 per element type.
    const projElements = ['arcane', 'fire', 'lightning', 'earth', 'forest', 'shadow'];
    for (const elem of projElements) {
      for (let i = 0; i < 20; i++) {
        const s = this.add.sprite(0, 0, 'atlas', `proj_${elem}`);
        s.setBlendMode(elem === 'earth' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
        s.setVisible(false).setActive(false);
        this.projPool.push(s);
      }
    }

    // Pre-allocate gem sprites — more of common tiers.
    for (const [tex, count] of [['gem_blue', 20], ['gem_green', 15], ['gem_gold', 10], ['gem_epic', 5]] as const) {
      for (let i = 0; i < count; i++) {
        const s = this.add.sprite(0, 0, 'atlas', tex);
        s.setBlendMode(Phaser.BlendModes.NORMAL).setVisible(false).setActive(false);
        this.gemPool.push(s);
      }
    }

    // Pre-allocate damage number texts — high frequency, short lifetime.
    for (let i = 0; i < 40; i++) {
      const txt = this.add.text(0, 0, '0', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffe080',
        stroke: '#000000', strokeThickness: 3,
      });
      txt.setOrigin(0.5, 0.5).setDepth(50).setVisible(false).setActive(false);
      this.dmgNumPool.push(txt);
    }

    // Pre-allocate spirit wolf containers.
    for (let i = 0; i < 12; i++) {
      const container = this.add.container(0, 0);
      container.setDepth(20);
      const glow = this.add.graphics().setName('glow').setBlendMode(Phaser.BlendModes.ADD);
      container.add(glow);
      if (this.hasFrame('icon_wolf')) {
        const head = this.add.sprite(0, 0, 'atlas', 'icon_wolf').setName('head').setScale(0.55);
        container.add(head);
      }
      container.setVisible(false).setActive(false);
      this.wolfPool.push(container);
    }

    // Pre-allocate trail of fire puff graphics.
    for (let i = 0; i < 24; i++) {
      const g = this.add.graphics();
      g.setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      g.setVisible(false).setActive(false);
      this.trailPool.push(g);
    }
  }

  makeFallbackTextures() {
    const g = this.add.graphics();
    // Skip procedural fallback if atlas already provides this frame or a standalone texture exists.
    const ensure = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void, w = 32, h = 32) => {
      if (this.textures.exists(key) || this.hasFrame(key)) return;
      g.clear();
      draw(g);
      g.generateTexture(key, w, h);
    };

    // Procedural fallbacks for any kind whose real sprite hasn't loaded yet.
    const fallbackColors: Record<string, number> = {
      blue_wizard: 0x6a8eff,
      fire_wizard: 0xff6a4a,
      salamander_wizard: 0xffaa55,
      lightning_wizard: 0xffff66,
      earth_wizard: 0xa07a4a,
      forest_wizard: 0x66cc66,
      shadow_wizard: 0x8a55aa,
      mouse_apprentice: 0xddccaa,
      frog_wizard: 0x66cc66,
      old_man_wizard: 0x6688dd,
      owl_wizard: 0x886688,
      cat_wizard: 0x99bb55,
      skeleton: 0xeeeeee,
      skeleton_knight: 0xccccee,
      stalker_skeleton: 0xddeedd,
      crawling_skeleton: 0xddddcc,
      zombie_v2: 0x6aaa6a,
      zombie_b: 0x77aa66,
      bloated_zombie: 0x88bb44,
      ghoul: 0xaa9988,
      goblin: 0x88aa44,
      goblin_brute: 0x66884a,
      goblin_scratcher: 0x99bb55,
      feral_goblin: 0xaacc44,
      fat_goblin: 0x778833,
      treant: 0x4a6633,
      slime: 0x66ccaa,
      spider: 0x222222,
      wraith: 0x9988aa,
      werewolf: 0x665544,
      rat: 0x6a4a3a,
      zombie_bear: 0x3a2a1a,
      dragon: 0x6a1a1a,
    };
    for (const [c, col] of Object.entries(fallbackColors)) {
      for (const dir of DIRS) {
        ensure(`${c}_${dir}`, (gg) => {
          gg.fillStyle(col, 1);
          gg.fillCircle(16, 18, 11);
          gg.lineStyle(1, 0x000000, 1);
          gg.strokeCircle(16, 18, 11);
        });
      }
    }
    // Gems by tier — distinct colors and shapes
    const drawGem = (
      gg: Phaser.GameObjects.Graphics,
      fill: number,
      core: number,
      glow: number,
      outline: number,
    ) => {
      // soft glow halo
      gg.fillStyle(glow, 0.30); gg.fillCircle(16, 16, 12);
      gg.fillStyle(glow, 0.55); gg.fillCircle(16, 16, 9);
      // diamond body
      gg.fillStyle(fill, 1);
      gg.beginPath();
      gg.moveTo(16, 5); gg.lineTo(26, 16); gg.lineTo(16, 27); gg.lineTo(6, 16);
      gg.closePath(); gg.fillPath();
      // bright core highlight
      gg.fillStyle(core, 1);
      gg.beginPath();
      gg.moveTo(16, 8); gg.lineTo(20, 14); gg.lineTo(16, 18); gg.lineTo(12, 14);
      gg.closePath(); gg.fillPath();
      // outline
      gg.lineStyle(1, outline, 1);
      gg.beginPath();
      gg.moveTo(16, 5); gg.lineTo(26, 16); gg.lineTo(16, 27); gg.lineTo(6, 16);
      gg.closePath(); gg.strokePath();
    };
    ensure('gem_blue',  (gg) => drawGem(gg, 0x44aaff, 0xddeeff, 0x88ccff, 0x224466), 32, 32);
    ensure('gem_green', (gg) => drawGem(gg, 0x44dd77, 0xddffdd, 0x88ee99, 0x226633), 32, 32);
    ensure('gem_gold',  (gg) => drawGem(gg, 0xffcc44, 0xffffaa, 0xffe066, 0x665522), 32, 32);
    // Epic gem: star-burst shape
    ensure('gem_epic', (gg) => {
      gg.fillStyle(0xff44aa, 0.30); gg.fillCircle(20, 20, 16);
      gg.fillStyle(0xff44aa, 0.55); gg.fillCircle(20, 20, 12);
      // 8-pointed star (two squares rotated 45deg)
      gg.fillStyle(0xff77cc, 1);
      gg.beginPath();
      gg.moveTo(20, 4); gg.lineTo(28, 12); gg.lineTo(36, 20); gg.lineTo(28, 28);
      gg.lineTo(20, 36); gg.lineTo(12, 28); gg.lineTo(4, 20); gg.lineTo(12, 12);
      gg.closePath(); gg.fillPath();
      gg.fillStyle(0xffaaee, 1);
      gg.beginPath();
      gg.moveTo(20, 11); gg.lineTo(25, 16); gg.lineTo(29, 20); gg.lineTo(25, 24);
      gg.lineTo(20, 29); gg.lineTo(15, 24); gg.lineTo(11, 20); gg.lineTo(15, 16);
      gg.closePath(); gg.fillPath();
      gg.fillStyle(0xffffff, 1); gg.fillCircle(20, 20, 3);
    }, 40, 40);
    // ---- Per-element projectile textures ----

    // Arcane: classic glowing blue orb
    ensure('proj_arcane', (gg) => {
      gg.fillStyle(0x4488ff, 0.20); gg.fillCircle(16, 16, 14);
      gg.fillStyle(0x66aaff, 0.45); gg.fillCircle(16, 16, 10);
      gg.fillStyle(0xaaccff, 0.75); gg.fillCircle(16, 16, 7);
      gg.fillStyle(0xffffff, 1);    gg.fillCircle(16, 16, 4);
    }, 32, 32);

    // Fire: flame teardrop with hot core + flickering tail
    ensure('proj_fire', (gg) => {
      // outer red glow
      gg.fillStyle(0xff2200, 0.30); gg.fillCircle(16, 18, 12);
      // mid orange body
      gg.fillStyle(0xff7733, 0.85); gg.fillCircle(16, 18, 9);
      // teardrop top
      gg.fillStyle(0xff5511, 1);
      gg.beginPath();
      gg.moveTo(13, 14); gg.lineTo(16, 3); gg.lineTo(19, 14);
      gg.closePath(); gg.fillPath();
      // inner yellow
      gg.fillStyle(0xffdd44, 1); gg.fillCircle(16, 18, 6);
      // white-hot core
      gg.fillStyle(0xffffff, 1); gg.fillCircle(16, 18, 3);
    }, 32, 32);

    // Lightning: jagged zigzag bolt
    ensure('proj_lightning', (gg) => {
      // halo
      gg.fillStyle(0xffff66, 0.25); gg.fillCircle(16, 16, 12);
      // outer bolt (yellow, thicker)
      gg.lineStyle(5, 0xffee44, 1);
      gg.beginPath();
      gg.moveTo(6, 4); gg.lineTo(13, 11); gg.lineTo(9, 14); gg.lineTo(20, 21); gg.lineTo(15, 24); gg.lineTo(24, 30);
      gg.strokePath();
      // inner bolt (white core)
      gg.lineStyle(2, 0xffffff, 1);
      gg.beginPath();
      gg.moveTo(6, 4); gg.lineTo(13, 11); gg.lineTo(9, 14); gg.lineTo(20, 21); gg.lineTo(15, 24); gg.lineTo(24, 30);
      gg.strokePath();
    }, 32, 32);

    // Earth: chunky rocky polygon
    ensure('proj_earth', (gg) => {
      // shadow
      gg.fillStyle(0x000000, 0.35); gg.fillEllipse(16, 24, 18, 5);
      // rock body
      gg.fillStyle(0x886644, 1);
      gg.beginPath();
      gg.moveTo(7, 14); gg.lineTo(11, 7); gg.lineTo(19, 6);
      gg.lineTo(25, 12); gg.lineTo(24, 20); gg.lineTo(16, 25);
      gg.lineTo(8, 21); gg.closePath(); gg.fillPath();
      // top highlight
      gg.fillStyle(0xbb9966, 1);
      gg.beginPath();
      gg.moveTo(11, 7); gg.lineTo(19, 6); gg.lineTo(20, 12); gg.lineTo(13, 13);
      gg.closePath(); gg.fillPath();
      // dark crack
      gg.lineStyle(1, 0x442211, 0.8);
      gg.beginPath(); gg.moveTo(13, 16); gg.lineTo(20, 15); gg.strokePath();
      gg.beginPath(); gg.moveTo(15, 12); gg.lineTo(17, 18); gg.strokePath();
      // outline
      gg.lineStyle(1, 0x331100, 1);
      gg.beginPath();
      gg.moveTo(7, 14); gg.lineTo(11, 7); gg.lineTo(19, 6);
      gg.lineTo(25, 12); gg.lineTo(24, 20); gg.lineTo(16, 25);
      gg.lineTo(8, 21); gg.closePath(); gg.strokePath();
    }, 32, 32);

    // Forest: leaf with darker veins
    ensure('proj_forest', (gg) => {
      // soft glow
      gg.fillStyle(0x66cc66, 0.22); gg.fillCircle(16, 16, 12);
      // leaf body
      gg.fillStyle(0x44aa44, 1); gg.fillEllipse(16, 16, 22, 11);
      // bright highlight
      gg.fillStyle(0x88dd66, 1); gg.fillEllipse(13, 14, 9, 5);
      // central vein
      gg.lineStyle(1, 0x226622, 1);
      gg.beginPath(); gg.moveTo(6, 16); gg.lineTo(26, 16); gg.strokePath();
      // side veins
      gg.lineStyle(1, 0x336633, 0.7);
      gg.beginPath(); gg.moveTo(11, 13); gg.lineTo(13, 18); gg.strokePath();
      gg.beginPath(); gg.moveTo(17, 13); gg.lineTo(15, 18); gg.strokePath();
      gg.beginPath(); gg.moveTo(21, 13); gg.lineTo(19, 18); gg.strokePath();
      // tip point
      gg.fillStyle(0x336633, 1); gg.fillTriangle(26, 16, 30, 14, 30, 18);
    }, 32, 32);

    // Shadow: dark blob with purple aura
    ensure('proj_shadow', (gg) => {
      gg.fillStyle(0xaa44dd, 0.30); gg.fillCircle(16, 16, 13);
      gg.fillStyle(0x661199, 0.75); gg.fillCircle(16, 16, 10);
      gg.fillStyle(0x220033, 1);    gg.fillCircle(16, 16, 7);
      gg.fillStyle(0xeeaaff, 1);    gg.fillCircle(16, 16, 3);
      // orbiting dark wisps
      gg.fillStyle(0x441166, 0.8);
      gg.fillCircle(11, 11, 1.5); gg.fillCircle(22, 12, 1.5);
      gg.fillCircle(12, 22, 1.5); gg.fillCircle(22, 21, 1.5);
    }, 32, 32);

    // Shield bubble (cyan magical aura around player on invuln)
    ensure('shield', (gg) => {
      // outer bright ring
      gg.lineStyle(3, 0x88eeff, 1); gg.strokeCircle(40, 40, 36);
      // inner ring
      gg.lineStyle(1, 0xffffff, 0.85); gg.strokeCircle(40, 40, 32);
      // soft inner fill
      gg.fillStyle(0x88eeff, 0.10); gg.fillCircle(40, 40, 34);
      // 4 cardinal "rune" marks
      gg.fillStyle(0xffffff, 1);
      gg.fillRect(38, 2, 4, 6);   gg.fillRect(38, 72, 4, 6);
      gg.fillRect(2, 38, 6, 4);   gg.fillRect(72, 38, 6, 4);
      // diagonal accents
      gg.fillStyle(0x88eeff, 0.9);
      gg.fillRect(13, 13, 3, 3); gg.fillRect(64, 13, 3, 3);
      gg.fillRect(13, 64, 3, 3); gg.fillRect(64, 64, 3, 3);
    }, 80, 80);

    // Seamless 128×128 procedural floor — dark base + tonal noise, no edges/grid lines
    if (!this.textures.exists('floor')) {
      g.clear();
      g.fillStyle(0x14142a, 1);
      g.fillRect(0, 0, 128, 128);
      // tonal noise: many small subtle dots
      const seed = (i: number) => ((i * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 220; i++) {
        const x = Math.floor(seed(i * 2) * 128);
        const y = Math.floor(seed(i * 2 + 1) * 128);
        const v = seed(i + 999);
        if (v > 0.5) {
          g.fillStyle(0x1a1a3a, 0.6);
        } else {
          g.fillStyle(0x0a0a18, 0.6);
        }
        g.fillRect(x, y, 1 + Math.floor(v * 2), 1 + Math.floor(v * 2));
      }
      // a few highlight pixels for visual interest
      for (let i = 0; i < 30; i++) {
        const x = Math.floor(seed(i * 7 + 33) * 128);
        const y = Math.floor(seed(i * 7 + 47) * 128);
        g.fillStyle(0x20204a, 0.4);
        g.fillRect(x, y, 1, 1);
      }
      g.generateTexture('floor', 128, 128);
    }

    g.destroy();
  }

  registerAnimations() {
    for (const c of ALL_KINDS) {
      const kindFrames = KIND_WALK_FRAMES[c] ?? WALK_FRAMES;
      for (const dir of DIRS) {
        const key = `${c}_walk_${dir}`;
        if (this.anims.exists(key)) continue;
        const dirFrames = KIND_DIR_FRAMES[c]?.[dir] ?? kindFrames;
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 0; i < dirFrames; i++) {
          const fk = `${c}_walk_${dir}_${i}`;
          if (this.hasFrame(fk)) frames.push({ key: this.atlasFor(fk), frame: fk });
        }
        if (frames.length >= 2) {
          this.anims.create({ key, frames, frameRate: 8, repeat: -1 });
        }
      }
    }
  }

  makeArenaBackground() {
    // Main green tile across the whole arena — use atlas frame if loaded, else procedural
    const hasGreen = this.hasFrame('floor_green');
    const ts = this.add.tileSprite(
      ARENA_WIDTH / 2,
      ARENA_HEIGHT / 2,
      ARENA_WIDTH,
      ARENA_HEIGHT,
      hasGreen ? 'atlas' : 'floor',
      hasGreen ? 'floor_green' : undefined,
    );
    ts.setDepth(-100);

    // Sparse decoration patches (deterministic so they don't reshuffle each frame)
    const seed = (i: number) => ((i * 9301 + 49297) % 233280) / 233280;
    const placePatches = (key: string, count: number, seedOffset: number, scaleMin: number, scaleMax: number) => {
      if (!this.hasFrame(key)) return;
      for (let i = 0; i < count; i++) {
        const x = seed((i + seedOffset) * 2) * ARENA_WIDTH;
        const y = seed((i + seedOffset) * 2 + 1) * ARENA_HEIGHT;
        const scale = scaleMin + seed((i + seedOffset) * 3 + 7) * (scaleMax - scaleMin);
        const rot = seed((i + seedOffset) * 5 + 11) * Math.PI * 2;
        this.add
          .image(x, y, 'atlas', key)
          .setScale(scale)
          .setRotation(rot)
          .setDepth(-99)
          .setAlpha(0.85);
      }
    };
    // Dirt patches: ~40 across the arena, varying scale 1-2x, gives subtle path/stain feel
    placePatches('floor_dirt', 40, 0, 1.0, 2.2);
    // Rocks (rarer, larger): ~12 if the asset exists
    placePatches('floor_rocks', 12, 1000, 0.8, 1.5);

    // Border
    const border = this.add.graphics();
    border.lineStyle(4, 0x553388, 1);
    border.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    border.setDepth(-50);
  }

  connect() {
    const { name, character, color, room, country, roomName, roomPassword } = this.init_;
    const socket = new PartySocket({
      host: PARTY_HOST,
      room: room || 'main',
      party: 'main',
    });
    this.socket = socket;
    // Snapshots arrive as binary frames (see shared/snapshot-codec.ts). Ask the
    // socket to deliver them as ArrayBuffer (not Blob) so we can decode synchronously.
    // binaryType is a standard WebSocket attribute PartySocket re-applies on reconnect.
    socket.binaryType = 'arraybuffer';

    // Build the join payload once and cache it so the watchdog can resend.
    this.joinPayload = {
      type: 'join',
      name, character, color,
      hue: this.init_.hue,
      country,
      roomName,
      roomPassword,
      gameMode: this.init_.gameMode,
      clientId: getClientId(),
      ...(this.init_.gameMode === 'wizard_survivor' ? { vsMetaRanks: loadVsMeta().ranks } : {}),
    };

    // Re-send join on every open (initial + reconnects after server HMR/restart)
    socket.addEventListener('open', () => {
      if (this.joinPayload) socket.send(JSON.stringify(this.joinPayload));
      this.lastSelfSeenAt = performance.now();
    });
    socket.addEventListener('message', (e) => {
      try {
        // Snapshots come as binary ArrayBuffer; all other messages stay JSON strings.
        if (e.data instanceof ArrayBuffer) {
          if (isBinarySnapshot(e.data)) {
            this.handleServerMessage(decodeSnapshot(e.data));
          }
          return;
        }
        const msg: ServerToClient = JSON.parse(e.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.warn('[party] bad message', err);
      }
    });
    socket.addEventListener('close', () => {
      console.warn('[party] disconnected — partysocket will auto-reconnect');
    });
    socket.addEventListener('error', (e) => {
      console.error('[party] error', e);
    });

    // Heartbeat: send a ping every 5s so the server keeps lastTouchAt fresh
    // and zombie-reaper doesn't remove an idle-but-connected player.
    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' } satisfies ClientToServer));
      },
    });
  }

  handleServerMessage(msg: ServerToClient) {
    if (msg.type === 'welcome') {
      this.selfId = msg.selfId;
    } else if (msg.type === 'snapshot') {
      const arrivedAt = performance.now();
      this.snapshotQueue.push({ snap: msg, t: arrivedAt });
      // Keep ~10 snapshots of history (~200ms at 50Hz). Drop anything older than
      // 4× INTERP_DELAY since it can never be needed for interpolation.
      const cutoff = arrivedAt - INTERP_DELAY_MS * 4;
      while (this.snapshotQueue.length > 0 && this.snapshotQueue[0].t < cutoff) {
        this.snapshotQueue.shift();
      }
      this.prevSnapshot = this.latestSnapshot;
      this.prevSnapshotTime = this.snapshotTime;
      this.latestSnapshot = msg;
      this.snapshotTime = arrivedAt;
      this._playerById.clear();
      for (const p of msg.players) this._playerById.set(p.id, p);
      if (msg.newProjs) {
        for (const proj of msg.newProjs) {
          this.clientProjs.set(proj.id, {
            id: proj.id, ownerId: proj.ownerId, x: proj.x, y: proj.y,
            vx: proj.vx, vy: proj.vy, weapon: proj.weapon, lifetime: proj.lifetime,
            pattern: proj.pattern, orbitAngle: proj.orbitAngle, orbitSpinSpeed: proj.orbitSpinSpeed,
            orbitRadius: proj.orbitRadius, perpX: proj.perpX, perpY: proj.perpY,
            baseX: proj.x, baseY: proj.y, waveTime: 0,
          });
          if (proj.ownerId === this.selfId) this.sfxFire(proj.weapon as any);
        }
      }
      if (msg.deadProjs) {
        for (const id of msg.deadProjs) {
          this.clientProjs.delete(id);
          const s = this.projSprites.get(id);
          if (s) { s.setVisible(false).setActive(false); this.projPool.push(s); this.projSprites.delete(id); }
        }
      }
      if (msg.effects) {
        for (const fx of msg.effects) {
          if (fx.kind === 'lightning') this.spawnLightningEffect(fx.x, fx.y);
          else if (fx.kind === 'meteor') this.spawnMeteorEffect(fx.x, fx.y);
          else if (fx.kind === 'frostNova') this.spawnFrostNovaEffect(fx.x, fx.y, fx.radius ?? 160);
          else if (fx.kind === 'holySmite') this.spawnHolySmiteEffect(fx.x, fx.y);
          else if (fx.kind === 'blackHole') this.spawnBlackHoleEffect(fx.x, fx.y, fx.durationMs ?? 3000);
          else if (fx.kind === 'chainExplosion') this.spawnChainExplosionEffect(fx.x, fx.y);
          else if (fx.kind === 'phoenixRevive') this.spawnPhoenixReviveEffect(fx.x, fx.y);
          else if (fx.kind === 'earthquake') this.spawnEarthquakeEffect(fx.x, fx.y, fx.radius ?? 200);
          else if (fx.kind === 'timeStop') this.spawnTimeStopEffect(fx.x, fx.y, fx.radius ?? 600);
          else if (fx.kind === 'castleDestroyed') { this.cameras.main.shake(1200, 0.025); this.spawnCastleDestroyedEffect(fx.x, fx.y); this.bus.emit('castleDestroyed'); }
          else if (fx.kind === 'towerShot') this.spawnTowerShotEffect(fx.x, fx.y, fx.tx ?? fx.x, fx.ty ?? fx.y, (fx.team ?? 'blue') as any);
          else if (fx.kind === 'towerDestroyed') { this.cameras.main.shake(400, 0.01); this.spawnCastleDestroyedEffect(fx.x, fx.y); }
          else if (fx.kind === 'crystalDestroyed') { this.cameras.main.shake(1500, 0.03); this.spawnCastleDestroyedEffect(fx.x, fx.y); this.bus.emit('crystalDestroyed', fx.team as any); }
        }
      }
      // reconcile predicted self toward server position
      if (this.selfId) {
        const self = msg.players.find((p) => p.id === this.selfId);
        if (self) {
          this.lastSelfSeenAt = arrivedAt;
          if (!this.predictedSelf) {
            this.predictedSelf = { x: self.x, y: self.y };
            this.camX = self.x;
            this.camY = self.y;
            this.corrX = 0;
            this.corrY = 0;
          } else {
            const dx = self.x - this.predictedSelf.x;
            const dy = self.y - this.predictedSelf.y;
            const drift = Math.hypot(dx, dy);
            if (drift > 80) {
              // hard snap on big drift (knockback, respawn, teleport) — reset everything
              this.predictedSelf.x = self.x;
              this.predictedSelf.y = self.y;
              this.camX = self.x;
              this.camY = self.y;
              this.corrX = 0;
              this.corrY = 0;
            } else {
              // Accumulate a small fraction — bled rapidly per-frame so stale corrections
              // from the previous movement direction clear before the next snapshot arrives.
              // (Large multiplier here → ghost-step on direction change; too small → drift)
              this.corrX += dx * 0.08;
              this.corrY += dy * 0.08;
            }
          }
        } else {
          // Snapshot arrived but our player isn't in it. Likely the server lost
          // its in-memory state (DO hibernation / restart). Resend join — but
          // throttle to once every 2s to avoid spamming during normal startup.
          const stale = arrivedAt - this.lastSelfSeenAt > 2000;
          const cooldown = arrivedAt - this.lastJoinResendAt > 2000;
          if (stale && cooldown && this.joinPayload && this.socket && this.socket.readyState === 1) {
            this.lastJoinResendAt = arrivedAt;
            this.socket.send(JSON.stringify(this.joinPayload));
          }
        }
      }
    } else if (msg.type === 'levelUp') {
      if (msg.playerId === this.selfId) {
        // ascending fanfare — louder, longer
        this.sfxArpeggio([523, 659, 784, 1047, 1319], 0.07, 0.18);
        this.bus.emit('levelUp', { level: msg.level, choices: msg.choices });
      }
    } else if (msg.type === 'died') {
      if (msg.playerId === this.selfId) {
        this.sfxArpeggio([330, 247, 196, 147], 0.09, 0.18);
        this.bus.emit('died', { killerName: msg.killerName, killerIcon: msg.killerIcon, finalDamage: msg.finalDamage });
      }
    } else if (msg.type === 'leaderboard') {
      this.bus.emit('leaderboard', msg.entries);
    } else if (msg.type === 'full') {
      // Server rejected us — room is at capacity. Stop reconnecting and
      // surface a UI overlay so the player can take action.
      this.joinPayload = undefined; // prevent watchdog from re-sending join
      try { this.socket?.close(); } catch (e) { void e; }
      this.bus.emit('roomFull');
    } else if (msg.type === 'effect') {
      if (msg.effect === 'lightning') {
        this.spawnLightningEffect(msg.x, msg.y);
      } else if (msg.effect === 'meteor') {
        this.spawnMeteorEffect(msg.x, msg.y);
      } else if (msg.effect === 'frostNova') {
        this.spawnFrostNovaEffect(msg.x, msg.y, msg.radius);
      } else if (msg.effect === 'holySmite') {
        this.spawnHolySmiteEffect(msg.x, msg.y);
      } else if (msg.effect === 'blackHole') {
        this.spawnBlackHoleEffect(msg.x, msg.y, msg.durationMs);
      } else if (msg.effect === 'chainExplosion') {
        this.spawnChainExplosionEffect(msg.x, msg.y);
      } else if (msg.effect === 'phoenixRevive') {
        this.spawnPhoenixReviveEffect(msg.x, msg.y);
      } else if (msg.effect === 'earthquake') {
        this.spawnEarthquakeEffect(msg.x, msg.y, msg.radius);
      } else if (msg.effect === 'timeStop') {
        this.spawnTimeStopEffect(msg.x, msg.y, msg.radius);
      } else if (msg.effect === 'castleDestroyed') {
        // Big shockwave + screen shake when castle falls
        this.cameras.main.shake(1200, 0.025);
        this.spawnCastleDestroyedEffect(msg.x, msg.y);
        this.bus.emit('castleDestroyed');
      } else if (msg.effect === 'towerShot') {
        this.spawnTowerShotEffect(msg.x, msg.y, msg.tx, msg.ty, msg.team);
      } else if (msg.effect === 'towerDestroyed') {
        this.cameras.main.shake(400, 0.01);
        this.spawnCastleDestroyedEffect(msg.x, msg.y);
      } else if (msg.effect === 'crystalDestroyed') {
        this.cameras.main.shake(1500, 0.03);
        this.spawnCastleDestroyedEffect(msg.x, msg.y);
        this.bus.emit('crystalDestroyed', msg.team);
      }
    } else if (msg.type === 'mobaVictory') {
      this.bus.emit('mobaVictory', msg.winnerTeam);
    } else if (msg.type === 'bossAlert') {
      this.bossAlertUntil = performance.now() + 3500;
      this.bossAlertName = msg.bossName;
      this.cameras.main.shake(300, 0.008);
      this.bus.emit('bossAlert', msg.bossName);
    } else if (msg.type === 'nova') {
      this.bus.emit('nova');
    } else if (msg.type === 'waveSpawn') {
      const now = performance.now();
      for (const anchor of msg.anchors) {
        this.waveAlerts.push({ x: anchor.x, y: anchor.y, bornAt: now });
      }
    } else if (msg.type === 'authError') {
      this.bus.emit('authError', (msg as any).reason);
    }
  }

  // Vertical lightning bolt + ground splash + camera flash. Plays whenever the
  // server fires a Lightning Strike powerup AOE on a random nearby foe.
  spawnLightningEffect(x: number, y: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    // jagged bolt from above the screen down to the impact point
    const jag = (x0: number, y0: number, x1: number, y1: number) => {
      const segs = 7;
      g.beginPath();
      g.moveTo(x0, y0);
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const ix = x0 + (x1 - x0) * t + (Math.random() - 0.5) * 18;
        const iy = y0 + (y1 - y0) * t;
        g.lineTo(ix, iy);
      }
      g.lineTo(x1, y1);
      g.strokePath();
    };
    g.lineStyle(8, 0xffee44, 0.7);
    jag(x, y - 280, x, y);
    g.lineStyle(3, 0xffffff, 1);
    jag(x, y - 280, x, y);
    // ground splash ring
    g.lineStyle(4, 0xffee44, 0.9);
    g.strokeCircle(x, y, 18);
    g.lineStyle(2, 0xffffff, 0.95);
    g.strokeCircle(x, y, 8);
    // camera shake + tween fade
    this.cameras.main.shake(120, 0.005);
    if (this.audioCtx && !this.musicMuted) {
      this.sfx(180, 0.25, 0.10, 'sawtooth');
      this.sfx(2400, 0.06, 0.07, 'square');
    }
    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  // Meteor: red/orange streak from upper-left to impact point + crater scorch + shake.
  spawnMeteorEffect(x: number, y: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    // streaking trail (diagonal from above-left)
    const startX = x - 200;
    const startY = y - 280;
    g.lineStyle(10, 0xff5511, 0.55);
    g.beginPath(); g.moveTo(startX, startY); g.lineTo(x, y); g.strokePath();
    g.lineStyle(5, 0xffaa44, 0.9);
    g.beginPath(); g.moveTo(startX, startY); g.lineTo(x, y); g.strokePath();
    g.lineStyle(2, 0xffffaa, 1);
    g.beginPath(); g.moveTo(startX, startY); g.lineTo(x, y); g.strokePath();
    // crater rings
    g.fillStyle(0xff7733, 0.5); g.fillCircle(x, y, 40);
    g.fillStyle(0xffaa44, 0.7); g.fillCircle(x, y, 28);
    g.fillStyle(0xffeecc, 0.95); g.fillCircle(x, y, 14);
    g.lineStyle(3, 0xff5511, 1); g.strokeCircle(x, y, 36);
    this.cameras.main.shake(60, 0.0025);
    if (this.audioCtx && !this.musicMuted) {
      this.sfx(80, 0.32, 0.12, 'sawtooth');
      this.sfx(160, 0.18, 0.08, 'square');
    }
    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  // Frost Nova: expanding white-blue ring from origin, with cold flash.
  spawnFrostNovaEffect(x: number, y: number, radius: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    g.setBlendMode(Phaser.BlendModes.ADD);
    // animate radius from small to full via tween on a holder object
    const state = { r: 0 };
    const draw = () => {
      g.clear();
      const r = state.r;
      // outer faint
      g.lineStyle(8, 0x99ddff, 0.35);
      g.strokeCircle(x, y, r);
      // bright ring
      g.lineStyle(4, 0xccffff, 0.9);
      g.strokeCircle(x, y, r);
      // crystal sparkles
      const ticks = 12;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r;
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(sx, sy, 2.5);
      }
    };
    if (this.audioCtx && !this.musicMuted) {
      this.sfx(900, 0.18, 0.07, 'triangle');
      this.sfx(1600, 0.12, 0.06, 'sine');
    }
    this.tweens.add({
      targets: state,
      r: radius,
      duration: 360,
      ease: 'Quad.easeOut',
      onUpdate: draw,
      onComplete: () => {
        this.tweens.add({
          targets: g,
          alpha: { from: 1, to: 0 },
          duration: 220,
          ease: 'Quad.easeOut',
          onComplete: () => g.destroy(),
        });
      },
    });
    draw();
  }

  // Holy Smite: golden pillar of light from above with halo.
  spawnHolySmiteEffect(x: number, y: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    g.setBlendMode(Phaser.BlendModes.ADD);
    // wide soft pillar
    g.fillStyle(0xfff0a0, 0.18);
    g.fillRect(x - 28, y - 320, 56, 320);
    g.fillStyle(0xfff8d0, 0.35);
    g.fillRect(x - 14, y - 320, 28, 320);
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(x - 5, y - 320, 10, 320);
    // ground halo (concentric)
    g.fillStyle(0xfff0a0, 0.4); g.fillCircle(x, y, 36);
    g.fillStyle(0xffffaa, 0.7); g.fillCircle(x, y, 22);
    g.fillStyle(0xffffff, 1);   g.fillCircle(x, y, 10);
    g.lineStyle(2, 0xffd96a, 1); g.strokeCircle(x, y, 30);
    // descending sparkles
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xffffaa, 0.9);
      g.fillCircle(x + (Math.random() - 0.5) * 28, y - Math.random() * 280, 2 + Math.random() * 2);
    }
    if (this.audioCtx && !this.musicMuted) {
      this.sfxArpeggio([784, 988, 1175, 1568], 0.045, 0.13);
    }
    this.cameras.main.shake(80, 0.003);
    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  // Black Hole: spinning purple vortex that lasts for the full server duration.
  spawnBlackHoleEffect(x: number, y: number, durationMs: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    let t = 0;
    const startTime = performance.now();
    const draw = () => {
      const now = performance.now();
      t = (now - startTime) / 1000;
      const lifeFrac = Math.min(1, (now - startTime) / durationMs);
      // grow then shrink at end
      const sizeCurve = lifeFrac < 0.85 ? 1 : 1 - (lifeFrac - 0.85) / 0.15;
      const baseR = 60 * sizeCurve;
      g.clear();
      // outer purple glow
      g.fillStyle(0x441166, 0.45); g.fillCircle(x, y, baseR + 30);
      g.fillStyle(0x6622aa, 0.55); g.fillCircle(x, y, baseR + 16);
      g.fillStyle(0x8833cc, 0.7);  g.fillCircle(x, y, baseR);
      // black core
      g.fillStyle(0x000000, 0.9);  g.fillCircle(x, y, baseR * 0.55);
      // spiral arms (3 arcs)
      g.lineStyle(3, 0xddaaff, 0.85);
      const arms = 3;
      for (let a = 0; a < arms; a++) {
        const baseAngle = t * 5 + (a / arms) * Math.PI * 2;
        g.beginPath();
        for (let s = 0; s <= 28; s++) {
          const frac = s / 28;
          const r = baseR * (0.55 + frac * 0.55);
          const ang = baseAngle + frac * 2.6;
          const sx = x + Math.cos(ang) * r;
          const sy = y + Math.sin(ang) * r;
          if (s === 0) g.moveTo(sx, sy);
          else g.lineTo(sx, sy);
        }
        g.strokePath();
      }
    };
    const ticker = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: draw,
    });
    if (this.audioCtx && !this.musicMuted) {
      this.sfx(110, 0.6, 0.08, 'sawtooth');
      this.sfx(55, 1.2, 0.05, 'sine');
    }
    this.time.delayedCall(durationMs, () => {
      ticker.remove();
      this.tweens.add({
        targets: g,
        alpha: { from: 1, to: 0 },
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => g.destroy(),
      });
    });
    draw();
  }

  // Chain Reaction explosion: small fiery burst at the corpse.
  spawnChainExplosionEffect(x: number, y: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.fillStyle(0xff5511, 0.55); g.fillCircle(x, y, 50);
    g.fillStyle(0xff9933, 0.7);  g.fillCircle(x, y, 32);
    g.fillStyle(0xffeecc, 1);    g.fillCircle(x, y, 14);
    // 6 outward sparks
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 36 + Math.random() * 12;
      g.fillStyle(0xffaa44, 0.95);
      g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 3);
    }
    if (this.audioCtx && !this.musicMuted) this.sfx(180, 0.10, 0.06, 'square');
    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  // Phoenix Revive: huge fiery burst around the player on revive.
  spawnPhoenixReviveEffect(x: number, y: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    g.setBlendMode(Phaser.BlendModes.ADD);
    // expanding triple-layer fire ring
    const state = { r: 0 };
    const draw = () => {
      g.clear();
      const r = state.r;
      g.fillStyle(0xff2200, 0.30); g.fillCircle(x, y, r);
      g.fillStyle(0xff7733, 0.45); g.fillCircle(x, y, r * 0.78);
      g.fillStyle(0xffcc66, 0.60); g.fillCircle(x, y, r * 0.55);
      g.fillStyle(0xffeecc, 0.85); g.fillCircle(x, y, r * 0.30);
      // flame tongues at the perimeter
      const ticks = 12;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r;
        g.fillStyle(0xff5511, 0.9);
        g.fillCircle(sx, sy, 6);
      }
    };
    if (this.audioCtx && !this.musicMuted) {
      this.sfxArpeggio([523, 659, 784, 1047], 0.05, 0.18);
      this.sfx(80, 0.4, 0.10, 'sawtooth');
    }
    this.cameras.main.shake(120, 0.004);
    this.tweens.add({
      targets: state,
      r: 250,
      duration: 480,
      ease: 'Quad.easeOut',
      onUpdate: draw,
      onComplete: () => {
        this.tweens.add({
          targets: g,
          alpha: { from: 1, to: 0 },
          duration: 360,
          ease: 'Quad.easeOut',
          onComplete: () => g.destroy(),
        });
      },
    });
    draw();
  }

  // Earthquake: brown/dust shockwave ring expanding from the player.
  spawnEarthquakeEffect(x: number, y: number, radius: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    const state = { r: 0 };
    const draw = () => {
      g.clear();
      const r = state.r;
      // dusty fill ring
      g.fillStyle(0x886644, 0.18); g.fillCircle(x, y, r);
      g.fillStyle(0x553322, 0.10); g.fillCircle(x, y, r * 0.7);
      // bright leading edge
      g.lineStyle(6, 0xddaa66, 0.7);
      g.strokeCircle(x, y, r);
      g.lineStyle(2, 0xffeebb, 0.95);
      g.strokeCircle(x, y, r);
      // 8 rock chunks flying outward from perimeter
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = r * (0.92 + Math.random() * 0.1);
        g.fillStyle(0x664422, 0.95);
        g.fillCircle(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 3);
      }
    };
    if (this.audioCtx && !this.musicMuted) {
      this.sfx(60, 0.3, 0.10, 'sawtooth');
      this.sfx(140, 0.18, 0.07, 'square');
    }
    this.cameras.main.shake(140, 0.005);
    this.tweens.add({
      targets: state,
      r: radius,
      duration: 360,
      ease: 'Quad.easeOut',
      onUpdate: draw,
      onComplete: () => {
        this.tweens.add({
          targets: g,
          alpha: { from: 1, to: 0 },
          duration: 240,
          ease: 'Quad.easeOut',
          onComplete: () => g.destroy(),
        });
      },
    });
    draw();
  }

  // Time Stop: bright cyan flash + slow concentric rings to telegraph the freeze.
  spawnTimeStopEffect(x: number, y: number, radius: number) {
    const g = this.add.graphics();
    g.setDepth(60);
    g.setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: 0 };
    const draw = () => {
      g.clear();
      const r = state.r;
      // soft tinted disc
      g.fillStyle(0x88ccff, 0.10); g.fillCircle(x, y, r);
      // bright sweeping ring
      g.lineStyle(4, 0xaaeeff, 0.85); g.strokeCircle(x, y, r);
      g.lineStyle(2, 0xffffff, 0.95); g.strokeCircle(x, y, r);
      // 12 ticks evenly spaced — clock-face flavor
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r;
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(sx, sy, 3);
      }
    };
    if (this.audioCtx && !this.musicMuted) {
      this.sfx(440, 0.4, 0.10, 'sine');
      this.sfx(880, 0.2, 0.07, 'triangle');
    }
    this.tweens.add({
      targets: state,
      r: radius,
      duration: 540,
      ease: 'Quad.easeOut',
      onUpdate: draw,
      onComplete: () => {
        this.tweens.add({
          targets: g,
          alpha: { from: 1, to: 0 },
          duration: 320,
          ease: 'Quad.easeOut',
          onComplete: () => g.destroy(),
        });
      },
    });
    draw();
  }

  renderPickups(pickups: import('../shared/types').PickupState[], clientNow: number) {
    this._seenPickups.clear();
    const seen = this._seenPickups;
    for (const pk of pickups) {
      seen.add(pk.id);
      let g = this.pickupVisuals.get(pk.id);
      if (!g) {
        g = this.add.graphics();
        g.setDepth(8); // below gems but above ground
        this.pickupVisuals.set(pk.id, g);
      }
      // Throttle redraws to ~20fps — pickups animate slowly, no need for 60fps
      const lastDraw = (g.getData('lastDraw') as number) ?? 0;
      if (clientNow - lastDraw < 50) {
        const bob = Math.sin(clientNow * 0.005 + pk.x * 0.01 + pk.y * 0.013) * 3;
        g.setPosition(pk.x, pk.y + bob);
        continue;
      }
      g.setData('lastDraw', clientNow);
      g.clear();
      const bob = Math.sin(clientNow * 0.005 + pk.x * 0.01 + pk.y * 0.013) * 3;
      const pulse = 1 + Math.sin(clientNow * 0.007) * 0.1;
      g.setPosition(pk.x, pk.y + bob);

      switch (pk.kind) {
        case 'health': {
          // Green cross
          g.fillStyle(0x22cc44, 1);
          g.fillRect(-10, -4, 20, 8);
          g.fillRect(-4, -10, 8, 20);
          g.lineStyle(2, 0xffffff, 0.9);
          g.strokeRect(-10, -4, 20, 8);
          g.strokeRect(-4, -10, 8, 20);
          g.setScale(pulse);
          break;
        }
        case 'speed': {
          // Blue chevron arrow pointing right
          g.fillStyle(0x3399ff, 1);
          g.fillTriangle(-8, -10, 6, 0, -8, 10);
          g.fillTriangle(-2, -10, 12, 0, -2, 10);
          g.lineStyle(2, 0x88ddff, 0.8);
          g.strokeTriangle(-8, -10, 6, 0, -8, 10);
          g.setScale(pulse * 1.1);
          break;
        }
        case 'damage': {
          // Red 4-pointed star (2 rects rotated 45°)
          const sz = 11 * pulse;
          g.fillStyle(0xff4422, 1);
          g.fillRect(-sz * 0.3, -sz, sz * 0.6, sz * 2);
          g.fillRect(-sz, -sz * 0.3, sz * 2, sz * 0.6);
          // diagonal arms (approximate with smaller rects at angle)
          g.fillRect(-sz * 0.22, -sz * 0.22, sz * 0.44, sz * 0.44);
          g.lineStyle(2, 0xff8866, 0.8);
          g.strokeRect(-sz * 0.3, -sz, sz * 0.6, sz * 2);
          g.setAngle((clientNow * 0.03) % 360);
          break;
        }
        case 'shield': {
          // Gold diamond (losango)
          const r = 11 * pulse;
          g.fillStyle(0xffcc00, 1);
          g.fillTriangle(0, -r, r, 0, 0, r);
          g.fillTriangle(0, -r, -r, 0, 0, r);
          g.lineStyle(2, 0xfff0aa, 0.9);
          g.strokeTriangle(0, -r, r, 0, 0, r);
          g.strokeTriangle(0, -r, -r, 0, 0, r);
          g.setScale(pulse);
          break;
        }
        case 'cooldown': {
          // Cyan circle with clock tick marks
          const cr = 10 * pulse;
          g.fillStyle(0x00bbdd, 0.85);
          g.fillCircle(0, 0, cr);
          g.lineStyle(2, 0x88ffff, 0.9);
          g.strokeCircle(0, 0, cr);
          g.lineStyle(2, 0xffffff, 0.8);
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            g.lineBetween(Math.cos(a) * (cr * 0.5), Math.sin(a) * (cr * 0.5), Math.cos(a) * (cr * 0.9), Math.sin(a) * (cr * 0.9));
          }
          g.setAngle(((clientNow * 0.05) % 360));
          break;
        }
        case 'berserker': {
          // Dark red spiked circle
          const br = 9 * pulse;
          g.fillStyle(0xaa0000, 1);
          g.fillCircle(0, 0, br);
          g.lineStyle(3, 0xff2222, 0.9);
          g.strokeCircle(0, 0, br);
          // Spikes
          g.fillStyle(0xff3333, 1);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + (clientNow * 0.001);
            const ix = Math.cos(a) * (br + 6);
            const iy = Math.sin(a) * (br + 6);
            const la = a + 0.35;
            const ra = a - 0.35;
            g.fillTriangle(Math.cos(la) * br, Math.sin(la) * br, ix, iy, Math.cos(ra) * br, Math.sin(ra) * br);
          }
          g.setScale(pulse);
          break;
        }
        case 'annihilate': {
          // Large pulsing golden skull-ish orb — very distinct, hard to miss
          const ar = 20 * pulse;
          g.setBlendMode(Phaser.BlendModes.ADD);
          // Outer glow
          g.fillStyle(0xffcc00, 0.30);
          g.fillCircle(0, 0, ar + 10);
          // Mid ring
          g.fillStyle(0xffdd44, 0.60);
          g.fillCircle(0, 0, ar + 4);
          // Core
          g.fillStyle(0xfff080, 0.90);
          g.fillCircle(0, 0, ar);
          // Bright white center
          g.fillStyle(0xffffff, 1.00);
          g.fillCircle(0, 0, ar * 0.45);
          // White outline
          g.lineStyle(3, 0xffffff, 0.85);
          g.strokeCircle(0, 0, ar);
          // Rotating 8 starburst spikes
          g.fillStyle(0xffee88, 0.95);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + (clientNow * 0.0012);
            const tipX = Math.cos(a) * (ar + 14);
            const tipY = Math.sin(a) * (ar + 14);
            const la = a + 0.25;
            const ra = a - 0.25;
            g.fillTriangle(Math.cos(la) * ar, Math.sin(la) * ar, tipX, tipY, Math.cos(ra) * ar, Math.sin(ra) * ar);
          }
          g.setAngle(((clientNow * 0.02) % 360));
          break;
        }
      }
    }
    // Clean up visuals for collected/expired pickups
    for (const [id, g] of this.pickupVisuals) {
      if (!seen.has(id)) {
        g.destroy();
        this.pickupVisuals.delete(id);
      }
    }
  }

  renderVsChests(chests: import('../shared/types').ChestState[], clientNow: number) {
    this._seenChests.clear();
    const seen = this._seenChests;
    for (const ch of chests) {
      seen.add(ch.id);
      let g = this.chestVisuals.get(ch.id);
      if (!g) {
        g = this.add.graphics();
        g.setDepth(9);
        this.chestVisuals.set(ch.id, g);
      }
      const bob = Math.sin(clientNow * 0.005 + ch.x * 0.01) * 3;
      const pulse = 1 + Math.sin(clientNow * 0.008) * 0.12;
      g.setPosition(ch.x, ch.y + bob);
      g.setScale(pulse);
      g.clear();
      // Chest body (brown rectangle)
      g.fillStyle(0x8B4513, 1);
      g.fillRect(-12, -8, 24, 16);
      // Chest lid (slightly lighter)
      g.fillStyle(0xA0522D, 1);
      g.fillRect(-12, -14, 24, 7);
      // Golden border
      g.lineStyle(2, 0xFFD700, 1);
      g.strokeRect(-12, -14, 24, 21);
      // Gold lock
      g.fillStyle(0xFFD700, 1);
      g.fillCircle(0, -3, 4);
      g.fillRect(-2, -3, 4, 5);
      // Glow ring
      g.lineStyle(3, 0xFFD700, 0.4 + Math.sin(clientNow * 0.01) * 0.3);
      g.strokeCircle(0, 0, 18);
    }
    for (const [id, g] of this.chestVisuals) {
      if (!seen.has(id)) { g.destroy(); this.chestVisuals.delete(id); }
    }
  }

  renderBossProjectiles(bossProjs: BossProjectileState[], t: number) {
    this._seenBossProj.clear();
    const seen = this._seenBossProj;
    for (const bp of bossProjs) {
      seen.add(bp.id);
      let g = this.bossProjectileVisuals.get(bp.id);
      if (!g) {
        g = this.add.graphics().setDepth(55);
        this.bossProjectileVisuals.set(bp.id, g);
      }
      // Throttle to 30fps — the pulse animation is subtle enough
      const lastDraw = (g.getData('lastDraw') as number) ?? 0;
      if (t - lastDraw < 33) { g.setPosition(bp.x, bp.y); continue; }
      g.setData('lastDraw', t);
      g.clear();
      const pulse = 1 + Math.sin(t * 0.012) * 0.15;
      const r = bp.radius * pulse;
      // Color by generation: gen 0=red, 1=purple, 2=cyan, 3+=gold
      const colors = [0xff3300, 0xcc33ff, 0x00eeff, 0xffcc00];
      const col = colors[Math.min(bp.generation, colors.length - 1)];
      g.fillStyle(col, 0.90);
      g.fillCircle(0, 0, r);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeCircle(0, 0, r);
      g.setPosition(bp.x, bp.y);
      g.setBlendMode(Phaser.BlendModes.ADD);
    }
    // Remove expired visuals
    for (const [id, g] of this.bossProjectileVisuals) {
      if (!seen.has(id)) { g.destroy(); this.bossProjectileVisuals.delete(id); }
    }
  }

  renderHazards(hazards: import('../shared/types').HazardState[], serverNow: number) {
    const clientNow = performance.now();
    this._seenHazards.clear();
    const seen = this._seenHazards;

    // Track if self is inside any active smoke_zone
    let selfInSmoke = false;
    // Reuse _cachedSelfPlayer if renderSnapshot already set it; fall back for standalone calls
    const self = this._cachedSelfPlayer ?? this.latestSnapshot?.players.find((p) => p.id === this.selfId);

    for (const h of hazards) {
      seen.add(h.id);

      // Graphics object
      let g = this.hazardVisuals.get(h.id);
      if (!g) {
        g = this.add.graphics();
        g.setDepth(9);
        this.hazardVisuals.set(h.id, g);
      }

      // Throttle redraws to ~20fps — hazard animations (smoke puffs, pulses) don't need 60fps
      const lastDraw = (g.getData('lastDraw') as number) ?? 0;
      const skipRedraw = clientNow - lastDraw < 50;
      if (skipRedraw) {
        // Still need to update selfInSmoke even on skipped frames
        if (h.kind === 'smoke_zone' && serverNow >= h.warningUntilMs && self) {
          const dx = self.x - h.x, dy = self.y - h.y;
          if (dx * dx + dy * dy < h.radius * h.radius) selfInSmoke = true;
        }
        continue;
      }
      g.setData('lastDraw', clientNow);

      g.clear();
      g.setBlendMode(Phaser.BlendModes.NORMAL);

      const warning = serverNow < h.warningUntilMs;
      const t = clientNow * 0.003;

      if (warning) {
        const pulse = 0.45 + Math.sin(clientNow * 0.008) * 0.25;
        g.lineStyle(4, 0xff2200, pulse);
        g.strokeCircle(h.x, h.y, h.radius);
        g.lineStyle(2, 0xff8800, pulse * 0.5);
        g.strokeCircle(h.x, h.y, h.radius * 0.65);

        // Warning label — create once, reuse
        let lbl = this.hazardLabels.get(h.id);
        if (!lbl) {
          const icon = h.kind === 'lightning_strike' ? '⚡'
            : h.kind === 'fire_pool' ? '🔥'
            : h.kind === 'poison_cloud' ? '☠'
            : h.kind === 'slow_zone' ? '❄'
            : '💨';
          lbl = this.add.text(h.x, h.y, icon, { fontSize: '28px' })
            .setOrigin(0.5, 0.5)
            .setDepth(10);
          this.hazardLabels.set(h.id, lbl);
        }
        lbl.setAlpha(pulse);
      } else {
        // Active phase — hide the label
        const lbl = this.hazardLabels.get(h.id);
        if (lbl) lbl.setAlpha(0);

        if (h.kind === 'fire_pool') {
          g.fillStyle(0xff3300, 0.45);
          g.fillCircle(h.x, h.y, h.radius);
          g.fillStyle(0xff7700, 0.35);
          g.fillCircle(h.x + Math.sin(t) * 12, h.y + Math.cos(t * 1.3) * 10, h.radius * 0.65);
          g.fillStyle(0xffcc00, 0.25);
          g.fillCircle(h.x + Math.cos(t * 0.7) * 8, h.y + Math.sin(t * 1.1) * 8, h.radius * 0.35);
          g.lineStyle(3, 0xff5500, 0.7);
          g.strokeCircle(h.x, h.y, h.radius);
          g.setBlendMode(Phaser.BlendModes.ADD);
        } else if (h.kind === 'poison_cloud') {
          g.fillStyle(0x882299, 0.40);
          g.fillCircle(h.x, h.y, h.radius);
          g.fillStyle(0x44aa22, 0.25);
          g.fillCircle(h.x + Math.sin(t * 0.9) * 14, h.y + Math.cos(t * 1.2) * 12, h.radius * 0.6);
          g.fillStyle(0xcc44ff, 0.18);
          g.fillCircle(h.x + Math.cos(t * 0.6) * 10, h.y + Math.sin(t) * 10, h.radius * 0.35);
          g.lineStyle(3, 0xaa33dd, 0.6);
          g.strokeCircle(h.x, h.y, h.radius);
          g.setBlendMode(Phaser.BlendModes.ADD);
        } else if (h.kind === 'slow_zone') {
          // Icy concentric rings — visually distinct from fire's warm ADD glow
          g.fillStyle(0x99eeff, 0.10);
          g.fillCircle(h.x, h.y, h.radius);
          // Pulsing inner fill
          const icePulse = 0.12 + Math.sin(t * 1.4) * 0.04;
          g.fillStyle(0xaaddff, icePulse);
          g.fillCircle(h.x, h.y, h.radius * 0.65);
          // Three concentric ring strokes
          g.lineStyle(2, 0xccf0ff, 0.70);
          g.strokeCircle(h.x, h.y, h.radius);
          g.lineStyle(2, 0x88ccee, 0.50);
          g.strokeCircle(h.x, h.y, h.radius * 0.72);
          g.lineStyle(1, 0x55aadd, 0.35);
          g.strokeCircle(h.x, h.y, h.radius * 0.42);
          // Rotating ice-crystal tick marks (6 lines around the edge)
          g.lineStyle(2, 0xeef8ff, 0.55);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + t * 0.4;
            g.lineBetween(
              h.x + Math.cos(a) * (h.radius * 0.82),
              h.y + Math.sin(a) * (h.radius * 0.82),
              h.x + Math.cos(a) * h.radius,
              h.y + Math.sin(a) * h.radius,
            );
          }
          // No ADD blend — keep it cold and translucent, not luminous
        } else if (h.kind === 'smoke_zone') {
          // Dark base fill
          g.fillStyle(0x111111, 0.60);
          g.fillCircle(h.x, h.y, h.radius);
          // Animated black smoke puffs — 8 blobs orbiting at different speeds/radii
          const puffs = [
            { r: h.radius * 0.50, a: t * 0.55,              size: h.radius * 0.38, alpha: 0.50 },
            { r: h.radius * 0.35, a: t * 0.80 + 1.0,        size: h.radius * 0.28, alpha: 0.45 },
            { r: h.radius * 0.62, a: t * 0.42 + 2.1,        size: h.radius * 0.32, alpha: 0.55 },
            { r: h.radius * 0.25, a: t * 1.10 + 3.5,        size: h.radius * 0.22, alpha: 0.40 },
            { r: h.radius * 0.70, a: t * 0.30 + 0.8,        size: h.radius * 0.42, alpha: 0.48 },
            { r: h.radius * 0.45, a: t * 0.65 + 4.2,        size: h.radius * 0.25, alpha: 0.42 },
            { r: h.radius * 0.58, a: t * 0.95 + 1.7,        size: h.radius * 0.35, alpha: 0.52 },
            { r: h.radius * 0.20, a: t * 1.30 + 5.0,        size: h.radius * 0.18, alpha: 0.38 },
          ];
          for (const p of puffs) {
            // Pulse alpha with sin so puffs fade in/out
            const fade = p.alpha * (0.6 + Math.sin(t * 1.2 + p.a) * 0.4);
            g.fillStyle(0x0a0a0a, fade);
            g.fillCircle(h.x + Math.cos(p.a) * p.r, h.y + Math.sin(p.a) * p.r, p.size);
          }
          // Subtle dark edge ring
          g.lineStyle(3, 0x222222, 0.55);
          g.strokeCircle(h.x, h.y, h.radius);
          // no ADD blend — intentionally opaque / occlusive
          if (self) {
            const dx = self.x - h.x, dy = self.y - h.y;
            if (dx * dx + dy * dy < h.radius * h.radius) selfInSmoke = true;
          }
        } else if (h.kind === 'beam_h') {
          const isWarn = serverNow < h.warningUntilMs;
          if (isWarn) {
            // Pulsing danger band
            const pulse = 0.08 + Math.sin(t * 0.02) * 0.04;
            g.fillStyle(0xffee00, pulse);
            g.fillRect(0, h.y - h.radius, ARENA_WIDTH, h.radius * 2);
            // Solid warning line
            g.lineStyle(2, 0xffdd00, 0.7 + Math.sin(t * 0.025) * 0.2);
            g.lineBetween(0, h.y, ARENA_WIDTH, h.y);
          } else {
            // Active beam — bright fire with ADD blend
            g.fillStyle(0xff6600, 0.80);
            g.fillRect(0, h.y - h.radius, ARENA_WIDTH, h.radius * 2);
            g.fillStyle(0xffffff, 0.55);
            g.fillRect(0, h.y - 4, ARENA_WIDTH, 8);
            g.setBlendMode(Phaser.BlendModes.ADD);
          }
        } else if (h.kind === 'beam_v') {
          const isWarn = serverNow < h.warningUntilMs;
          if (isWarn) {
            const pulse = 0.08 + Math.sin(t * 0.02) * 0.04;
            g.fillStyle(0xffee00, pulse);
            g.fillRect(h.x - h.radius, 0, h.radius * 2, ARENA_HEIGHT);
            g.lineStyle(2, 0xffdd00, 0.7 + Math.sin(t * 0.025) * 0.2);
            g.lineBetween(h.x, 0, h.x, ARENA_HEIGHT);
          } else {
            g.fillStyle(0xff6600, 0.80);
            g.fillRect(h.x - h.radius, 0, h.radius * 2, ARENA_HEIGHT);
            g.fillStyle(0xffffff, 0.55);
            g.fillRect(h.x - 4, 0, 8, ARENA_HEIGHT);
            g.setBlendMode(Phaser.BlendModes.ADD);
          }
        } else if (h.kind === 'beam_diag' || h.kind === 'beam_diag_ne') {
          const isWarn = serverNow < h.warningUntilMs;
          const angle = h.angle ?? Math.PI / 4;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const hw = h.radius;
          const beamLen = Math.sqrt(ARENA_WIDTH * ARENA_WIDTH + ARENA_HEIGHT * ARENA_HEIGHT);
          const pts = [
            { x: h.x + cos * beamLen - sin * hw, y: h.y + sin * beamLen + cos * hw },
            { x: h.x + cos * beamLen + sin * hw, y: h.y + sin * beamLen - cos * hw },
            { x: h.x - cos * beamLen + sin * hw, y: h.y - sin * beamLen - cos * hw },
            { x: h.x - cos * beamLen - sin * hw, y: h.y - sin * beamLen + cos * hw },
          ];
          if (isWarn) {
            const pulse = 0.07 + Math.sin(t * 0.022) * 0.04;
            g.fillStyle(0xffee00, pulse);
            g.fillPoints(pts, true);
            g.lineStyle(2, 0xffdd00, 0.7 + Math.sin(t * 0.025) * 0.2);
            g.lineBetween(h.x - cos * beamLen, h.y - sin * beamLen, h.x + cos * beamLen, h.y + sin * beamLen);
          } else {
            g.fillStyle(0xff6600, 0.80);
            g.fillPoints(pts, true);
            const coreHw = 4;
            const corePts = [
              { x: h.x + cos * beamLen - sin * coreHw, y: h.y + sin * beamLen + cos * coreHw },
              { x: h.x + cos * beamLen + sin * coreHw, y: h.y + sin * beamLen - cos * coreHw },
              { x: h.x - cos * beamLen + sin * coreHw, y: h.y - sin * beamLen - cos * coreHw },
              { x: h.x - cos * beamLen - sin * coreHw, y: h.y - sin * beamLen + cos * coreHw },
            ];
            g.fillStyle(0xffffff, 0.55);
            g.fillPoints(corePts, true);
            g.setBlendMode(Phaser.BlendModes.ADD);
          }
        }
      }
    }

    // Emit smoke state to React overlay
    this.bus.emit('smokeZone', selfInSmoke);

    // Clean up visuals for expired hazards
    for (const [id, g] of this.hazardVisuals) {
      if (!seen.has(id)) {
        g.destroy();
        this.hazardVisuals.delete(id);
      }
    }
    for (const [id, lbl] of this.hazardLabels) {
      if (!seen.has(id)) {
        lbl.destroy();
        this.hazardLabels.delete(id);
      }
    }
  }

  // Tiny synthesized SFX — louder than the music (BGM is at 0.16, SFX peaks ~0.18).
  sfx(freq: number, duration: number, gain = 0.14, type: OscillatorType = 'square') {
    const ctx = this.audioCtx;
    if (!ctx || this.musicMuted) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      const effectiveGain = gain * this.sfxVol * 2; // 0.5 default → 1.0 multiplier
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(effectiveGain, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0008, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch (e) { void e; }
  }

  // Quick chord/arpeggio
  sfxArpeggio(freqs: number[], step = 0.05, gain = 0.16) {
    const ctx = this.audioCtx;
    if (!ctx) return;
    freqs.forEach((f, i) => setTimeout(() => this.sfx(f, 0.12, gain, 'triangle'), i * step * 1000));
  }

  // Subtle attack sounds per weapon — only for self-owned shots so it stays uncluttered.
  sfxFire(weapon: string) {
    const ctx = this.audioCtx;
    if (!ctx || this.musicMuted) return;
    const now = ctx.currentTime;
    const blip = (freq: number, dur: number, gain: number, type: OscillatorType, slideTo?: number) => {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
        osc.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
        osc.start(now); osc.stop(now + dur + 0.02);
      } catch (e) { void e; }
    };
    switch (weapon) {
      case 'fireball':       blip(220, 0.18, 0.07, 'sawtooth', 110);   blip(440, 0.10, 0.04, 'square'); break;
      case 'lightning_bolt': blip(2200, 0.05, 0.06, 'square', 800);    break;
      case 'sword':          blip(140, 0.16, 0.08, 'sine', 70);        blip(280, 0.06, 0.04, 'sawtooth'); break;
      case 'dagger':         blip(900, 0.06, 0.04, 'triangle', 1400);  break;
      case 'orb':            blip(660, 0.10, 0.05, 'sine', 440);       break;
      case 'shadow_bolt':    blip(180, 0.20, 0.06, 'sine', 110);       blip(360, 0.10, 0.03, 'triangle'); break;
      case 'orbital_spark':  blip(1500, 0.10, 0.05, 'square', 750);    break;
      case 'aura_shield':    blip(440, 0.08, 0.03, 'sine');            break;
      default:               blip(500, 0.08, 0.04, 'square');          break;
    }
  }

  // Coin-pickup style — rising pitch, two harmonized layers.
  // Higher gem values get higher pitch + more sparkle.
  sfxGem(value: number) {
    const ctx = this.audioCtx;
    if (!ctx || this.musicMuted) return;
    try {
      const baseFreq = value >= 10 ? 1318 : value >= 5 ? 1100 : value >= 3 ? 988 : 880;
      const now = ctx.currentTime;
      const playTone = (freq: number, t0: number, dur: number, gain: number, type: OscillatorType) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * 0.65, now + t0);
        osc.frequency.exponentialRampToValueAtTime(freq, now + t0 + 0.045);
        osc.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0, now + t0);
        g.gain.linearRampToValueAtTime(gain, now + t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0008, now + t0 + dur);
        osc.start(now + t0);
        osc.stop(now + t0 + dur + 0.02);
      };
      // Main "ting"
      playTone(baseFreq, 0, 0.12, 0.16, 'square');
      // Harmonic shimmer (perfect fifth) — slight delay for chimey feel
      playTone(baseFreq * 1.5, 0.025, 0.12, 0.10, 'triangle');
      // Octave sparkle for higher tier gems
      if (value >= 3) playTone(baseFreq * 2, 0.05, 0.10, 0.07, 'sine');
      if (value >= 10) playTone(baseFreq * 3, 0.07, 0.10, 0.06, 'sine');
    } catch (e) { void e; }
  }

  // Floating damage text — rises and fades over ~700ms.
  spawnDamageNumber(x: number, y: number, dmg: number, color?: string) {
    const isCrit = dmg >= 20;
    const resolvedColor = color ?? (isCrit ? '#ff3333' : '#ffe080');
    const size = isCrit && !color ? '14px' : '12px';
    let txt: Phaser.GameObjects.Text;
    if (this.dmgNumPool.length > 0) {
      txt = this.dmgNumPool.pop()!;
      txt.setStyle({ fontFamily: 'monospace', fontSize: size, color: resolvedColor, stroke: '#000000', strokeThickness: 3 });
      txt.setText(String(dmg)).setPosition(x, y).setAlpha(1).setVisible(true).setActive(true);
    } else {
      txt = this.add.text(x, y, String(dmg), {
        fontFamily: 'monospace', fontSize: size, color: resolvedColor, stroke: '#000000', strokeThickness: 3,
      });
      txt.setOrigin(0.5, 0.5).setDepth(50);
    }
    const dx = (Math.random() - 0.5) * 14;
    this.tweens.add({
      targets: txt,
      y: y - 28,
      x: x + dx,
      alpha: { from: 1, to: 0 },
      ease: 'Quad.easeOut',
      duration: 700,
      onComplete: () => { txt.setVisible(false).setActive(false); this.dmgNumPool.push(txt); },
    });
  }

  toggleMusic() {
    this.musicMuted = !this.musicMuted;
    const cur = this.bgmTracks[this.bgmIdx];
    if (!cur) return;
    if (this.musicMuted) {
      cur.pause();
    } else if (!cur.isPlaying) {
      cur.play();
    } else {
      cur.resume();
    }
  }

  setMusicVolume(v: number) {
    this.musicVol = v;
    for (const track of this.bgmTracks) {
      (track as Phaser.Sound.WebAudioSound).setVolume(v * 0.32);
    }
  }

  setSfxVolume(v: number) {
    this.sfxVol = v;
  }

  pickPowerup(idx: number) {
    const m: ClientToServer = { type: 'pickPowerup', choiceIdx: idx };
    this.socket?.send(JSON.stringify(m));
  }

  respawn() {
    const m: ClientToServer = { type: 'respawn' };
    this.socket?.send(JSON.stringify(m));
    this.bus.emit('respawned');
  }

  buyItem(itemId: string) {
    const m: ClientToServer = { type: 'buyItem', itemId };
    this.socket?.send(JSON.stringify(m));
  }

  clearMovement() {
    this.joystickPointer = null;
    this.joystickDx = 0;
    this.joystickDy = 0;
    this.joystickBase?.destroy();
    this.joystickKnob?.destroy();
    this.joystickBase = null;
    this.joystickKnob = null;
    this.mouseDown = false;
  }

  renderJoystick(ox: number, oy: number, kx: number, ky: number, radius: number) {
    if (!this.joystickBase) {
      this.joystickBase = this.add.graphics().setScrollFactor(0).setDepth(200);
    }
    if (!this.joystickKnob) {
      this.joystickKnob = this.add.graphics().setScrollFactor(0).setDepth(201);
    }
    this.joystickBase.clear();
    this.joystickBase.fillStyle(0x000000, 0.35);
    this.joystickBase.fillCircle(ox, oy, radius);
    this.joystickBase.lineStyle(2, 0xffffff, 0.45);
    this.joystickBase.strokeCircle(ox, oy, radius);

    this.joystickKnob.clear();
    this.joystickKnob.fillStyle(0xffffff, 0.6);
    this.joystickKnob.fillCircle(kx, ky, 26);
    this.joystickKnob.lineStyle(2, 0xffffff, 0.9);
    this.joystickKnob.strokeCircle(kx, ky, 26);
  }

  update(_time: number, delta: number) {
    this.handleInput(delta);
    this.updateClientProjs(delta);
    this.renderSnapshot();
  }

  updateClientProjs(dt: number) {
    const dtSec = dt / 1000;
    for (const [id, proj] of this.clientProjs) {
      proj.lifetime -= dt;
      if (proj.lifetime <= 0) {
        this.clientProjs.delete(id);
        const s = this.projSprites.get(id);
        if (s) { s.setVisible(false).setActive(false); this.projPool.push(s); this.projSprites.delete(id); }
        continue;
      }
      if (proj.pattern === 'orbital') {
        proj.orbitAngle = (proj.orbitAngle ?? 0) + (proj.orbitSpinSpeed ?? 3) * dtSec;
        const owner = this._playerById.get(proj.ownerId);
        if (owner) {
          proj.x = owner.x + Math.cos(proj.orbitAngle!) * (proj.orbitRadius ?? 80);
          proj.y = owner.y + Math.sin(proj.orbitAngle!) * (proj.orbitRadius ?? 80);
        }
      } else if (proj.pattern === 'wave') {
        proj.baseX! += proj.vx * dtSec;
        proj.baseY! += proj.vy * dtSec;
        proj.waveTime! += dtSec;
        const off = Math.sin(proj.waveTime! * 12) * 22;
        proj.x = proj.baseX! + (proj.perpX ?? 0) * off;
        proj.y = proj.baseY! + (proj.perpY ?? 0) * off;
      } else {
        proj.x += proj.vx * dtSec;
        proj.y += proj.vy * dtSec;
      }
    }
  }

  handleInput(deltaMs: number) {
    let dx = 0, dy = 0;
    if (this.keyA?.isDown || this.cursors?.left?.isDown) dx -= 1;
    if (this.keyD?.isDown || this.cursors?.right?.isDown) dx += 1;
    if (this.keyW?.isDown || this.cursors?.up?.isDown) dy -= 1;
    if (this.keyS?.isDown || this.cursors?.down?.isDown) dy += 1;

    if (this.isMobile) {
      // On mobile, joystick is the sole movement source (overrides any keyboard)
      if (this.joystickPointer) {
        dx = this.joystickDx;
        dy = this.joystickDy;
      }
    } else {
      // Mouse override (desktop only): hold left → move toward cursor
      if ((this.mouseDown || this.mouseAlwaysOn) && dx === 0 && dy === 0 && this.predictedSelf) {
        const ptr = this.input.activePointer;
        const world = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const mdx = world.x - this.predictedSelf.x;
        const mdy = world.y - this.predictedSelf.y;
        const dist = Math.hypot(mdx, mdy);
        if (dist > 12) { dx = mdx / dist; dy = mdy / dist; }
      }
    }

    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    this.inputDx = dx;
    this.inputDy = dy;

    // Client-side prediction: move local self
    // _cachedSelfPlayer is set by renderSnapshot which always runs right after handleInput
    if (this.predictedSelf && this.selfId) {
      const self = this._cachedSelfPlayer ?? this.latestSnapshot?.players.find((p) => p.id === this.selfId);
      if (self && self.alive) {
        const speed = PLAYER_SPEED * (self.speedMul || 1);
        const dt = deltaMs / 1000;
        this.predictedSelf.x = clamp(
          this.predictedSelf.x + dx * speed * dt,
          PLAYER_RADIUS,
          ARENA_WIDTH - PLAYER_RADIUS,
        );
        this.predictedSelf.y = clamp(
          this.predictedSelf.y + dy * speed * dt,
          PLAYER_RADIUS,
          ARENA_HEIGHT - PLAYER_RADIUS,
        );

        // Drop any correction component that opposes the current input direction —
        // this eliminates the "drag" feeling when changing direction.
        if (this.inputDx !== 0 && this.corrX * this.inputDx < 0) this.corrX = 0;
        if (this.inputDy !== 0 && this.corrY * this.inputDy < 0) this.corrY = 0;

        // Bleed remaining correction (same-direction or perpendicular) at 40%/frame.
        if (this.corrX !== 0 || this.corrY !== 0) {
          const bleedX = this.corrX * 0.4;
          const bleedY = this.corrY * 0.4;
          this.predictedSelf.x = clamp(this.predictedSelf.x + bleedX, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
          this.predictedSelf.y = clamp(this.predictedSelf.y + bleedY, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
          this.corrX -= bleedX;
          this.corrY -= bleedY;
          if (Math.abs(this.corrX) < 0.05) this.corrX = 0;
          if (Math.abs(this.corrY) < 0.05) this.corrY = 0;
        }
        // Client-side collision vs jungle tree walls (MOBA only)
        if (this.latestSnapshot?.gameMode === 'moba') {
          const col = resolveCollision(this.predictedSelf.x, this.predictedSelf.y, PLAYER_RADIUS, MOBA_COLLISION_RECTS);
          this.predictedSelf.x = col.x;
          this.predictedSelf.y = col.y;
        }
      }
    }

    const now = performance.now();
    if (
      this.socket &&
      this.socket.readyState === 1 &&
      (dx !== this.lastSentInput.dx ||
        dy !== this.lastSentInput.dy ||
        now - this.lastSentInput.t > 50)
    ) {
      const m: ClientToServer = { type: 'input', dx, dy };
      this.socket.send(JSON.stringify(m));
      this.lastSentInput = { dx, dy, t: now };
    }
  }

  renderSnapshot() {
    if (!this.latestSnapshot) return;
    // Render-in-the-past. Find the snapshot pair (A, B) such that A.t <= target < B.t,
    // where target = now - INTERP_DELAY_MS. Lerp between A and B by t = (target-A.t)/(B.t-A.t).
    // If we don't have enough history yet, fall back to the latest snapshot pair.
    const renderAt = performance.now() - INTERP_DELAY_MS;
    let snap: Snapshot;
    let prev: Snapshot | undefined;
    let interp: number;
    const q = this.snapshotQueue;
    if (q.length >= 2) {
      // Walk from newest backward to find the first pair that brackets renderAt.
      let aIdx = -1;
      for (let i = q.length - 1; i >= 1; i--) {
        if (q[i - 1].t <= renderAt) { aIdx = i - 1; break; }
      }
      if (aIdx === -1) {
        // renderAt is older than any queued snapshot — show oldest
        prev = q[0].snap;
        snap = q[1]?.snap ?? q[0].snap;
        interp = 0;
      } else {
        const a = q[aIdx];
        const b = q[aIdx + 1];
        prev = a.snap;
        snap = b.snap;
        const gap = Math.max(16, b.t - a.t);
        interp = Math.min(1, Math.max(0, (renderAt - a.t) / gap));
      }
    } else {
      snap = this.latestSnapshot;
      prev = this.prevSnapshot;
      interp = 1;
    }

    // Build per-id Maps from the previous snapshot once, so subsequent lookups
    // inside the per-entity render loops are O(1) instead of O(n) per find().
    // Reuse class-field Maps instead of allocating new ones every frame.
    this._prevPlayerById.clear();
    if (prev) for (const pp of prev.players) this._prevPlayerById.set(pp.id, pp);
    this._prevNpcById.clear();
    if (prev) for (const pn of prev.npcs) this._prevNpcById.set(pn.id, pn);
    const prevPlayerById = this._prevPlayerById;
    const prevNpcById    = this._prevNpcById;

    // Find the "king of the arena" — top player by score (level*100 + waveNumber*50).
    // Their nameplate gets a 👑 prefix. Ties broken by id for stability.
    const topPlayerId = (() => {
      let best: { id: string; score: number } | null = null;
      for (const p of snap.players) {
        if (!p.alive) continue;
        const score = p.level * 100 + (p.waveNumber ?? 0) * 50;
        if (!best || score > best.score) best = { id: p.id, score };
      }
      return best?.id ?? '';
    })();

    // Hoist clock reads — called once for all loops instead of per-entity
    const renderNow = performance.now();
    const wallNow   = Date.now();

    // players — cache selfPlayer once (avoids two separate .find() calls later)
    this._seenPlayers.clear();
    const seenPlayers = this._seenPlayers;
    this._cachedSelfPlayer = undefined;
    for (const pl of snap.players) { if (pl.id === this.selfId) { this._cachedSelfPlayer = pl; break; } }
    const selfPlayer = this._cachedSelfPlayer;
    if (selfPlayer?.mobaTeam) this.selfMobaTeam = selfPlayer.mobaTeam;
    for (const p of snap.players) {
      seenPlayers.add(p.id);
      let container = this.playerSprites.get(p.id);
      if (!container) {
        container = this.makePlayerContainer(p);
        this.playerSprites.set(p.id, container);
      }

      // Position
      let renderX: number;
      let renderY: number;
      if (p.id === this.selfId && this.predictedSelf) {
        renderX = this.predictedSelf.x;
        renderY = this.predictedSelf.y;
      } else {
        const interpPos = lerpEntity(prevPlayerById.get(p.id), p, interp);
        renderX = interpPos.x;
        renderY = interpPos.y;
      }
      container.x = renderX;
      container.y = renderY;
      container.setVisible(p.alive);

      // Bush vision — MOBA/ARAM: hide enemy players that are inside a bush
      // you are not also occupying (same mechanic as LoL/MLBB).
      if (p.alive && p.id !== this.selfId && this.mobaBushZones.length > 0 &&
          (snap.gameMode === 'moba' || snap.gameMode === 'aram')) {
        const sameTeam = p.mobaTeam && this.selfMobaTeam && p.mobaTeam === this.selfMobaTeam;
        if (!sameTeam) {
          const bushIdx = this.mobaBushZones.findIndex(b => Math.hypot(renderX - b.x, renderY - b.y) < b.r);
          if (bushIdx >= 0) {
            const bz = this.mobaBushZones[bushIdx];
            const selfX = this.predictedSelf?.x ?? selfPlayer?.x ?? -99999;
            const selfY = this.predictedSelf?.y ?? selfPlayer?.y ?? -99999;
            const selfInSameBush = Math.hypot(selfX - bz.x, selfY - bz.y) < bz.r;
            if (!selfInSameBush) {
              container.setVisible(false);
              continue;
            }
          }
        }
      }

      // moving? for self, use input. for others, compare snapshot-to-snapshot.
      let moving = false;
      if (p.alive) {
        if (p.id === this.selfId) {
          moving = this.inputDx !== 0 || this.inputDy !== 0;
        } else {
          const prevP = prevPlayerById.get(p.id);
          if (prevP) {
            moving = (Math.abs(p.x - prevP.x) + Math.abs(p.y - prevP.y)) > 0.5;
          }
        }
      }

      // sprite + tint + facing + nameplate + hp bar
      const body = container.getByName('body') as Phaser.GameObjects.Sprite;
      // keep scale consistent if character changed (e.g. on respawn)
      const expectedScale = (PLAYER_SPRITE_SCALE[p.character] ?? 1.0) * SPRITE_SHRINK;
      if (Math.abs(body.scaleX - expectedScale) > 0.01) body.setScale(expectedScale);
      // For self: derive facing from current client input so the sprite turns instantly
      // on direction change instead of waiting for the server snapshot (moonwalk fix).
      let facing = p.facing;
      if (p.id === this.selfId && (this.inputDx !== 0 || this.inputDy !== 0)) {
        const ax = Math.abs(this.inputDx), ay = Math.abs(this.inputDy);
        facing = ax >= ay ? (this.inputDx > 0 ? 'east' : 'west')
                           : (this.inputDy > 0 ? 'south' : 'north');
      }
      const animKey = `${p.character}_walk_${facing}`;
      const idleKey = `${p.character}_${facing}`;
      if (moving && this.anims.exists(animKey)) {
        // play(key, ignoreIfPlaying) — ignoreIfPlaying=true means restart only if not already running
        body.anims.play(animKey, true);
      } else {
        if (body.anims.isPlaying) body.anims.stop();
        if (this.hasFrame(idleKey) && body.frame.name !== idleKey) body.setTexture(this.atlasFor(idleKey), idleKey);
      }

      // hit-flash: detect HP drop, override tint to red briefly
      const track = this.playerHpTrack.get(p.id) ?? { lastHp: p.hp, flashUntilMs: 0 };
      if (p.hp < track.lastHp - 0.01 && p.alive) {
        track.flashUntilMs = renderNow + 220;
      } else if (p.hp > track.lastHp + 0.5 && p.alive) {
        const healed = Math.round(p.hp - track.lastHp);
        if (healed >= 1) this.spawnDamageNumber(p.x, p.y - 10, healed, '#44ff88');
      }
      track.lastHp = p.hp;
      this.playerHpTrack.set(p.id, track);

      // Damage flash + hue-based tint
      const isInvuln = wallNow < p.invulnerableUntil;
      if (renderNow < track.flashUntilMs) {
        body.setTint(0xff3333);
      } else {
        body.setTint(hueToTint(p.hue ?? 0));
      }
      body.setAlpha(1);

      // Shield bubble — visible only while invulnerable, slowly rotates and pulses
      const shield = container.getByName('shield') as Phaser.GameObjects.Sprite | null;
      if (shield) {
        shield.setVisible(isInvuln);
        if (isInvuln) {
          shield.setRotation((renderNow / 800) % (Math.PI * 2));
          const pulse = 1 + Math.sin(renderNow * 0.008) * 0.06;
          shield.setScale(1.05 * pulse);
        }
      }

      // Time Shield ring — visible while damageImmuneUntil is in the future.
      // Bright blue glowing aura — clearly readable as "shield is up right now".
      const timeShield = container.getByName('timeShield') as Phaser.GameObjects.Graphics | null;
      const tsActive = wallNow < (p.damageImmuneUntil ?? 0);
      if (timeShield) {
        if (tsActive) {
          timeShield.setVisible(true);
          const tsLastDraw = (timeShield.getData('lastDraw') as number) ?? 0;
          if (renderNow - tsLastDraw < 33) {
            // throttle to 30fps — skip redraw this frame
          } else {
          timeShield.setData('lastDraw', renderNow);
          timeShield.clear();
          const pulse = 1 + Math.sin(renderNow * 0.012) * 0.08;
          const r = 30 * pulse;
          // outer soft glow halo (multiple stacked translucent fills)
          timeShield.fillStyle(0x55bbff, 0.10);
          timeShield.fillCircle(0, 0, r + 14);
          timeShield.fillStyle(0x88ddff, 0.16);
          timeShield.fillCircle(0, 0, r + 8);
          timeShield.fillStyle(0xaaeeff, 0.22);
          timeShield.fillCircle(0, 0, r + 3);
          // bright cyan ring
          timeShield.lineStyle(3, 0x66ccff, 0.95);
          timeShield.strokeCircle(0, 0, r);
          // inner highlight ring
          timeShield.lineStyle(1, 0xffffff, 0.9);
          timeShield.strokeCircle(0, 0, r - 3);
          // 4 spinning sparkles
          const t = renderNow / 250;
          for (let i = 0; i < 4; i++) {
            const a = t + (i / 4) * Math.PI * 2;
            const sx = Math.cos(a) * r;
            const sy = Math.sin(a) * r;
            timeShield.fillStyle(0xffffff, 0.95);
            timeShield.fillCircle(sx, sy, 2.5);
            timeShield.fillStyle(0xaaeeff, 0.5);
            timeShield.fillCircle(sx, sy, 4.5);
          }
          } // end throttle else
        } else {
          timeShield.setVisible(false);
        }
      }

      // Frost Aura — subtle pale-blue ring at the actual damage radius. Stays
      // muted (low alpha, non-ADD blend) so it doesn't compete with the bright
      // Time Shield bubble.
      const frostAura = container.getByName('frostAura') as Phaser.GameObjects.Graphics | null;
      if (frostAura) {
        if (p.frostAuraDmg > 0 && p.frostAuraRadius > 0) {
          frostAura.setVisible(true);
          const faLastDraw = (frostAura.getData('lastDraw') as number) ?? 0;
          if (renderNow - faLastDraw >= 33) {
            frostAura.setData('lastDraw', renderNow);
            frostAura.clear();
            const r = p.frostAuraRadius;
            // very faint inner mist
            frostAura.fillStyle(0xaaccee, 0.05);
            frostAura.fillCircle(0, 0, r);
            // soft outline ring
            frostAura.lineStyle(1, 0xccddee, 0.35);
            frostAura.strokeCircle(0, 0, r);
            // 6 slowly drifting tiny snowflakes around the perimeter
            const t = renderNow / 1400;
            for (let i = 0; i < 6; i++) {
              const a = t + (i / 6) * Math.PI * 2;
              const wob = Math.sin(renderNow * 0.002 + i) * 3;
              const sx = Math.cos(a) * (r + wob);
              const sy = Math.sin(a) * (r + wob);
              frostAura.fillStyle(0xffffff, 0.45);
              frostAura.fillCircle(sx, sy, 1.5);
            }
          }
        } else {
          frostAura.setVisible(false);
        }
      }

      // Aura Shield weapon ring — visible when equipped, pulses gently
      const aura = container.getByName('aura') as Phaser.GameObjects.Graphics | null;
      const hasAura = p.weapons.includes('aura_shield');
      if (aura) {
        if (hasAura) {
          aura.setVisible(true);
          const auraLastDraw = (aura.getData('lastDraw') as number) ?? 0;
          if (renderNow - auraLastDraw >= 33) {
            aura.setData('lastDraw', renderNow);
            const radius = 70 * (p.auraShieldRangeMul ?? 1);
            const pulse = 1 + Math.sin(renderNow * 0.005) * 0.05;
            const r = radius * pulse;
            aura.clear();
            // outer soft glow
            aura.lineStyle(2, 0xffcc44, 0.35);
            aura.strokeCircle(0, 0, r + 4);
            // bright inner ring
            aura.lineStyle(3, 0xffe080, 0.85);
            aura.strokeCircle(0, 0, r);
            // sparkle dots rotating around perimeter
            const t = renderNow / 400;
            for (let i = 0; i < 6; i++) {
              const a = t + (i / 6) * Math.PI * 2;
              const sx = Math.cos(a) * r;
              const sy = Math.sin(a) * r;
              aura.fillStyle(0xfff0a0, 0.9);
              aura.fillCircle(sx, sy, 2.5);
            }
          }
        } else {
          aura.setVisible(false);
        }
      }

      const nameLabel = container.getByName('name') as Phaser.GameObjects.Text;
      const flag = countryFlag(p.country);
      const crown = p.id === topPlayerId ? '👑 ' : '';
      nameLabel.setText(`${crown}${flag ? flag + ' ' : ''}${p.name} · L${p.level}`);
      const hpBar = container.getByName('hp') as Phaser.GameObjects.Graphics;
      drawHpBar(hpBar, p.hp / p.maxHp, p.id === this.selfId ? 0x66ff88 : 0xff6666, -38);
    }
    for (const [id, sprite] of this.playerSprites) {
      if (!seenPlayers.has(id)) {
        sprite.destroy();
        this.playerSprites.delete(id);
      }
    }

    // npcs
    this._seenNpcs.clear();
    const seenNpcs = this._seenNpcs;
    for (const n of snap.npcs) {
      seenNpcs.add(n.id);
      let s = this.npcSprites.get(n.id);
      if (!s) {
        const baseKind = VARIANT_BASE[n.kind] ?? n.kind;
        const tex = `${baseKind}_south`;
        const npcScale = (NPC_SPRITE_SCALE[n.kind] ?? 1) * SPRITE_SHRINK;
        const kindPool = this.npcPool.get(n.kind);
        if (kindPool && kindPool.length > 0) {
          s = kindPool.pop()!;
          const frameKey0 = this.hasFrame(tex) ? tex : 'skeleton_south';
          s.setTexture(this.atlasFor(frameKey0), frameKey0);
          s.setVisible(true).setActive(true).setAlpha(1).clearTint();
        } else {
          const frameKey0 = this.hasFrame(tex) ? tex : 'skeleton_south';
          s = this.add.sprite(n.x, n.y, this.atlasFor(frameKey0), frameKey0);
          s.setDepth(10);
        }
        s.setScale(npcScale);
        s.setData('baseScale', npcScale);
        s.setData('kind', n.kind);
        this.npcSprites.set(n.id, s);
      }
      const prevN = prevNpcById.get(n.id);
      // Capture immediately: lerpEntity returns a shared scratch object, so read its
      // values now rather than holding the reference across the rest of the loop body.
      const interpPos = lerpEntity(prevN, n, interp);
      const npcRenderX = interpPos.x, npcRenderY = interpPos.y;
      const moving = prevN
        ? (Math.abs(n.x - prevN.x) + Math.abs(n.y - prevN.y)) > 0.5
        : false;
      let facing: Facing = this.npcFacing.get(n.id) ?? 'south';
      if (prevN && moving) {
        const rawDx = n.x - prevN.x;
        const rawDy = n.y - prevN.y;
        // Exponential moving average (alpha=0.25) to smooth out crowd-separation noise.
        // Raw deltas oscillate per-snapshot when NPCs push each other; smoothed values are stable.
        const prevVel = this.npcSmoothVel.get(n.id) ?? [rawDx, rawDy];
        const sdx = prevVel[0] * 0.75 + rawDx * 0.25;
        const sdy = prevVel[1] * 0.75 + rawDy * 0.25;
        this.npcSmoothVel.set(n.id, [sdx, sdy]);
        const absDx = Math.abs(sdx);
        const absDy = Math.abs(sdy);
        // Hysteresis: only switch axis when new axis dominates by 40%+.
        const isHorizontal = facing === 'east' || facing === 'west';
        if (isHorizontal) {
          if (absDy > absDx * 1.4) facing = sdy > 0 ? 'south' : 'north';
          else if (absDx > 0) facing = sdx > 0 ? 'east' : 'west';
        } else {
          if (absDx > absDy * 1.4) facing = sdx > 0 ? 'east' : 'west';
          else if (absDy > 0) facing = sdy > 0 ? 'south' : 'north';
        }
        this.npcFacing.set(n.id, facing);
      }
      const spriteKind = VARIANT_BASE[n.kind] ?? n.kind;
      const animKey = `${spriteKind}_walk_${facing}`;
      const idleKey = `${spriteKind}_${facing}`;
      if (moving && this.anims.exists(animKey)) {
        s.anims.play(animKey, true);
      } else {
        if (s.anims.isPlaying) s.anims.stop();
        if (this.hasFrame(idleKey) && s.frame.name !== idleKey) s.setTexture(this.atlasFor(idleKey), idleKey);
      }

      // hit flash for NPCs + floating damage number
      const ntrack = this.npcHpTrack.get(n.id) ?? { lastHp: n.hp, flashUntilMs: 0 };
      if (n.hp < ntrack.lastHp - 0.01) {
        ntrack.flashUntilMs = renderNow + 150;
        const dmg = Math.max(1, Math.round(ntrack.lastHp - n.hp));
        this.spawnDamageNumber(n.x, n.y - 6, dmg);
      }
      ntrack.lastHp = n.hp;
      this.npcHpTrack.set(n.id, ntrack);
      // MOBA/ARAM team tint: blue team = blue hue, red team = red hue
      const teamBaseTint = n.ownerPlayerId === 'blue' ? 0x88bbff
        : n.ownerPlayerId === 'red'  ? 0xff8866
        : (VARIANT_TINT[n.kind] ?? 0xffffff);
      if (renderNow < ntrack.flashUntilMs) {
        s.setTint(0xffffff);
      } else {
        s.setTint(teamBaseTint);
      }

      s.x = npcRenderX;
      s.y = npcRenderY;
    }
    for (const [id, s] of this.npcSprites) {
      if (!seenNpcs.has(id)) {
        const kind = s.getData('kind') as string;
        s.anims.stop();
        s.setVisible(false).setActive(false);
        let kindPool = this.npcPool.get(kind);
        if (!kindPool) { kindPool = []; this.npcPool.set(kind, kindPool); }
        kindPool.push(s);
        this.npcHpTrack.delete(id);
        this.npcFacing.delete(id);
        this.npcSmoothVel.delete(id);
        this.npcSprites.delete(id);
      }
    }

    // gems — tier picked from value
    this._seenGems.clear();
    const seenGems = this._seenGems;
    const gemTNow = performance.now();
    for (const g of snap.gems) {
      seenGems.add(g.id);
      let s = this.gemSprites.get(g.id);
      const tex =
        g.value >= 10 ? 'gem_epic' :
        g.value >= 5  ? 'gem_gold' :
        g.value >= 3  ? 'gem_green' :
                        'gem_blue';
      // Smaller — gems shouldn't dominate the screen
      const baseScale = SPRITE_SHRINK * (
        g.value >= 10 ? 0.75 :
        g.value >= 5  ? 0.6 :
        g.value >= 3  ? 0.5 :
                        0.4
      );
      if (!s) {
        if (this.gemPool.length > 0) {
          s = this.gemPool.pop()!;
          s.setTexture('atlas', tex).setVisible(true).setActive(true).setAlpha(1);
        } else {
          s = this.add.sprite(g.x, g.y, 'atlas', tex);
          s.setBlendMode(Phaser.BlendModes.NORMAL);
        }
        s.setData('baseScale', baseScale);
        this.gemSprites.set(g.id, s);
      } else if (s.frame.name !== tex) {
        s.setTexture('atlas', tex);
        s.setData('baseScale', baseScale);
      }
      s.x = g.x;
      s.y = g.y;
      // subtle bobbing + scale pulse so they catch the eye
      const phase = (gemTNow * 0.004 + g.x * 0.01 + g.y * 0.013);
      const bob = Math.sin(phase) * 1.5;
      const pulse = 1 + Math.sin(phase * 2) * 0.06;
      s.y = g.y + bob;
      s.setScale(baseScale * pulse);
      // epic gems rotate
      if (g.value >= 10) s.setRotation((gemTNow / 600) % (Math.PI * 2));
    }
    for (const [id, s] of this.gemSprites) {
      if (!seenGems.has(id)) {
        s.setVisible(false).setActive(false);
        this.gemPool.push(s);
        this.gemSprites.delete(id);
      }
    }

    // projectiles — element comes from the WEAPON (so picking up Leaf Cutter on a fire wizard
    // shoots leaves, not fireballs).
    this._seenProj.clear();
    const seenProj = this._seenProj;
    const tNow = performance.now();
    // Render clientProjs (straight/wave/orbital — simulated locally) + snap.projectiles (homing only)
    // Reuse class-level buffer to avoid per-frame allocation.
    const allProjectiles = this._renderProjBuf;
    allProjectiles.length = 0;
    for (const cp of this.clientProjs.values()) allProjectiles.push(cp);
    for (const sp of snap.projectiles) allProjectiles.push(sp);
    for (const pr of allProjectiles) {
      seenProj.add(pr.id);
      const elem = (WEAPON_ELEMENT as Record<string, string>)[pr.weapon] ?? 'arcane';
      const tex = `proj_${elem}`;
      let s = this.projSprites.get(pr.id);
      if (!s) {
        // Homing projectiles (from snapshot) need SFX here — non-homing handled via newProjs in snapshot
        if (pr.ownerId === this.selfId && !this.clientProjs.has(pr.id)) this.sfxFire(pr.weapon as any);
        const GLOBAL_SCALE = 0.65 * SPRITE_SHRINK;
        const weaponScale =
          pr.weapon === 'sword' ? 1.15 :
          pr.weapon === 'fireball' ? 1.05 :
          pr.weapon === 'orb' ? 0.95 :
          pr.weapon === 'shadow_bolt' ? 0.9 :
          pr.weapon === 'lightning_bolt' ? 0.85 :
          0.75;
        const elementScale = elem === 'forest' ? 0.6 : elem === 'lightning' ? 1.1 : elem === 'earth' ? 1.0 : 0.95;
        const baseScale = weaponScale * elementScale * GLOBAL_SCALE;
        if (this.projPool.length > 0) {
          s = this.projPool.pop()!;
          s.setTexture('atlas', tex).setPosition(pr.x, pr.y).setVisible(true).setActive(true).setAlpha(1).clearTint();
        } else {
          s = this.add.sprite(pr.x, pr.y, 'atlas', tex);
        }
        s.setData('baseScale', baseScale);
        s.setBlendMode(elem === 'earth' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
        s.setScale(baseScale);
        // Push fire toward red — orange→red shift via tint multiply
        if (elem === 'fire') s.setTint(0xff5533);
        // Evolved weapon tints for Wizard Survivor mode
        const VS_EVOLVED_TINTS: Partial<Record<string, number>> = {
          holy_bolt: 0xFFD700, storm_daggers: 0xCC44FF, death_vortex: 0xFF2222,
          hellfire: 0xFF8800, soul_drain: 0x44FF88, thunder_storm: 0x44AAFF,
          arcane_nova: 0xFFFFFF, eternal_orbit: 0xFF44AA,
        };
        if (VS_EVOLVED_TINTS[pr.weapon]) s.setTint(VS_EVOLVED_TINTS[pr.weapon]!);
        this.projSprites.set(pr.id, s);
      }
      s.x = pr.x;
      s.y = pr.y;

      const baseScale = (s.getData('baseScale') as number) ?? 1;
      const angle = Math.atan2(pr.vy, pr.vx);
      // Per-element animation flair
      if (elem === 'lightning') {
        // bolt flickers + always points along velocity
        s.setRotation(angle);
        s.setAlpha(Math.floor(tNow / 50) % 2 === 0 ? 1 : 0.5);
      } else if (elem === 'earth') {
        // rock tumbles
        s.setRotation((tNow / 120) % (Math.PI * 2));
        s.setAlpha(1);
      } else if (elem === 'fire') {
        // flame points up-from-velocity, scale wobbles
        s.setRotation(angle + Math.PI / 2);
        const wobble = 1 + Math.sin(tNow * 0.03) * 0.1;
        s.setScale(baseScale * wobble);
        s.setAlpha(0.95);
      } else if (elem === 'forest') {
        // leaf spins as it flies
        s.setRotation(angle + tNow / 200);
        s.setAlpha(1);
      } else if (elem === 'shadow') {
        // pulsing darkness
        const pulse = 1 + Math.sin(tNow * 0.012) * 0.12;
        s.setScale(baseScale * pulse);
        s.setRotation((tNow / 300) % (Math.PI * 2));
        s.setAlpha(0.95);
      } else {
        // arcane: gentle pulse
        const pulse = 1 + Math.sin(tNow * 0.015) * 0.08;
        s.setScale(baseScale * pulse);
        s.setAlpha(1);
      }
    }
    for (const [id, s] of this.projSprites) {
      if (!seenProj.has(id)) {
        s.setVisible(false).setActive(false);
        this.projPool.push(s);
        this.projSprites.delete(id);
      }
    }

    // Spirit Wolves — wolf-head sprite layered over a procedural ghost orb.
    // Orb tints red while lunging so you can read the wolf's state at a glance.
    this._seenWolves.clear();
    const seenWolves = this._seenWolves;
    for (const w of (snap.wolves ?? [])) {
      seenWolves.add(w.id);
      let container = this.wolfSprites.get(w.id);
      if (!container) {
        if (this.wolfPool.length > 0) {
          container = this.wolfPool.pop()!;
          container.setVisible(true).setActive(true);
        } else {
          container = this.add.container(w.x, w.y);
          container.setDepth(20);
          const glow = this.add.graphics().setName('glow').setBlendMode(Phaser.BlendModes.ADD);
          container.add(glow);
          if (this.hasFrame('icon_wolf')) {
            const head = this.add.sprite(0, 0, 'atlas', 'icon_wolf').setName('head').setScale(0.55);
            container.add(head);
          }
        }
        this.wolfSprites.set(w.id, container);
      }
      container.x = w.x;
      container.y = w.y;
      const glow = container.getByName('glow') as Phaser.GameObjects.Graphics;
      const head = container.getByName('head') as Phaser.GameObjects.Sprite | null;
      const wolfNow = performance.now();
      const wolfLastDraw = (glow.getData('lastDraw') as number) ?? 0;
      if (wolfNow - wolfLastDraw >= 33) {
        glow.setData('lastDraw', wolfNow);
        const colorOuter = w.state === 'lunge' ? 0xffaaaa : 0xaaeeff;
        const colorInner = w.state === 'lunge' ? 0xffeeee : 0xeeffff;
        const pulse = 1 + Math.sin(wolfNow * 0.006 + w.x * 0.01) * 0.08;
        glow.clear();
        glow.fillStyle(colorOuter, 0.28); glow.fillCircle(0, 0, 18 * pulse);
        glow.fillStyle(colorOuter, 0.50); glow.fillCircle(0, 0, 12 * pulse);
        glow.fillStyle(colorInner, 0.85); glow.fillCircle(0, 0, 6 * pulse);
        if (head) {
          head.setTint(w.state === 'lunge' ? 0xffaaaa : 0xffffff);
          head.setAlpha(0.95);
        }
      }
    }
    for (const [id, c] of this.wolfSprites) {
      if (!seenWolves.has(id)) {
        c.setVisible(false).setActive(false);
        this.wolfPool.push(c);
        this.wolfSprites.delete(id);
      }
    }

    // Trail of Fire (client-only visuals): drop a flame puff at each player's
    // recent position whenever the player has the powerup and is moving.
    const trailNow = performance.now();
    for (const p of snap.players) {
      if (!p.alive) continue;
      const prev = this.prevPlayerPos.get(p.id);
      const moved = !prev || (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)) > 0.5;
      if (p.trailOfFireEnabled && moved && (!prev || trailNow - prev.t > 90)) {
        let puff: Phaser.GameObjects.Graphics;
        if (this.trailPool.length > 0) {
          puff = this.trailPool.pop()!;
          puff.clear();
          puff.setAlpha(1).setVisible(true).setActive(true);
        } else {
          puff = this.add.graphics();
          puff.setDepth(8);
          puff.setBlendMode(Phaser.BlendModes.ADD);
        }
        const px = p.x;
        const py = p.y + 4;
        puff.fillStyle(0xff5511, 0.5); puff.fillCircle(px, py, 12);
        puff.fillStyle(0xff9933, 0.65); puff.fillCircle(px, py, 8);
        puff.fillStyle(0xffeecc, 0.85); puff.fillCircle(px, py, 4);
        const list = this.trailVisuals.get(p.id) ?? [];
        list.push({ x: px, y: py, bornAt: trailNow, sprite: puff });
        this.trailVisuals.set(p.id, list);
        this.tweens.add({
          targets: puff,
          alpha: { from: 1, to: 0 },
          duration: 1800,
          ease: 'Quad.easeOut',
          onComplete: () => { puff.clear(); puff.setVisible(false).setActive(false); this.trailPool.push(puff); },
        });
        this.prevPlayerPos.set(p.id, { x: p.x, y: p.y, t: trailNow });
      } else if (!prev || moved) {
        this.prevPlayerPos.set(p.id, { x: p.x, y: p.y, t: prev?.t ?? trailNow });
      }
    }
    // Prune trailVisuals lists in-place (no array allocation per player per frame)
    for (const list of this.trailVisuals.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (trailNow - list[i].bornAt >= 2200) list.splice(i, 1);
      }
    }

    // camera follow self — lerp toward predicted position to absorb reconciliation jolts
    const self = selfPlayer;
    if (self) {
      const tx = this.predictedSelf?.x ?? self.x;
      const ty = this.predictedSelf?.y ?? self.y;
      if (this.camX === undefined || this.camY === undefined) {
        // First frame — snap instantly
        this.camX = tx;
        this.camY = ty;
      } else {
        // Lerp at 0.25/frame (~4 frames to close 75% of gap). Fast enough to feel
        // responsive, slow enough to smooth out the 2-5px reconciliation corrections.
        this.camX += (tx - this.camX) * 0.25;
        this.camY += (ty - this.camY) * 0.25;
      }
      this.cameras.main.centerOn(this.camX, this.camY);
    }

    // SFX: detect XP gain / HP loss / respawn for self
    if (self) {
      // gem pickup — richer multi-tone "ting"; pitch scales with gem value
      if (this.prevSelfXp >= 0 && self.xp > this.prevSelfXp && self.level === this.prevSelfLevel) {
        const delta = self.xp - this.prevSelfXp;
        this.sfxGem(delta);
      }
      // hit — punchier two-layer thud
      if (this.prevSelfHp >= 0 && self.hp < this.prevSelfHp - 0.5 && self.alive) {
        this.sfx(120, 0.14, 0.18, 'sawtooth');
        this.sfx(60, 0.18, 0.10, 'sine');
      }
      // respawn — soft chord
      if (!this.prevSelfAlive && self.alive) {
        this.sfxArpeggio([392, 494, 587], 0.05, 0.14);
      }
      this.prevSelfXp = self.xp;
      this.prevSelfLevel = self.level;
      this.prevSelfHp = self.hp;
      this.prevSelfAlive = self.alive;
    }

    // Pickups: droppable items on the ground (health, speed boost, etc.)
    this.renderPickups(snap.pickups ?? [], performance.now());

    // VS Chests: golden treasure chests dropped by bosses in wizard_survivor mode
    if (snap.gameMode === 'wizard_survivor') {
      this.renderVsChests(snap.vsChests ?? [], performance.now());
    } else if (this.chestVisuals.size > 0) {
      for (const g of this.chestVisuals.values()) g.destroy();
      this.chestVisuals.clear();
    }

    // Boss projectiles (generation-based bullet hell)
    this.renderBossProjectiles(snap.bossProjectiles ?? [], performance.now());

    // Hazards: warning ring + active fire/lightning visuals.
    // Hazard timestamps are server Date.now() — use snap.t (server time) for comparison.
    this.renderHazards(snap.hazards ?? [], snap.t);

    // Arena elemental theme
    const snapElement = snap.arenaElement ?? 'normal';
    if (snapElement !== this.lastArenaElement) {
      this.lastArenaElement = snapElement;
      this.bus.emit('arenaElement', snapElement);
    }

    // Castle Defender — render castle and emit castle state
    if (snap.gameMode === 'castle' && snap.castle) {
      this.updateCastleGraphics(snap.castle);
    }

    // Crystal Rush (MOBA) / ARAM — lane background + tower/crystal graphics
    if (snap.gameMode === 'moba' || snap.gameMode === 'aram') {
      if (!this.mobaLanePaths) {
        if (snap.gameMode === 'aram') this.initAramBackground();
        else this.initMobaBackground();
      }
      this.updateMobaGraphics(snap);
    }

    // emit HUD update — top-bar wave is the room's global wave; survivalWave tracks this player's personal progression
    this.bus.emit('hud', {
      self,
      players: snap.players,
      wave: snap.wave,
      waveName: snap.waveName,
      waveTimeLeftMs: snap.waveTimeLeftMs,
      survivalWave: self?.waveNumber ?? 0,
      npcs: snap.npcs.length,
      gems: snap.gems.length,
      castle: snap.castle,
      gameMode: snap.gameMode,
      towers: snap.towers,
      mobaCrystals: snap.mobaCrystals,
      activeBossId: snap.activeBossId,
      bossMaxHp: snap.bossMaxHp,
      bossHp: snap.bossHp,
    });

    this.renderWaveAlerts(performance.now());
  }

  renderWaveAlerts(clientNow: number) {
    const DURATION = 3000;
    this.waveAlerts = this.waveAlerts.filter(a => clientNow - a.bornAt < DURATION);
    for (const alert of this.waveAlerts) {
      const age = clientNow - alert.bornAt;
      const alpha = Math.max(0, 1 - age / DURATION);
      const pulse = 0.6 + Math.sin(age * 0.012) * 0.4;
      const radius = 80 + Math.sin(age * 0.008) * 20;
      const g = this.add.graphics();
      g.setDepth(8);
      g.lineStyle(2, 0xff4400, alpha * pulse);
      g.strokeCircle(alert.x, alert.y, radius);
      g.fillStyle(0xff2200, alpha * 0.12 * pulse);
      g.fillCircle(alert.x, alert.y, radius);
      g.lineStyle(2, 0xffaa00, alpha);
      g.strokeCircle(alert.x, alert.y, 12);
      this.time.delayedCall(50, () => g.destroy());
    }
  }

  updateCastleGraphics(castle: { hp: number; maxHp: number; x: number; y: number }) {
    // Build castle on first call
    if (!this.castleGraphic) {
      // Ambient glow pool under the inhibitor (static, no update needed)
      const glow = this.add.graphics().setDepth(1.5);
      glow.fillStyle(0x6699ff, 0.18);
      glow.fillCircle(castle.x, castle.y, 90);
      glow.lineStyle(5, 0x88bbff, 0.45);
      glow.strokeCircle(castle.x, castle.y, 72);
      glow.lineStyle(3, 0xaaddff, 0.25);
      glow.strokeCircle(castle.x, castle.y, 90);

      // InibidorBlue sprite as the castle
      this.castleGraphic = this.add.image(castle.x, castle.y, 'scene_InibidorBlue')
        .setDisplaySize(110, 165)
        .setDepth(2);

      // HP bar (world-space, above castle)
      this.castleHpBar = this.add.graphics().setDepth(2.5);

      // Gate markers at arena edges
      const gates = [
        { x: castle.x, y: 80 },
        { x: castle.x, y: 3120 },
        { x: 3120, y: castle.y },
        { x: 80, y: castle.y },
      ];
      for (const g of gates) {
        const marker = this.add.graphics().setDepth(0.5);
        marker.fillStyle(0xff3300, 0.7);
        marker.fillTriangle(-16, 0, 16, 0, 0, 28);
        marker.lineStyle(2, 0xff6600, 1);
        marker.strokeTriangle(-16, 0, 16, 0, 0, 28);
        marker.setPosition(g.x, g.y);
        this.castleGateMarkers.push(marker);
      }
    }

    // Update HP bar
    if (this.castleHpBar) {
      const bar = this.castleHpBar;
      bar.clear();
      const pct = castle.hp / castle.maxHp;
      const W = 120, H = 10;
      const bx = castle.x - W / 2;
      const by = castle.y - 100;
      // Background
      bar.fillStyle(0x330000, 0.9);
      bar.fillRect(bx, by, W, H);
      // HP fill — red to green based on HP%
      const r = Math.round((1 - pct) * 255);
      const g = Math.round(pct * 255);
      bar.fillStyle(Phaser.Display.Color.GetColor(r, g, 0), 1);
      bar.fillRect(bx, by, Math.round(W * pct), H);
      // Border
      bar.lineStyle(1, 0xffffff, 0.6);
      bar.strokeRect(bx, by, W, H);
    }

    // Pulse alpha when HP is critical
    if (this.castleGraphic) {
      const pct = castle.hp / castle.maxHp;
      this.castleGraphic.setAlpha(pct < 0.25 ? 0.7 + 0.3 * Math.sin(Date.now() / 150) : 1);
    }
  }

  spawnCastleDestroyedEffect(cx: number, cy: number) {
    const g = this.add.graphics().setDepth(10);
    let t = 0;
    const maxT = 1200;
    const timer = this.time.addEvent({
      delay: 16,
      repeat: Math.ceil(maxT / 16),
      callback: () => {
        t += 16;
        g.clear();
        const progress = t / maxT;
        const radius = 20 + progress * 260;
        const alpha = Math.max(0, 1 - progress);
        g.fillStyle(0xff4400, alpha * 0.5);
        g.fillCircle(cx, cy, radius);
        g.lineStyle(4, 0xffaa00, alpha);
        g.strokeCircle(cx, cy, radius);
        if (t >= maxT) {
          g.destroy();
          timer.remove();
        }
      },
    });
    // Collapse the castle graphic
    if (this.castleGraphic) {
      this.tweens.add({
        targets: this.castleGraphic,
        alpha: 0,
        scaleX: 2,
        scaleY: 2,
        duration: 800,
        ease: 'Power2',
      });
    }
  }

  spawnTowerShotEffect(x: number, y: number, tx: number, ty: number, team: MobaTeam) {
    const color = team === 'blue' ? 0x44aaff : 0xff4422;
    const g = this.add.graphics().setDepth(15);
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, 7);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeCircle(0, 0, 7);
    g.setPosition(x, y);
    const dist = Math.hypot(tx - x, ty - y);
    const duration = Math.max(120, dist / 0.55); // ~550 px/s
    this.tweens.add({
      targets: g,
      x: tx, y: ty,
      duration,
      ease: 'Linear',
      onComplete: () => {
        // small impact burst
        g.clear();
        g.fillStyle(color, 0.8);
        g.fillCircle(0, 0, 14);
        this.tweens.add({ targets: g, alpha: 0, scaleX: 2, scaleY: 2, duration: 200, ease: 'Power2', onComplete: () => g.destroy() });
      },
    });
  }

  initAramBackground() {
    this.buildGroundTextures();

    // Grass covers full map
    this.add.tileSprite(1600, 1600, 3200, 3200, 'tile_grass').setDepth(0);

    // Single dirt corridor (500px tall, full width)
    this.add.tileSprite(1600, 1600, 2800, 500, 'tile_dirt').setDepth(0.05);

    // Subtle edge darkening strips above and below the corridor
    const g = this.add.graphics().setDepth(0.06);
    g.fillStyle(0x000000, 0.18);
    g.fillRect(200, 1340, 2800, 15);  // top edge shadow
    g.fillRect(200, 1845, 2800, 15);  // bottom edge shadow

    // Base glows
    const addBase = (cx: number, cy: number, color: number) => {
      const bg = this.add.graphics().setDepth(0.08);
      bg.fillStyle(color, 0.22);
      bg.fillCircle(cx, cy, 290);
      bg.lineStyle(5, color, 0.40);
      bg.strokeCircle(cx, cy, 205);
      bg.lineStyle(3, color, 0.25);
      bg.strokeCircle(cx, cy, 115);
    };
    addBase(400, 1600, 0x2266ff);
    addBase(2800, 1600, 0xff3322);

    this.mobaLanePaths = this.add.graphics(); // sentinel so init only runs once
    this.placeAramSceneObjects();
  }

  placeAramSceneObjects() {
    const img = (key: string, x: number, y: number, w: number, h: number, depth = 1) =>
      this.add.image(x, y, `scene_${key}`).setDisplaySize(w, h).setDepth(depth);

    // ── Trees flanking the corridor (decorative) ──────────────────────────
    // Above lane (y < 1350)
    img('Tree1',      550, 1130, 120, 165, 0.5);
    img('Tree2',      980, 1080, 105, 145, 0.5);
    img('SmallTree1',1200, 1050,  75, 105, 0.5);
    img('SmallTree2',1600,  980,  80, 110, 0.5);
    img('SmallTree1',2000, 1050,  75, 105, 0.5);
    img('Tree1',     2300, 1080, 105, 145, 0.5);
    img('Tree2',     2650, 1130, 120, 165, 0.5);
    // Below lane (y > 1850)
    img('Tree2',      550, 2070, 120, 165, 0.5);
    img('Tree1',      980, 2120, 105, 145, 0.5);
    img('SmallTree2',1200, 2150,  75, 105, 0.5);
    img('SmallTree1',1600, 2220,  80, 110, 0.5);
    img('SmallTree2',2000, 2150,  75, 105, 0.5);
    img('Tree2',     2300, 2120, 105, 145, 0.5);
    img('Tree1',     2650, 2070, 120, 165, 0.5);

    // ── Inhibitors — just outside each crystal ───────────────────────────
    img('InibidorBlue', 520, 1600, 65, 95, 1.5);   // between T1(750) and crystal(300)
    img('InibidorRed', 2680, 1600, 65, 95, 1.5);

    // ── Bushes (Howling Abyss-style: flanking the lane) ──────────────────
    const bushDefs: { key: string; x: number; y: number; r: number; w: number; h: number }[] = [
      // Blue side near T1 (750, 1600)
      { key: 'Bush1', x: 750, y: 1420, r: 70, w: 160, h: 115 },
      { key: 'Bush2', x: 750, y: 1780, r: 70, w: 160, h: 115 },
      // Mid-left
      { key: 'Bush2', x: 1200, y: 1400, r: 75, w: 165, h: 120 },
      { key: 'Bush1', x: 1200, y: 1800, r: 75, w: 165, h: 120 },
      // Center
      { key: 'Bush1', x: 1600, y: 1390, r: 80, w: 170, h: 125 },
      { key: 'Bush2', x: 1600, y: 1810, r: 80, w: 170, h: 125 },
      // Mid-right
      { key: 'Bush1', x: 2000, y: 1400, r: 75, w: 165, h: 120 },
      { key: 'Bush2', x: 2000, y: 1800, r: 75, w: 165, h: 120 },
      // Red side near T1 (2450, 1600)
      { key: 'Bush2', x: 2450, y: 1420, r: 70, w: 160, h: 115 },
      { key: 'Bush1', x: 2450, y: 1780, r: 70, w: 160, h: 115 },
    ];

    this.mobaBushZones = bushDefs.map(b => ({ x: b.x, y: b.y, r: b.r }));
    for (const b of bushDefs) img(b.key, b.x, b.y, b.w, b.h, 0.6);
  }

  initMobaBackground() {
    this.buildGroundTextures();

    // Grass base
    this.add.tileSprite(1600, 1600, 3200, 3200, 'tile_grass').setDepth(0);

    // Jungle floor — darker green tint in jungle zones (between lanes)
    const jungle = this.add.graphics().setDepth(0.01);
    jungle.fillStyle(0x2e4f22, 0.35);
    jungle.fillRect(80,   80,  320,  2700); // outer left strip
    jungle.fillRect(400,  80,  1200, 1200); // upper blue jungle
    jungle.fillRect(480,  1100, 620, 1050); // lower blue jungle
    jungle.fillRect(1600, 2020, 620, 1100); // upper red jungle
    jungle.fillRect(1600, 1020, 1200, 1000);// lower red jungle
    jungle.fillRect(2800, 420,  320,  2700); // outer right strip
    jungle.fillRect(500,  80,  2200, 300);  // top outer strip
    jungle.fillRect(500,  2820, 2200, 300); // bottom outer strip

    // River — diagonal band along y=x (top-left corner → bottom-right corner)
    const river = this.add.graphics().setDepth(0.02);
    river.fillStyle(0x2a6b52, 0.55);
    river.fillPoints([
      { x: 220,  y: 0    },
      { x: 0,    y: 220  },
      { x: 2980, y: 3200 },
      { x: 3200, y: 2980 },
    ], true);
    river.lineStyle(3, 0x3a9068, 0.45);
    river.beginPath();
    river.moveTo(0, 0);
    river.lineTo(3200, 3200);
    river.strokePath();

    // Lane dirt paths — wider for comfort
    const LW = 140;
    this.add.tileSprite(400,  1600, LW,   2400, 'tile_dirt').setDepth(0.05);
    this.add.tileSprite(1600, 400,  2400, LW,   'tile_dirt').setDepth(0.05);
    this.add.tileSprite(1600, 2800, 2400, LW,   'tile_dirt').setDepth(0.05);
    this.add.tileSprite(2800, 1600, LW,   2400, 'tile_dirt').setDepth(0.05);
    // Mid lane diagonal — 2400√2 ≈ 3394 long, rotated 45°
    this.add.tileSprite(1600, 1600, LW, 3394, 'tile_dirt')
      .setDepth(0.05).setRotation(Math.PI / 4);

    // Base glows with concentric rings
    const addBase = (cx: number, cy: number, color: number) => {
      const g = this.add.graphics().setDepth(0.08);
      g.fillStyle(color, 0.22);
      g.fillCircle(cx, cy, 330);
      g.lineStyle(5, color, 0.40);
      g.strokeCircle(cx, cy, 230);
      g.lineStyle(3, color, 0.25);
      g.strokeCircle(cx, cy, 130);
      g.lineStyle(2, color, 0.15);
      g.strokeCircle(cx, cy, 60);
    };
    addBase(400, 2800, 0x2266ff);
    addBase(2800, 400, 0xff3322);

    this.mobaLanePaths = this.add.graphics(); // sentinel so init only runs once
    this.placeMobaSceneObjects();
  }

  placeMobaSceneObjects() {
    const img = (key: string, x: number, y: number, w: number, h: number, depth = 1) =>
      this.add.image(x, y, `scene_${key}`).setDisplaySize(w, h).setDepth(depth);

    // ── Tree wall blocks (collision rects rendered as dark forest clusters) ──
    const treeGfx = this.add.graphics().setDepth(0.12);
    treeGfx.fillStyle(0x18361a, 0.92);
    treeGfx.lineStyle(2, 0x0d1e0e, 0.85);
    for (const rect of MOBA_COLLISION_RECTS) {
      treeGfx.fillRect(rect.x, rect.y, rect.w, rect.h);
      treeGfx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    // ── Decorative trees on top of collision walls ─────────────────────────
    // Blue jungle
    img('Tree1',       240,  230, 150, 200, 0.5);
    img('Tree2',       560,  540, 110, 150, 0.5);
    img('SmallTree1',  710,  640,  85, 115, 0.5);
    img('SmallTree2',  800,  600,  80, 110, 0.5);
    img('SmallTree1',  630, 1160,  80, 110, 0.5);
    img('SmallTree2',  870, 1100,  75, 105, 0.5);
    img('SmallTree1', 1060, 1550,  80, 110, 0.5);
    img('SmallTree2', 1250, 1560,  75, 100, 0.5);
    img('SmallTree1',  600, 2110,  80, 110, 0.5);
    img('SmallTree2',  200,  980,  70,  95, 0.5);
    img('SmallTree1',  180, 1360,  70,  95, 0.5);
    img('SmallTree2',  170, 1860,  70,  95, 0.5);
    // Red jungle (mirrored)
    img('Tree1',      2960, 2970, 150, 200, 0.5);
    img('Tree2',      2640, 2660, 110, 150, 0.5);
    img('SmallTree1', 2490, 2560,  85, 115, 0.5);
    img('SmallTree2', 2400, 2600,  80, 110, 0.5);
    img('SmallTree1', 2370, 2040,  80, 110, 0.5);
    img('SmallTree2', 2330, 2100,  75, 105, 0.5);
    img('SmallTree1', 2140, 1650,  80, 110, 0.5);
    img('SmallTree2', 1950, 1640,  75, 100, 0.5);
    img('SmallTree1', 2600, 1090,  80, 110, 0.5);
    img('SmallTree2', 3000, 2220,  70,  95, 0.5);
    img('SmallTree1', 3020, 1820,  70,  95, 0.5);
    img('SmallTree2', 3030, 1340,  70,  95, 0.5);

    // ── Inhibitors — one per lane, just inside each base ─────────────────
    img('InibidorBlue', 400, 2560, 70, 100, 1.5);
    img('InibidorBlue', 640, 2720, 70, 100, 1.5);
    img('InibidorBlue', 900, 2800, 70, 100, 1.5);
    img('InibidorRed',  2100, 400,  70, 100, 1.5);
    img('InibidorRed',  2640, 640,  70, 100, 1.5);
    img('InibidorRed',  2800, 900,  70, 100, 1.5);

    // ── Bushes — LoL-accurate strategic vision zones ──────────────────────
    const bushDefs: { key: string; x: number; y: number; r: number; w: number; h: number }[] = [
      // Top lane — left vertical
      { key: 'Bush1', x: 300,  y: 1900, r: 90,  w: 180, h: 130 },
      { key: 'Bush2', x: 220,  y: 1230, r: 80,  w: 160, h: 115 },
      { key: 'Bush1', x: 210,  y: 940,  r: 75,  w: 150, h: 110 },
      // Top lane — horizontal segment
      { key: 'Bush2', x: 900,  y: 300,  r: 80,  w: 160, h: 110 },
      { key: 'Bush1', x: 1800, y: 300,  r: 80,  w: 160, h: 110 },
      // Mid lane bushes (LoL tri-brush equivalent)
      { key: 'Bush2', x: 900,  y: 2050, r: 90,  w: 175, h: 125 },
      { key: 'Bush1', x: 1250, y: 1750, r: 85,  w: 170, h: 120 },
      { key: 'Bush1', x: 1950, y: 1450, r: 85,  w: 170, h: 120 },
      { key: 'Bush2', x: 2300, y: 1150, r: 90,  w: 175, h: 125 },
      // Bot lane — horizontal segment
      { key: 'Bush2', x: 1000, y: 2900, r: 80,  w: 160, h: 110 },
      { key: 'Bush1', x: 1900, y: 2900, r: 80,  w: 160, h: 110 },
      // Bot lane — right vertical
      { key: 'Bush2', x: 2900, y: 1300, r: 90,  w: 180, h: 130 },
      { key: 'Bush1', x: 2980, y: 940,  r: 75,  w: 150, h: 110 },
      { key: 'Bush2', x: 2780, y: 1900, r: 80,  w: 160, h: 115 },
      // River ambush bushes (near dragon/baron pits)
      { key: 'Bush1', x: 1100, y: 1100, r: 100, w: 195, h: 140 },
      { key: 'Bush2', x: 2100, y: 2100, r: 100, w: 195, h: 140 },
      // Jungle entrances
      { key: 'Bush1', x: 680,  y: 870,  r: 75,  w: 150, h: 110 },
      { key: 'Bush2', x: 2520, y: 2330, r: 75,  w: 150, h: 110 },
    ];

    this.mobaBushZones = bushDefs.map(b => ({ x: b.x, y: b.y, r: b.r }));
    for (const b of bushDefs) img(b.key, b.x, b.y, b.w, b.h, 0.6);
  }

  updateMobaGraphics(snap: Snapshot) {
    const towers = snap.towers ?? [];
    const crystals = snap.mobaCrystals ?? [];

    for (const tower of towers) {
      // Tower body — use sprite asset
      if (!this.mobaTowerGraphics.has(tower.id)) {
        const texKey = tower.team === 'blue' ? 'scene_TowerBlue' : 'scene_TowerRed';
        const img = this.add.image(tower.x, tower.y, texKey).setDepth(3).setDisplaySize(90, 130);
        this.mobaTowerGraphics.set(tower.id, img);
        this.mobaTowerHpBars.set(tower.id, this.add.graphics().setDepth(3.5));
      }

      const tg = this.mobaTowerGraphics.get(tower.id)!;
      const hb = this.mobaTowerHpBars.get(tower.id)!;

      if (!tower.alive) {
        tg.setVisible(false);
        hb.clear();
        continue;
      }

      // HP bar + attack range circle
      hb.clear();
      const pct = tower.hp / tower.maxHp;
      const W = 50, H = 6;
      const bx = tower.x - W / 2;
      const by = tower.y - 32;
      hb.fillStyle(0x333333, 0.8);
      hb.fillRect(bx, by, W, H);
      const r = Math.round((1 - pct) * 255);
      const gr = Math.round(pct * 255);
      hb.fillStyle(Phaser.Display.Color.GetColor(r, gr, 0), 1);
      hb.fillRect(bx, by, Math.round(W * pct), H);
      // Attack range circle (subtle, team-colored)
      const rangeColor = tower.team === 'blue' ? 0x4488ff : 0xff4444;
      const towerRange = snap.gameMode === 'aram' ? ARAM_TOWER_ATTACK_RANGE : MOBA_TOWER_ATTACK_RANGE;
      hb.lineStyle(1, rangeColor, 0.25);
      hb.strokeCircle(tower.x, tower.y, towerRange);
    }

    for (const crystal of crystals) {
      const key = crystal.team;
      if (!this.mobaCrystalGraphics.has(key)) {
        const color = crystal.team === 'blue' ? 0x44aaff : 0xff4444;
        const cg = this.add.graphics().setDepth(1);
        // Octagon crystal shape
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 8) + i * (Math.PI / 4);
          pts.push({ x: Math.cos(a) * 30, y: Math.sin(a) * 30 });
        }
        cg.fillStyle(color, 0.9);
        cg.fillPoints(pts, true);
        cg.lineStyle(3, 0xffffff, 0.9);
        cg.strokePoints(pts, true);
        cg.setPosition(crystal.x, crystal.y);
        this.mobaCrystalGraphics.set(key, cg);
        this.mobaCrystalHpBars.set(key, this.add.graphics().setDepth(1.5));
      }

      const cg = this.mobaCrystalGraphics.get(key)!;
      const hb = this.mobaCrystalHpBars.get(key)!;

      if (!crystal.alive) {
        cg.setVisible(false);
        hb.clear();
        continue;
      }

      // Pulse when low HP
      const pct = crystal.hp / crystal.maxHp;
      cg.setAlpha(pct < 0.3 ? 0.6 + 0.4 * Math.sin(Date.now() / 120) : 1);

      // HP bar
      hb.clear();
      const W = 80, H = 10;
      const bx = crystal.x - W / 2;
      const by = crystal.y - 50;
      hb.fillStyle(0x333333, 0.8);
      hb.fillRect(bx, by, W, H);
      const r = Math.round((1 - pct) * 255);
      const gr = Math.round(pct * 255);
      hb.fillStyle(Phaser.Display.Color.GetColor(r, gr, 0), 1);
      hb.fillRect(bx, by, Math.round(W * pct), H);
      hb.lineStyle(1, 0xffffff, 0.6);
      hb.strokeRect(bx, by, W, H);
    }
  }

  makePlayerContainer(p: PlayerState) {
    const container = this.add.container(p.x, p.y).setDepth(10);
    const charScale = (PLAYER_SPRITE_SCALE[p.character] ?? 1.0) * SPRITE_SHRINK;
    const initFrame = `${p.character}_${p.facing}`;
    const body = this.add.sprite(0, 0, this.atlasFor(initFrame), initFrame).setName('body').setScale(charScale);
    body.setTint(hueToTint(p.hue ?? 0));
    // Aura Shield ring (visible when player has the aura_shield weapon)
    const aura = this.add.graphics().setName('aura').setVisible(false).setDepth(-1);
    // Frost Aura ring — subtle, low-opacity icy ring shown whenever the player
    // has any frost-aura damage. Plain (non-ADD) blend so it stays muted under
    // the brighter Time Shield / pacifist shield bubbles.
    const frostAura = this.add.graphics().setName('frostAura').setVisible(false).setDepth(-1);
    // Time Shield ring (visible only while damageImmuneUntil is in the future).
    // Drawn above aura so it's visible even with both effects active. ADD blend
    // mode makes the cyan layers glow brightly on top of any background.
    const timeShield = this.add
      .graphics()
      .setName('timeShield')
      .setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);
    // Invulnerability shield bubble (separate sprite — only when invulnerable)
    const shield = this.add
      .sprite(0, 0, 'shield')
      .setName('shield')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false)
      .setScale(1.05);
    const name = this.add
      .text(0, -52, p.name, {
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setName('name');
    const hp = this.add.graphics().setName('hp');
    drawHpBar(hp, 1, 0xff6666, -38);
    // aura ring at the bottom layer, then frost aura, time shield, body, UI
    container.add([aura, frostAura, timeShield, shield, body, hp, name]);
    return container;
  }
}

// Reused scratch so the per-entity, per-frame lerp doesn't allocate a fresh object
// (~14k allocs/s at 144fps × ~100 entities → periodic GC pauses). Safe because every
// caller reads .x/.y immediately and never stores the returned reference.
const _lerpOut = { x: 0, y: 0 };
function lerpEntity<T extends { x: number; y: number }>(
  prev: T | undefined,
  cur: T,
  t: number,
): { x: number; y: number } {
  if (!prev) { _lerpOut.x = cur.x; _lerpOut.y = cur.y; return _lerpOut; }
  _lerpOut.x = prev.x + (cur.x - prev.x) * t;
  _lerpOut.y = prev.y + (cur.y - prev.y) * t;
  return _lerpOut;
}

function drawHpBar(g: Phaser.GameObjects.Graphics, frac: number, color: number, yOffset = 14) {
  g.clear();
  const w = 38, h = 5;
  g.fillStyle(0x000000, 0.65);
  g.fillRect(-w / 2 - 1, yOffset - 1, w + 2, h + 2);
  g.fillStyle(color, 1);
  g.fillRect(-w / 2, yOffset, w * Math.max(0, Math.min(1, frac)), h);
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createGame(parent: HTMLElement, init: SceneInit) {
  const scene = new ArenaScene(init);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0a0a14',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    physics: { default: 'arcade' },
    scene,
  });
  return { game, scene };
}
