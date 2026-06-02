// Binary codec for the high-frequency `snapshot` message.
//
// WHY: snapshots are broadcast ~20Hz and were sent as raw JSON. Measured live at
// ~23KB avg / 32KB peak per snapshot (gems 56%, npcs 30%, players 9%). JSON.parse
// of that on the client main thread 20×/s caused GC churn and frame stalls
// ("travamento"). This codec packs the same data into a compact ArrayBuffer:
// coords as Int16, hp/levels as Uint16/32, flags as bytes, strings length-prefixed.
//
// SAFETY: encode and decode are driven by a SINGLE shared field schema per entity
// type (see *_FIELDS below). Both walk the same list in the same order, so they
// physically cannot drift out of sync. decode reconstructs the EXACT same Snapshot
// object shape the client already consumes — interpolation, AOI and rendering are
// untouched. Non-snapshot messages (welcome, leaderboard, effect, …) stay JSON.
//
// Versioned: byte 0 is SNAPSHOT_PROTOCOL_VERSION. If a client receives a version it
// doesn't know, it should fall back / reconnect. Bump on any wire-format change.

import { CHARACTERS } from './constants';
import { MONSTERS } from './constants';
import type { Snapshot } from './types';

export const SNAPSHOT_PROTOCOL_VERSION = 4;
// First byte of every binary snapshot frame. Lets the client distinguish a binary
// snapshot from a (string) JSON message and reject unknown versions.
export const SNAPSHOT_MAGIC = 0xa1;

// ---- Enum tables (index <-> string). Append-only: never reorder, only add. ----
const FACINGS = ['south', 'north', 'east', 'west'] as const;
// Append-only — never reorder. Client rebuilds vsWeaponLevels using these indices.
const WEAPONS = [
  'sword', 'orb', 'dagger', 'fireball', 'lightning_bolt', 'shadow_bolt', 'orbital_spark', 'aura_shield',
  // Wizard Survivor evolved weapons (added at the end)
  'holy_bolt', 'storm_daggers', 'death_vortex', 'hellfire',
  'soul_drain', 'thunder_storm', 'arcane_nova', 'eternal_orbit',
] as const;
const PATTERNS = ['straight', 'wave', 'homing', 'orbital'] as const;
const WOLF_STATES = ['orbit', 'lunge', 'cooldown'] as const;
const HAZARD_KINDS = ['fire_pool', 'lightning_strike', 'poison_cloud', 'slow_zone', 'smoke_zone', 'beam_h', 'beam_v', 'beam_diag', 'beam_diag_ne'] as const;
const PICKUP_KINDS = ['health', 'speed', 'damage', 'shield', 'cooldown', 'berserker', 'annihilate'] as const;
const ARENA_ELEMENTS = ['normal', 'lava', 'ice', 'fog'] as const;
const GAME_MODES = ['arena', 'castle', 'moba', 'aram', 'wizard_survivor'] as const;
const TEAMS = ['blue', 'red'] as const;
// Append-only — never reorder.
const EFFECT_KINDS = [
  'lightning', 'meteor', 'frostNova', 'holySmite', 'blackHole',
  'chainExplosion', 'phoenixRevive', 'earthquake', 'timeStop',
  'castleDestroyed', 'towerShot', 'towerDestroyed', 'crystalDestroyed',
] as const;

// ---- Field type descriptors ----
// Primitive widths plus: 'str', {enum}, {arr}, {opt}. A schema is an ordered list
// of [key, type]. The SAME schema drives encode and decode.
type Prim = 'u8' | 'u16' | 'i16' | 'u32' | 'f32' | 'f64' | 'bool' | 'str';
type FieldType =
  | Prim
  | { enum: readonly string[] }
  | { arr: FieldType }
  | { opt: FieldType };
type Field = [key: string, type: FieldType];

