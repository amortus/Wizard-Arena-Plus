// Round-trip verification for the binary snapshot codec.
// Run: npm run test:codec
// (= node --experimental-strip-types --loader ./tools/ts-loader.mjs shared/snapshot-codec.test.mts)
import { encodeSnapshot, decodeSnapshot, isBinarySnapshot } from './snapshot-codec.ts';

let failures = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (!cond) { failures++; console.error('  ✗ ' + name, extra ?? ''); }
}

// approx-equal for f32 round-trip precision loss
const close = (a: number, b: number, eps = 1e-2) => Math.abs(a - b) <= eps + Math.abs(b) * 1e-4;

// A representative snapshot exercising every section + edge values.
const snap: any = {
  type: 'snapshot',
  t: 1748000000123,
  wave: 31,
  waveName: 'Feral Elite',
  waveTimeLeftMs: 45000,
  arenaElement: 'lava',
  gameMode: 'moba',
  players: [{
    id: 'conn_abc123', name: 'Tëste 🔥', character: 'shadow_wizard',
    color: 0xff8800, hue: 1.25, country: 'BR',
    x: -1234, y: 3199, hp: 87, maxHp: 120, level: 14, xp: 250, xpToNext: 1283,
    alive: true, facing: 'west',
    damageMul: 1.35, speedMul: 1.1, pickupMul: 2.0, cooldownMul: 0.85,
    weapons: ['fireball', 'orbital_spark', 'shadow_bolt'],
    waveNumber: 26, waveName: 'Wave 26', waveTimeLeftMs: 12000,
    invulnerableUntil: 1748000005000, damageImmuneUntil: 0,
    timeShieldEnabled: true, lightningStrikeEnabled: false, meteorShowerEnabled: true,
    frostNovaEnabled: false, holySmiteEnabled: false, blackHoleEnabled: true,
    phoenixRebirthEnabled: true, phoenixUsed: false, chainReactionEnabled: true,
    missileBarrageEnabled: false, earthquakeEnabled: true, spiritWolvesEnabled: true,
    spiritWolfCount: 3, bloodbathEnabled: false, soulHarvestEnabled: true,
    soulHarvestStacks: 12, trailOfFireEnabled: true, timeStopEnabled: false,
    auraShieldRangeMul: 1.5, trailDurationMul: 2.0, frostNovaRadiusMul: 1.0,
    lightningCooldownMul: 0.7, projectileBonus: 4, bigHitMul: 1.8,
    splashRadius: 60.5, vampireFraction: 0.15, regenPerSec: 3.25,
    critChance: 0.22, pierceCount: 2, frostAuraDmg: 8.5, frostAuraRadius: 90,
    xpMul: 1.4, projectileLifeMul: 1.2, bossKills: 5, pendingLevelUps: 1,
    speedBoostUntil: 1748000003000, damageBoostUntil: 0, berserkerUntil: 0,
    mobaTeam: 'red', mobaGold: 1500, mobaRespawnAt: 0,
    mobaItems: ['boots', 'staff'], collectedPowerups: ['fireball', 'fireball', 'meteor'],
  }, {
    // second player with minimal/undefined optionals
    id: 'conn_def', name: 'P2', character: 'blue_wizard',
    color: 0x4488ff, hue: 0, x: 100, y: 200, hp: 100, maxHp: 100, level: 1,
    xp: 0, xpToNext: 21, alive: false, facing: 'south',
    damageMul: 1, speedMul: 1, pickupMul: 1, cooldownMul: 1, weapons: ['sword'],
    waveNumber: 1, waveName: 'Wave 1', waveTimeLeftMs: 30000,
    invulnerableUntil: 0, damageImmuneUntil: 0,
    timeShieldEnabled: false, lightningStrikeEnabled: false, meteorShowerEnabled: false,
    frostNovaEnabled: false, holySmiteEnabled: false, blackHoleEnabled: false,
    phoenixRebirthEnabled: false, phoenixUsed: false, chainReactionEnabled: false,
    missileBarrageEnabled: false, earthquakeEnabled: false, spiritWolvesEnabled: false,
    spiritWolfCount: 0, bloodbathEnabled: false, soulHarvestEnabled: false,
    soulHarvestStacks: 0, trailOfFireEnabled: false, timeStopEnabled: false,
    auraShieldRangeMul: 1, trailDurationMul: 1, frostNovaRadiusMul: 1,
    lightningCooldownMul: 1, projectileBonus: 0, bigHitMul: 1, splashRadius: 0,
    vampireFraction: 0, regenPerSec: 0, critChance: 0, pierceCount: 0,
    frostAuraDmg: 0, frostAuraRadius: 0, xpMul: 1, projectileLifeMul: 1,
    bossKills: 0, pendingLevelUps: 0, speedBoostUntil: 0, damageBoostUntil: 0, berserkerUntil: 0,
  }],
  npcs: [
    { id: 'npc_14011', kind: 'death_titan', x: 1835, y: 2203, hp: 70000 }, // boss > u16 range
    { id: 'npc_5', kind: 'skeleton', x: 0, y: 0, hp: 12, ownerPlayerId: 'blue' },
  ],
  gems: [
    { id: 'gem_1', x: 500, y: 600, value: 3, bornAt: 1748000000000 },
    { id: 'gem_2', x: -10, y: 3100, value: 10, bornAt: 1748000000000 },
  ],
  projectiles: [
    { id: 'proj_9', ownerId: 'conn_abc123', x: 700, y: 800, vx: 12.3, vy: -4.5, weapon: 'shadow_bolt' },
  ],
  newProjs: [
    { id: 'proj_10', ownerId: 'conn_abc123', x: 10, y: 20, vx: 1.5, vy: 2.5, weapon: 'orbital_spark',
      lifetime: 3.5, pattern: 'orbital', orbitRadius: 40, orbitAngle: 1.1, orbitSpinSpeed: 2.2 },
    { id: 'proj_11', ownerId: 'conn_def', x: 0, y: 0, vx: 5, vy: 0, weapon: 'sword', lifetime: 1.0, pattern: 'straight' },
  ],
  deadProjs: ['proj_1', 'proj_2', 'proj_3'],
  wolves: [{ id: 'wolf_1', ownerId: 'conn_abc123', x: 120, y: 130, state: 'lunge' }],
  hazards: [{ id: 'hz_1', kind: 'beam_diag_ne', x: 400, y: 400, radius: 80, warningUntilMs: 1748000001000, activeUntilMs: 1748000004000, angle: 0.785 }],
  pickups: [{ id: 'pk_1', kind: 'berserker', x: 900, y: 950 }],
  bossProjectiles: [{ id: 'bp_1', x: 1000, y: 1100, vx: -3.2, vy: 8.8, radius: 24, generation: 2 }],
  towers: [{ id: 'tw_1', team: 'blue', lane: 2, tier: 1, hp: 3000, maxHp: 5000, x: 300, y: 300, alive: true }],
  mobaCrystals: [{ team: 'red', hp: 8000, maxHp: 10000, x: 3100, y: 3100, alive: true }],
  activeBossId: 'npc_14011',
  bossHp: 4200, bossMaxHp: 9000,
  roomWave: 31,
};

const buf = encodeSnapshot(snap);
console.log(`encoded size: ${buf.byteLength} bytes (vs JSON ${JSON.stringify(snap).length})`);
check('isBinarySnapshot', isBinarySnapshot(buf));
const d = decodeSnapshot(buf);

// scalars
check('t', d.t === snap.t);
check('wave', d.wave === 31);
check('waveName', d.waveName === 'Feral Elite');
check('waveTimeLeftMs', d.waveTimeLeftMs === 45000);
check('arenaElement', d.arenaElement === 'lava');
check('gameMode', d.gameMode === 'moba');
check('roomWave', d.roomWave === 31);
check('activeBossId', d.activeBossId === 'npc_14011');
check('bossHp', d.bossHp === 4200);
check('bossMaxHp', d.bossMaxHp === 9000);

// player 1 — full
const p = d.players[0] as any;
const o = snap.players[0];
check('p.id', p.id === o.id, p.id);
check('p.name(utf8)', p.name === o.name, p.name);
check('p.character', p.character === 'shadow_wizard');
check('p.color', p.color === 0xff8800, p.color);
check('p.hue', close(p.hue, 1.25));
check('p.country', p.country === 'BR');
check('p.x(i16 neg)', p.x === -1234, p.x);
check('p.y', p.y === 3199);
check('p.alive', p.alive === true);
check('p.facing', p.facing === 'west');
check('p.weapons', JSON.stringify(p.weapons) === JSON.stringify(o.weapons), p.weapons);
check('p.invulnerableUntil(f64)', p.invulnerableUntil === o.invulnerableUntil, p.invulnerableUntil);
check('p.timeShieldEnabled', p.timeShieldEnabled === true);
check('p.lightningStrikeEnabled', p.lightningStrikeEnabled === false);
check('p.spiritWolfCount', p.spiritWolfCount === 3);
check('p.critChance', close(p.critChance, 0.22));
check('p.splashRadius', close(p.splashRadius, 60.5));
check('p.mobaTeam', p.mobaTeam === 'red');
check('p.mobaGold', p.mobaGold === 1500);
check('p.mobaItems', JSON.stringify(p.mobaItems) === JSON.stringify(['boots', 'staff']));
check('p.collectedPowerups', JSON.stringify(p.collectedPowerups) === JSON.stringify(o.collectedPowerups));