// ---- ByteWriter: auto-growing little-endian buffer ----
class ByteWriter {
  private buf = new ArrayBuffer(1024);
  private view = new DataView(this.buf);
  private bytes = new Uint8Array(this.buf);
  off = 0;
  private ensure(n: number) {
    if (this.off + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength;
    while (cap < this.off + n) cap *= 2;
    const nb = new ArrayBuffer(cap);
    new Uint8Array(nb).set(this.bytes);
    this.buf = nb;
    this.view = new DataView(nb);
    this.bytes = new Uint8Array(nb);
  }
  u8(v: number) { this.ensure(1); this.view.setUint8(this.off, v & 0xff); this.off += 1; }
  u16(v: number) { this.ensure(2); this.view.setUint16(this.off, v & 0xffff, true); this.off += 2; }
  i16(v: number) { this.ensure(2); this.view.setInt16(this.off, Math.max(-32768, Math.min(32767, Math.round(v))), true); this.off += 2; }
  u32(v: number) { this.ensure(4); this.view.setUint32(this.off, v >>> 0, true); this.off += 4; }
  f32(v: number) { this.ensure(4); this.view.setFloat32(this.off, v, true); this.off += 4; }
  f64(v: number) { this.ensure(8); this.view.setFloat64(this.off, v, true); this.off += 8; }
  bool(v: boolean) { this.u8(v ? 1 : 0); }
  str(s: string) {
    // UTF-8, u16 length-prefixed. Game ids/names are short.
    const enc = STR_ENCODER.encode(s ?? '');
    this.u16(enc.length);
    this.ensure(enc.length);
    this.bytes.set(enc, this.off);
    this.off += enc.length;
  }
  finish(): ArrayBuffer { return this.buf.slice(0, this.off); }
}

class ByteReader {
  private view: DataView;
  private bytes: Uint8Array;
  off = 0;
  constructor(buf: ArrayBuffer) { this.view = new DataView(buf); this.bytes = new Uint8Array(buf); }
  u8() { const v = this.view.getUint8(this.off); this.off += 1; return v; }
  u16() { const v = this.view.getUint16(this.off, true); this.off += 2; return v; }
  i16() { const v = this.view.getInt16(this.off, true); this.off += 2; return v; }
  u32() { const v = this.view.getUint32(this.off, true); this.off += 4; return v; }
  f32() { const v = this.view.getFloat32(this.off, true); this.off += 4; return v; }
  f64() { const v = this.view.getFloat64(this.off, true); this.off += 8; return v; }
  bool() { return this.u8() === 1; }
  str() { const len = this.u16(); const s = STR_DECODER.decode(this.bytes.subarray(this.off, this.off + len)); this.off += len; return s; }
}

const STR_ENCODER = new TextEncoder();
const STR_DECODER = new TextDecoder();

// ---- Generic field encode/decode driven by a FieldType descriptor ----
function writeField(w: ByteWriter, type: FieldType, val: any) {
  if (typeof type === 'string') {
    switch (type) {
      case 'u8': return w.u8(val | 0);
      case 'u16': return w.u16(val | 0);
      case 'i16': return w.i16(val);
      case 'u32': return w.u32(val >>> 0);
      case 'f32': return w.f32(+val || 0);
      case 'f64': return w.f64(+val || 0);
      case 'bool': return w.bool(!!val);
      case 'str': return w.str(val == null ? '' : String(val));
    }
  } else if ('enum' in type) {
    const idx = type.enum.indexOf(val);
    w.u8(idx < 0 ? 255 : idx); // 255 = unknown/undefined
  } else if ('arr' in type) {
    const a: any[] = Array.isArray(val) ? val : [];
    w.u16(a.length);
    for (const item of a) writeField(w, type.arr, item);
  } else if ('opt' in type) {
    const present = val !== undefined && val !== null;
    w.bool(present);
    if (present) writeField(w, type.opt, val);
  }
}
function readField(r: ByteReader, type: FieldType): any {
  if (typeof type === 'string') {
    switch (type) {
      case 'u8': return r.u8();
      case 'u16': return r.u16();
      case 'i16': return r.i16();
      case 'u32': return r.u32();
      case 'f32': return r.f32();
      case 'f64': return r.f64();
      case 'bool': return r.bool();
      case 'str': return r.str();
    }
  } else if ('enum' in type) {
    const idx = r.u8();
    return idx === 255 ? undefined : type.enum[idx];
  } else if ('arr' in type) {
    const n = r.u16();
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = readField(r, type.arr);
    return out;
  } else if ('opt' in type) {
    return r.bool() ? readField(r, type.opt) : undefined;
  }
}

function writeStruct(w: ByteWriter, schema: Field[], obj: any) {
  for (const [key, type] of schema) writeField(w, type, obj?.[key]);
}
function readStruct(r: ByteReader, schema: Field[]): any {
  const out: any = {};
  for (const [key, type] of schema) {
    const v = readField(r, type);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function writeArray(w: ByteWriter, schema: Field[], arr: any[] | undefined) {
  const a = arr ?? [];
  w.u16(a.length);
  for (const item of a) writeStruct(w, schema, item);
}
function readArray(r: ByteReader, schema: Field[]): any[] {
  const n = r.u16();
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = readStruct(r, schema);
  return out;
}

// ---- Entity schemas. Order MUST match broadcastSnapshot's object literals. ----

// Player: exact field order of the players.push({...}) in broadcastSnapshot.
const PLAYER_FIELDS: Field[] = [
  ['id', 'str'], ['name', 'str'], ['character', { enum: CHARACTERS }],
  ['color', 'u32'], ['hue', 'f32'], ['country', { opt: 'str' }],
  ['x', 'i16'], ['y', 'i16'], ['hp', 'u16'], ['maxHp', 'u16'],
  ['level', 'u16'], ['xp', 'u32'], ['xpToNext', 'u32'], ['alive', 'bool'],
  ['facing', { enum: FACINGS }],
  ['damageMul', 'f32'], ['speedMul', 'f32'], ['pickupMul', 'f32'], ['cooldownMul', 'f32'],
  ['weapons', { arr: { enum: WEAPONS } }],
  ['waveNumber', 'u16'], ['waveName', 'str'], ['waveTimeLeftMs', 'u32'],
  ['invulnerableUntil', 'f64'], ['damageImmuneUntil', 'f64'],
  ['timeShieldEnabled', 'bool'], ['lightningStrikeEnabled', 'bool'], ['meteorShowerEnabled', 'bool'],
  ['frostNovaEnabled', 'bool'], ['holySmiteEnabled', 'bool'], ['blackHoleEnabled', 'bool'],
  ['phoenixRebirthEnabled', 'bool'], ['phoenixUsed', 'bool'], ['chainReactionEnabled', 'bool'],
  ['missileBarrageEnabled', 'bool'], ['earthquakeEnabled', 'bool'], ['spiritWolvesEnabled', 'bool'],
  ['spiritWolfCount', 'u8'], ['bloodbathEnabled', 'bool'], ['soulHarvestEnabled', 'bool'],
  ['soulHarvestStacks', 'u16'], ['trailOfFireEnabled', 'bool'], ['timeStopEnabled', 'bool'],
  ['auraShieldRangeMul', 'f32'], ['trailDurationMul', 'f32'], ['frostNovaRadiusMul', 'f32'],
  ['lightningCooldownMul', 'f32'], ['projectileBonus', 'u8'], ['bigHitMul', 'f32'],
  ['splashRadius', 'f32'], ['vampireFraction', 'f32'], ['regenPerSec', 'f32'],
  ['critChance', 'f32'], ['pierceCount', 'u8'], ['frostAuraDmg', 'f32'], ['frostAuraRadius', 'f32'],
  ['xpMul', 'f32'], ['projectileLifeMul', 'f32'], ['bossKills', 'u16'], ['pendingLevelUps', 'u8'],
  ['speedBoostUntil', 'f64'], ['damageBoostUntil', 'f64'], ['berserkerUntil', 'f64'],
  ['mobaTeam', { opt: { enum: TEAMS } }], ['mobaGold', { opt: 'u32' }], ['mobaRespawnAt', { opt: 'f64' }],
  ['mobaItems', { opt: { arr: 'str' } }], ['collectedPowerups', { opt: { arr: 'str' } }],
  // Wizard Survivor fields (undefined / absent in other modes)
  ['vsWeaponLevels',   { opt: { arr: 'u8'  } }],
  ['vsPassiveIds',     { opt: { arr: 'str' } }],
  ['vsPassiveLvls',    { opt: { arr: 'u8'  } }],
  ['vsGold',           { opt: 'u32'           }],
  ['vsTimeRemainingMs',{ opt: 'u32'           }],
  ['vsWon',            { opt: 'bool'          }],
];

const NPC_FIELDS: Field[] = [
  // hp is u32: late-game bosses (death_titan etc) exceed the u16 range (65535).
  ['id', 'str'], ['kind', { enum: MONSTERS }], ['x', 'i16'], ['y', 'i16'], ['hp', 'u32'],
  ['ownerPlayerId', { opt: 'str' }],
  ['vx', 'f32'], ['vy', 'f32'],
];

// GemState on the wire drops `bornAt` (server-only; client never reads it).
const GEM_FIELDS: Field[] = [
  ['id', 'str'], ['x', 'i16'], ['y', 'i16'], ['value', 'u16'],
];

const PROJ_FIELDS: Field[] = [
  ['id', 'str'], ['ownerId', 'str'], ['x', 'i16'], ['y', 'i16'], ['vx', 'f32'], ['vy', 'f32'],
  ['weapon', { enum: WEAPONS }],
];

const NEWPROJ_FIELDS: Field[] = [
  ['id', 'str'], ['ownerId', 'str'], ['x', 'i16'], ['y', 'i16'], ['vx', 'f32'], ['vy', 'f32'],
  ['weapon', { enum: WEAPONS }], ['lifetime', 'f32'], ['pattern', { enum: PATTERNS }],
  ['perpX', { opt: 'f32' }], ['perpY', { opt: 'f32' }],
  ['orbitRadius', { opt: 'f32' }], ['orbitAngle', { opt: 'f32' }], ['orbitSpinSpeed', { opt: 'f32' }],
];

const WOLF_FIELDS: Field[] = [
  ['id', 'str'], ['ownerId', 'str'], ['x', 'i16'], ['y', 'i16'], ['state', { enum: WOLF_STATES }],
];

const HAZARD_FIELDS: Field[] = [
  ['id', 'str'], ['kind', { enum: HAZARD_KINDS }], ['x', 'i16'], ['y', 'i16'], ['radius', 'u16'],
  ['warningUntilMs', 'f64'], ['activeUntilMs', 'f64'], ['angle', { opt: 'f32' }],
];

const PICKUP_FIELDS: Field[] = [
  ['id', 'str'], ['kind', { enum: PICKUP_KINDS }], ['x', 'i16'], ['y', 'i16'],
];

const BOSSPROJ_FIELDS: Field[] = [
  ['id', 'str'], ['x', 'i16'], ['y', 'i16'], ['vx', 'f32'], ['vy', 'f32'], ['radius', 'u16'], ['generation', 'u8'],
];

const EFFECT_FIELDS: Field[] = [
  ['kind', { enum: EFFECT_KINDS as unknown as readonly string[] }],
  ['x', 'i16'], ['y', 'i16'],
  ['tx', { opt: 'i16' }], ['ty', { opt: 'i16' }],
  ['team', { opt: { enum: TEAMS } }],
  ['radius', { opt: 'f32' }],
  ['durationMs', { opt: 'u32' }],
];

const CHEST_FIELDS: Field[] = [
  ['id', 'str'], ['x', 'i16'], ['y', 'i16'], ['spawnedAt', 'f64'],
];

const TOWER_FIELDS: Field[] = [
  ['id', 'str'], ['team', { enum: TEAMS }], ['lane', 'u8'], ['tier', 'u8'],
  ['hp', 'u32'], ['maxHp', 'u32'], ['x', 'i16'], ['y', 'i16'], ['alive', 'bool'],
];

const CRYSTAL_FIELDS: Field[] = [
  ['team', { enum: TEAMS }], ['hp', 'u32'], ['maxHp', 'u32'], ['x', 'i16'], ['y', 'i16'], ['alive', 'bool'],
];

// Top-level optional-section presence bitmask bits.
const F_NEWPROJS = 1 << 0;
const F_DEADPROJS = 1 << 1;
const F_WOLVES = 1 << 2;
const F_HAZARDS = 1 << 3;
const F_PICKUPS = 1 << 4;
const F_BOSSPROJ = 1 << 5;
const F_CASTLE = 1 << 6;
const F_MOBA = 1 << 7; // towers + crystals + roomWave
const F_BOSS = 1 << 8; // activeBossId + bossHp + bossMaxHp
const F_ROOMWAVE = 1 << 9;
const F_VSCHESTS = 1 << 10; // Wizard Survivor chests
const F_EFFECTS = 1 << 11;  // batched effect events

export function encodeSnapshot(snap: Snapshot): ArrayBuffer {
  const w = new ByteWriter();
  w.u8(SNAPSHOT_MAGIC);
  w.u8(SNAPSHOT_PROTOCOL_VERSION);
  w.f64(snap.t);
  w.u16(snap.wave | 0);
  w.str(snap.waveName ?? '');
  w.u32(snap.waveTimeLeftMs | 0);
  w.u8(Math.max(0, ARENA_ELEMENTS.indexOf((snap.arenaElement ?? 'normal') as any)));
  w.u8(Math.max(0, GAME_MODES.indexOf((snap.gameMode ?? 'arena') as any)));

  // presence flags
  let flags = 0;
  if (snap.newProjs?.length) flags |= F_NEWPROJS;
  if (snap.deadProjs?.length) flags |= F_DEADPROJS;
  if (snap.wolves?.length) flags |= F_WOLVES;
  if (snap.hazards?.length) flags |= F_HAZARDS;
  if (snap.pickups?.length) flags |= F_PICKUPS;
  if (snap.bossProjectiles?.length) flags |= F_BOSSPROJ;
  if (snap.castle) flags |= F_CASTLE;
  if (snap.towers || snap.mobaCrystals) flags |= F_MOBA;
  if (snap.activeBossId) flags |= F_BOSS;
  if (snap.roomWave !== undefined) flags |= F_ROOMWAVE;
  if (snap.vsChests?.length) flags |= F_VSCHESTS;
  if (snap.effects?.length) flags |= F_EFFECTS;
  w.u16(flags);

  // core arrays (always present)
  writeArray(w, PLAYER_FIELDS, snap.players);
  writeArray(w, NPC_FIELDS, snap.npcs);
  writeArray(w, GEM_FIELDS, snap.gems);
  writeArray(w, PROJ_FIELDS, snap.projectiles);

  // optional sections
  if (flags & F_NEWPROJS) writeArray(w, NEWPROJ_FIELDS, snap.newProjs as any);
  if (flags & F_DEADPROJS) { w.u16(snap.deadProjs!.length); for (const id of snap.deadProjs!) w.str(id); }
  if (flags & F_WOLVES) writeArray(w, WOLF_FIELDS, snap.wolves);
  if (flags & F_HAZARDS) writeArray(w, HAZARD_FIELDS, snap.hazards);
  if (flags & F_PICKUPS) writeArray(w, PICKUP_FIELDS, snap.pickups);
  if (flags & F_BOSSPROJ) writeArray(w, BOSSPROJ_FIELDS, snap.bossProjectiles);
  if (flags & F_CASTLE) { const c = snap.castle!; w.u32(c.hp); w.u32(c.maxHp); w.i16(c.x); w.i16(c.y); }
  if (flags & F_MOBA) {
    writeArray(w, TOWER_FIELDS, snap.towers);
    writeArray(w, CRYSTAL_FIELDS, snap.mobaCrystals as any);
  }
  if (flags & F_BOSS) {
    w.str(snap.activeBossId!);
    w.bool(snap.bossHp !== undefined); if (snap.bossHp !== undefined) w.f32(snap.bossHp);
    w.bool(snap.bossMaxHp !== undefined); if (snap.bossMaxHp !== undefined) w.f32(snap.bossMaxHp);
  }
  if (flags & F_ROOMWAVE) w.u16(snap.roomWave!);
  if (flags & F_VSCHESTS) writeArray(w, CHEST_FIELDS, snap.vsChests);
  if (flags & F_EFFECTS) writeArray(w, EFFECT_FIELDS, snap.effects);

  return w.finish();
}

/** Returns true if a binary frame is a snapshot we can decode. */
export function isBinarySnapshot(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 2) return false;
  const v = new DataView(buf);
  return v.getUint8(0) === SNAPSHOT_MAGIC && v.getUint8(1) === SNAPSHOT_PROTOCOL_VERSION;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const r = new ByteReader(buf);
  const magic = r.u8();
  const version = r.u8();
  if (magic !== SNAPSHOT_MAGIC) throw new Error('not a binary snapshot');
  if (version !== SNAPSHOT_PROTOCOL_VERSION) throw new Error(`snapshot version ${version} unsupported`);

  const snap: any = { type: 'snapshot' };
  snap.t = r.f64();
  snap.wave = r.u16();
  snap.waveName = r.str();
  snap.waveTimeLeftMs = r.u32();
  snap.arenaElement = ARENA_ELEMENTS[r.u8()];
  snap.gameMode = GAME_MODES[r.u8()];

  const flags = r.u16();

  snap.players = readArray(r, PLAYER_FIELDS);
  snap.npcs = readArray(r, NPC_FIELDS);
  snap.gems = readArray(r, GEM_FIELDS);
  for (const g of snap.gems) g.bornAt = 0; // wire-stripped; client never reads it
  snap.projectiles = readArray(r, PROJ_FIELDS);

  if (flags & F_NEWPROJS) snap.newProjs = readArray(r, NEWPROJ_FIELDS);
  if (flags & F_DEADPROJS) { const n = r.u16(); const a = new Array(n); for (let i = 0; i < n; i++) a[i] = r.str(); snap.deadProjs = a; }
  if (flags & F_WOLVES) snap.wolves = readArray(r, WOLF_FIELDS);
  if (flags & F_HAZARDS) snap.hazards = readArray(r, HAZARD_FIELDS);
  if (flags & F_PICKUPS) snap.pickups = readArray(r, PICKUP_FIELDS);
  if (flags & F_BOSSPROJ) snap.bossProjectiles = readArray(r, BOSSPROJ_FIELDS);
  if (flags & F_CASTLE) snap.castle = { hp: r.u32(), maxHp: r.u32(), x: r.i16(), y: r.i16() };
  if (flags & F_MOBA) {
    snap.towers = readArray(r, TOWER_FIELDS);
    snap.mobaCrystals = readArray(r, CRYSTAL_FIELDS);
  }
  if (flags & F_BOSS) {
    snap.activeBossId = r.str();
    if (r.bool()) snap.bossHp = r.f32();
    if (r.bool()) snap.bossMaxHp = r.f32();
  }
  if (flags & F_ROOMWAVE) snap.roomWave = r.u16();
  if (flags & F_VSCHESTS) snap.vsChests = readArray(r, CHEST_FIELDS);
  if (flags & F_EFFECTS) snap.effects = readArray(r, EFFECT_FIELDS);

  return snap as Snapshot;
}