// player 2 — undefined optionals must stay undefined
const p2 = d.players[1] as any;
check('p2.mobaTeam undef', p2.mobaTeam === undefined, p2.mobaTeam);
check('p2.mobaItems undef', p2.mobaItems === undefined, p2.mobaItems);
check('p2.country undef', p2.country === undefined, p2.country);
check('p2.alive false', p2.alive === false);

// npcs
check('npc count', d.npcs.length === 2);
check('npc0 kind', (d.npcs[0] as any).kind === 'death_titan');
check('npc0 boss hp(u32)', (d.npcs[0] as any).hp === 70000, (d.npcs[0] as any).hp);
check('npc0 owner undef', (d.npcs[0] as any).ownerPlayerId === undefined);
check('npc1 owner', (d.npcs[1] as any).ownerPlayerId === 'blue');

// gems — bornAt stripped to 0
check('gem count', d.gems.length === 2);
check('gem0 value', (d.gems[0] as any).value === 3);
check('gem0 x neg-ok', (d.gems[1] as any).x === -10);
check('gem bornAt=0', (d.gems[0] as any).bornAt === 0);

// projectiles / newProjs optionals
check('proj weapon', (d.projectiles[0] as any).weapon === 'shadow_bolt');
check('newProj orbital fields', close((d.newProjs![0] as any).orbitRadius, 40) && close((d.newProjs![0] as any).orbitAngle, 1.1));
check('newProj straight no-orbit', (d.newProjs![1] as any).orbitRadius === undefined && (d.newProjs![1] as any).pattern === 'straight');

// other sections
check('deadProjs', JSON.stringify(d.deadProjs) === JSON.stringify(['proj_1', 'proj_2', 'proj_3']));
check('wolves state', (d.wolves![0] as any).state === 'lunge');
check('hazard kind+angle', (d.hazards![0] as any).kind === 'beam_diag_ne' && close((d.hazards![0] as any).angle, 0.785));
check('hazard activeUntil f64', (d.hazards![0] as any).activeUntilMs === 1748000004000);
check('pickup kind', (d.pickups![0] as any).kind === 'berserker');
check('bossProj generation', (d.bossProjectiles![0] as any).generation === 2);
check('tower', (d.towers![0] as any).team === 'blue' && (d.towers![0] as any).hp === 3000 && (d.towers![0] as any).alive === true);
check('crystal', (d.mobaCrystals![0] as any).team === 'red' && (d.mobaCrystals![0] as any).maxHp === 10000);

// minimal snapshot (no optional sections)
const tiny: any = { type: 'snapshot', t: 1, wave: 0, waveName: '', waveTimeLeftMs: 0,
  arenaElement: 'normal', gameMode: 'arena', players: [], npcs: [], gems: [], projectiles: [] };
const td = decodeSnapshot(encodeSnapshot(tiny));
check('tiny players empty', td.players.length === 0);
check('tiny no newProjs', td.newProjs === undefined);
check('tiny no towers', td.towers === undefined);
check('tiny no boss', td.activeBossId === undefined);

if (failures === 0) console.log('\n✅ ALL ROUND-TRIP CHECKS PASSED');
else { console.error(`\n❌ ${failures} checks FAILED`); process.exit(1); }
