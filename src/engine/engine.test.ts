// Runs app-built configs through the real gcsim engine (public/gcsim, built by scripts/build-gcsim.sh
// locally or downloaded by GitHub Actions before the tests). Skipped if the engine isn't there.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildConfig } from '../config/build';
import { DEFAULT_SETTINGS } from '../config/settings';
import { loadGameData, type GameData } from '../data/gameData';
import { DEFAULT_TOKEN_TABLE, parseTokenTable } from '../rotation/tokens';
import { measureTiming } from '../rotation/timing';
import { energyTargets, standInRotation, type EnergyFight } from '../energy/energy';
import { placeholderTeam } from '../team/placeholderTeam.testutil';
import { getBaseline, snapshotConfig, solveArtifacts, statsFromSnapshot } from '../team/baseline';
import { interpolateStats } from '../team/level';
import { type Slot } from '../team/model';

const engineDir = resolve('public/gcsim');
const hasEngine = existsSync(`${engineDir}/main.wasm`);
const table = parseTokenTable(DEFAULT_TOKEN_TABLE);

let data: GameData;
const error = (out: string) => (out.startsWith('{"error"') ? JSON.parse(out).error : undefined);

// The real engine is slow next to ordinary tests (it simulates whole fights), and GitHub's machines
// vary in speed, so these tests get a generous time limit instead of Vitest's default 5 seconds.
const ENGINE_TIMEOUT = 60_000;

describe.skipIf(!hasEngine)('app-built configs in the real gcsim engine', { timeout: ENGINE_TIMEOUT }, () => {
  beforeAll(async () => {
    data = await loadGameData();
    await import(pathToFileURL(`${engineDir}/wasm_exec.js`).href);
    const go = new (globalThis as unknown as { Go: new () => Go }).Go();
    const { instance } = await WebAssembly.instantiate(readFileSync(`${engineDir}/main.wasm`), go.importObject);
    void go.run(instance);
  }, ENGINE_TIMEOUT);

  // Opener, ? (if ready), @ (which loops), | (otherwise), a "!" line and W (walk), all at once.
  const rotation = {
    opener: 'Neuvillette tE > Kazuha hE P', // after hold E Kazuha is high up, so it's a high plunge (P)
    loop: [
      'Furina tE D Q?',
      'Xilonen E N3 Q?@1/2|N2',
      '! if .neuvillette.energy < 70 { neuvillette attack; }',
      // Not "Kazuha tE? P": when the skill is skipped, the plunge would fail (he isn't airborne).
      'Kazuha tE P > Neuvillette C Q@2+ C2 W',
    ].join('\n'),
  };

  it('accepts the config and the timing config', () => {
    const built = buildConfig(placeholderTeam(data), data, rotation, table, DEFAULT_SETTINGS, 50);
    expect(built.problems).toEqual([]);
    expect(error(validateConfig(built.config!))).toBeUndefined();
    expect(error(validateConfig(built.timingConfig!))).toBeUndefined();
  });

  it('measures rotation timing from replays', () => {
    const built = buildConfig(placeholderTeam(data), data, rotation, table, DEFAULT_SETTINGS, 50);
    const replays = ['1', '2', '3'].map((seed) => {
      const logs: { frame: number; msg: string }[] = JSON.parse(sample(built.timingConfig!, seed)).logs;
      return { markers: logs.filter((l) => /^kc [ol]\d+$/.test(l.msg)), endFrame: 90 * 60 };
    });
    const timing = measureTiming(replays, built.translation.turns);
    expect(timing.opener!.mean).toBeGreaterThan(0);
    expect(timing.loop!.mean).toBeGreaterThan(1);
    expect(timing.loopsPerFight!).toBeGreaterThan(1);
    // Turns of a loop add up to the loop length.
    const loopTurns = timing.turns.filter((t) => t.section === 'loop');
    const sum = loopTurns.reduce((a, t) => a + t.time!.mean, 0);
    expect(sum).toBeCloseTo(timing.loop!.mean, 1);
  });

  it('reproduces the placeholder test team result from the Team screen and the plan rotation', () => {
    const plan = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
    const built = buildConfig(placeholderTeam(data), data, plan, table, DEFAULT_SETTINGS, 100);
    expect(error(initializeAggregator(built.config!))).toBeUndefined();
    expect(initializeWorker(built.config!)).toBeNull();
    for (let i = 0; i < 100; i++) aggregate(simulate() as Uint8Array);
    const dps = JSON.parse((flush() as { result: string }).result).statistics.dps.mean;
    expect(Math.abs(dps - 35126) / 35126).toBeLessThan(0.1);
  });

  // Characters added by patches/ (unmerged gcsim pull requests). Only when this engine includes them.
  const enginePatches: string[] = existsSync(`${engineDir}/version.json`) ? (JSON.parse(readFileSync(`${engineDir}/version.json`, 'utf8')).patches ?? []) : [];
  it.skipIf(!enginePatches.includes('linnea'))('simulates Linnea from patches/linnea.patch, marked incomplete by gcsim', () => {
    const team = placeholderTeam(data);
    const bow = data.weapons.find((w) => w.gcsim_key === 'favoniuswarbow')!;
    team[1] = { ...team[1], character: 'Linnea', weapon: bow.name, sets: { mode: 'none' } };
    const loop = { opener: '', loop: 'Neuvillette tE > Linnea E Q N3 > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
    const built = buildConfig(team, data, loop, table, DEFAULT_SETTINGS, 20);
    expect(built.problems).toEqual([]);
    expect(built.config).toContain('linnea char lvl=');
    expect(error(initializeAggregator(built.config!))).toBeUndefined();
    expect(initializeWorker(built.config!)).toBeNull();
    for (let i = 0; i < 20; i++) aggregate(simulate() as Uint8Array);
    const result = JSON.parse((flush() as { result: string }).result);
    const linnea = result.character_details.findIndex((c: { name: string }) => c.name === 'linnea');
    expect(linnea).toBeGreaterThanOrEqual(0);
    expect(result.statistics.character_dps[linnea].mean).toBeGreaterThan(0);
    expect(result.incomplete_characters).toContain('linnea');
  });

  it.skipIf(!enginePatches.includes('linnea'))("leaves Linnea's party buff (EM from 5% of her DEF) out of her character-screen totals", async () => {
    // The game's character screen doesn't show it: a player's Linnea in Aubade of Morningstar and
    // Moon shows DEF 2,272 and Elemental Mastery 122 = 80 (2-piece bonus) + 42 from artifacts.
    const slot: Slot = {
      ...placeholderTeam(data)[1],
      character: 'Linnea',
      weapon: data.weapons.find((w) => w.gcsim_key === 'favoniuswarbow')!.name,
      sets: { mode: '4pc', set: data.sets.find((x) => x.gcsim_key === 'aubadeofmorningstarandmoon')!.name },
    };
    const engine = async (config: string): Promise<number[]> => JSON.parse(sample(config, '1')).character_details[0].snapshot;
    const baseline = await getBaseline({ ...slot, statMode: 'totals' }, data, engine);
    expect(baseline.stats.em).toBe(80);
    const typed: Slot = { ...slot, statMode: 'totals', totals: { ...baseline.stats, def: 2272, em: 122 } };
    const solved = await solveArtifacts(typed, data, baseline, engine);
    expect(solved.solved!.artifacts.em).toBeCloseTo(42, 0);
  });

  it.skipIf(!enginePatches.includes('nefer'))('simulates Nefer from patches/nefer.patch in a Lunar-Bloom team, marked incomplete', () => {
    const team = placeholderTeam(data);
    const catalyst = (key: string) => data.weapons.find((w) => w.gcsim_key === key)!.name;
    team[0] = { ...team[0], character: 'Nefer', weapon: catalyst('sacrificialfragments'), sets: { mode: 'none' }, artifacts: { em: 300, cr: 50, cd: 100 } };
    team[3] = { ...team[3], character: 'Lauma', weapon: catalyst('favoniuscodex'), sets: { mode: 'none' }, artifacts: { em: 400, er: 30 } };
    const loop = { opener: '', loop: 'Lauma E Q > Furina tE d Q > Kazuha tE P > Nefer E Q C C' };
    const built = buildConfig(team, data, loop, table, DEFAULT_SETTINGS, 20);
    expect(built.problems).toEqual([]);
    expect(built.config).toContain('nefer char lvl=');
    expect(error(initializeAggregator(built.config!))).toBeUndefined();
    expect(initializeWorker(built.config!)).toBeNull();
    for (let i = 0; i < 20; i++) aggregate(simulate() as Uint8Array);
    const result = JSON.parse((flush() as { result: string }).result);
    const nefer = result.character_details.findIndex((c: { name: string }) => c.name === 'nefer');
    expect(result.statistics.character_dps[nefer].mean).toBeGreaterThan(0);
    expect(result.incomplete_characters).toContain('nefer');
  });

  it.skipIf(!enginePatches.includes('nefer'))('gives a clear gcsim error, not a crash, if Nefer plunges (her plunge was removed)', () => {
    const team = placeholderTeam(data);
    team[0] = { ...team[0], character: 'Nefer', weapon: data.weapons.find((w) => w.gcsim_key === 'sacrificialfragments')!.name, sets: { mode: 'none' } };
    const built = buildConfig(team, data, { opener: '', loop: 'Nefer J P > Furina tE' }, table, DEFAULT_SETTINGS, 5);
    expect(built.problems).toEqual([]);
    const out = JSON.parse(sample(built.config!, '1'));
    expect(JSON.stringify(out)).toMatch(/not implemented/);
  });

  it.skipIf(!enginePatches.includes('vodyanitsa'))('simulates Vodyanitsa from patches/vodyanitsa.patch in a Stellar Swirl team, marked incomplete', () => {
    const team = placeholderTeam(data);
    const weapon = (key: string) => data.weapons.find((w) => w.gcsim_key === key)!.name;
    team[0] = { ...team[0], character: 'Vodyanitsa', weapon: weapon('prototypeamber'), sets: { mode: 'none' }, artifacts: { 'hp%': 100, cr: 50, cd: 100, er: 30 } };
    team[2] = { ...team[2], character: 'Sandrone', weapon: weapon('wolfsgravestone'), sets: { mode: 'none' }, artifacts: { 'atk%': 50, cr: 60, cd: 120 } };
    const loop = { opener: '', loop: 'Sandrone E N2 > Kazuha tE P > Vodyanitsa E Q N3 > Xilonen E N5 Q' };
    const built = buildConfig(team, data, loop, table, DEFAULT_SETTINGS, 20);
    expect(built.problems).toEqual([]);
    expect(built.config).toContain('vodyanitsa char lvl=');
    expect(error(initializeAggregator(built.config!))).toBeUndefined();
    expect(initializeWorker(built.config!)).toBeNull();
    for (let i = 0; i < 20; i++) aggregate(simulate() as Uint8Array);
    const result = JSON.parse((flush() as { result: string }).result);
    const vody = result.character_details.findIndex((c: { name: string }) => c.name === 'vodyanitsa');
    expect(result.statistics.character_dps[vody].mean).toBeGreaterThan(0);
    expect(result.incomplete_characters).toContain('vodyanitsa');
  });

  it.skipIf(!enginePatches.includes('starsealed'))('simulates Starsealed Edict from patches/starsealed.patch', () => {
    const plan = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
    const run = (weapon: string) => {
      const team = placeholderTeam(data);
      team[0] = { ...team[0], weapon };
      const built = buildConfig(team, data, plan, table, DEFAULT_SETTINGS, 1);
      expect(built.problems).toEqual([]);
      const out = JSON.parse(sample(built.config!, '1'));
      expect(out.error).toBeUndefined();
      return out.character_details[0].snapshot as number[];
    };
    // Sacrificial Jade has a CRIT Rate substat and no CRIT DMG passive. Starsealed Edict has a CRIT DMG
    // substat and a passive "Increases CRIT DMG by 24%" at refinement 1. So Neuvillette's CRIT DMG
    // (snapshot index 10) with the Edict is his CRIT DMG with Jade + the level-90 substat + 24%,
    // both taken from the game data (data/weapons.json).
    const edict = data.weapon.get('Starsealed Edict')!;
    const substat = edict.stats.find((x) => x.level === '90')!.substat_value!;
    const passiveR1 = parseFloat(edict.refinement_values![0][0]) / 100;
    const withEdict = run(edict.name);
    const withJade = run(placeholderTeam(data)[0].weapon!);
    expect(withEdict[10] - withJade[10]).toBeCloseTo(substat + passiveR1, 4);
  });

  it.skipIf(!enginePatches.includes('hymn'))('simulates Hymn of the Maelstrom from patches/hymn.patch', () => {
    const snapshot = (weapon: string) => {
      const team = placeholderTeam(data);
      team[0] = { ...team[0], weapon };
      const plan = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
      const built = buildConfig(team, data, plan, table, DEFAULT_SETTINGS, 1);
      expect(built.problems).toEqual([]);
      const out = JSON.parse(sample(built.config!, '1'));
      expect(out.error).toBeUndefined();
      return out.character_details[0].snapshot as number[];
    };
    // At the start of a fight (no healing yet) Hymn gives its HP% substat and "Increases Healing
    // Bonus by 4%" at R1, and nothing else: Sacrificial Jade has a CRIT Rate substat instead.
    const hymn = data.weapon.get('Hymn of the Maelstrom')!;
    const substat = hymn.stats.find((x) => x.level === '90')!.substat_value!;
    const [withHymn, withJade] = [snapshot(hymn.name), snapshot(placeholderTeam(data)[0].weapon!)];
    expect(withHymn[11] - withJade[11]).toBeCloseTo(parseFloat(hymn.refinement_values![0][0]) / 100, 4); // Healing Bonus
    // The snapshot folds percentages into totals (index 3 = Max HP): the HP% substat adds base HP × substat.
    const baseHp = data.character.get('Neuvillette')!.stats.find((x) => x.level === '90')!.base_hp;
    expect(withHymn[3] - withJade[3]).toBeCloseTo(baseHp * substat, -1); // within ~5 HP

    // A healer wearing it: Kokomi's skill heals, which stacks the HP and ATK buffs.
    const team = placeholderTeam(data);
    team[0] = { ...team[0], character: 'Sangonomiya Kokomi', weapon: hymn.name };
    const built = buildConfig(team, data, { opener: '', loop: 'Kokomi E Q N3 > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q' }, table, DEFAULT_SETTINGS, 20);
    expect(built.problems).toEqual([]);
    expect(error(initializeAggregator(built.config!))).toBeUndefined();
    expect(initializeWorker(built.config!)).toBeNull();
    for (let i = 0; i < 20; i++) aggregate(simulate() as Uint8Array);
    const result = JSON.parse((flush() as { result: string }).result);
    expect(result.statistics.character_dps[0].mean).toBeGreaterThan(0);
  });

  it("runs Mavuika's Finisher (F) at the end of her bike Charged Attacks", () => {
    const team = placeholderTeam(data);
    const weapon = (key: string) => data.weapons.find((w) => w.gcsim_key === key)!.name;
    team[0] = { ...team[0], character: 'Mavuika', weapon: weapon('wolfsgravestone'), sets: { mode: 'none' } };
    // Also with dash cancels (D between Charged Attacks), and a plain dash kept on purpose.
    for (const combo of ['C3 F', 'C D C D C F', 'C D(charge_cancel=0) C F']) {
      const built = buildConfig(team, data, { opener: '', loop: `Mavuika hE ${combo} > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q` }, table, DEFAULT_SETTINGS, 1);
      expect(built.problems).toEqual([]);
      expect(built.checks).toEqual([]);
      const out = JSON.parse(sample(built.config!, '1'));
      expect(out.error, combo).toBeUndefined();
      const hits = out.logs.filter((l: { event: string }) => l.event === 'damage').map((l: { msg: string }) => l.msg);
      expect(hits, combo).toContain('Flamestrider Charged Attack (Final)');
    }
  });

  it('runs the special-character codes: Kinich E L E fires the cannon, Mualani E M N lands the Surging Bite', () => {
    const team = placeholderTeam(data);
    const weapon = (key: string) => data.weapons.find((w) => w.gcsim_key === key)!.name;
    team[0] = { ...team[0], character: 'Kinich', weapon: weapon('fangofthemountainking'), sets: { mode: 'none' } };
    team[2] = { ...team[2], character: 'Mualani', weapon: weapon('surfsup'), sets: { mode: 'none' } };
    const loop = { opener: '', loop: 'Kinich E L E > Kazuha tE P > Mualani E M N > Xilonen E N5 Q' };
    const built = buildConfig(team, data, loop, table, DEFAULT_SETTINGS, 1);
    expect(built.problems).toEqual([]);
    expect(built.checks).toEqual([]);
    const out = JSON.parse(sample(built.config!, '1'));
    expect(out.error).toBeUndefined();
    const hits = out.logs.filter((l: { event: string; msg: string }) => l.event === 'damage').map((l: { msg: string }) => l.msg);
    expect(hits).toContain('Scalespiker Cannon');
    expect(hits).toContain("Sharky's Surging Bite");
  });

  it('alternates Rotations A and B: Furina bursts only in Rotation A', () => {
    const plan = {
      opener: '',
      loop: 'Neuvillette tE > Kazuha tE P > Furina tE Q > Xilonen E N5 Q > Neuvillette C',
      alternates: ['Neuvillette tE > Kazuha tE P > Furina tE > Xilonen E N5 Q > Neuvillette C'],
    };
    const built = buildConfig(placeholderTeam(data), data, plan, table, DEFAULT_SETTINGS, 1);
    expect(built.problems).toEqual([]);
    expect(built.translation.rotations).toBe(2);
    const logs: { frame: number; msg: string }[] = JSON.parse(sample(built.timingConfig!, '1')).logs;
    const markers = logs.filter((l) => /^kc [ol]\d+$/.test(l.msg)).map((l) => l.msg);
    // A has turns 1-5 and B turns 6-10, played A, B, A, B…
    expect(markers.slice(0, 10)).toEqual(['kc l1', 'kc l2', 'kc l3', 'kc l4', 'kc l5', 'kc l6', 'kc l7', 'kc l8', 'kc l9', 'kc l10']);
    expect(markers[10]).toBe('kc l1');
    const timing = measureTiming([{ markers: logs.filter((l) => /^kc t?[ol]\d+$/.test(l.msg)), endFrame: 90 * 60 }], built.translation.turns);
    expect(timing.turns.map((t) => `${t.rotation}${t.position}`)).toEqual(['01', '02', '03', '04', '05', '11', '12', '13', '14', '15']);
  });

  it('tops up Kinich and Zibai before their special skill, so an exact count never stops the run', () => {
    const team = placeholderTeam(data);
    const weapon = (key: string) => data.weapons.find((w) => w.gcsim_key === key)!.name;
    team[0] = { ...team[0], character: 'Kinich', weapon: weapon('fangofthemountainking'), sets: { mode: 'none' } };
    team[2] = { ...team[2], character: 'Zibai', weapon: weapon('favoniussword'), sets: { mode: 'none' } };
    // N1 is far too few for a full bar: without the top-up gcsim would stop (Kinich) or stand still (Zibai).
    const plan = { opener: '', loop: 'Kinich E N1 E > Kazuha tE P > Zibai E N1 E > Xilonen E N5 Q' };
    const built = buildConfig(team, data, plan, table, DEFAULT_SETTINGS, 1);
    expect(built.problems).toEqual([]);
    expect(built.checks).toEqual([]);
    const out = JSON.parse(sample(built.timingConfig!, '1'));
    expect(out.error).toBeUndefined();
    const hits = out.logs.filter((l: { event: string }) => l.event === 'damage').map((l: { msg: string }) => l.msg);
    expect(hits).toContain('Scalespiker Cannon');
    expect(hits.some((h: string) => /Spirit Steed/i.test(h))).toBe(true);
    const markers = out.logs.filter((l: { msg: string }) => /^kc t?[ol]\d+$/.test(l.msg));
    const timing = measureTiming([{ markers, endFrame: 90 * 60 }], built.translation.turns);
    const [kinich, , zibai] = timing.turns;
    expect(kinich.topUp!.needed).toBeGreaterThan(0);
    expect(zibai.topUp!.needed).toBeGreaterThan(0);
  });

  it('runs hold words and hold times', () => {
    const team = placeholderTeam(data);
    const weapon = (key: string) => data.weapons.find((w) => w.gcsim_key === key)!.name;
    team[0] = { ...team[0], character: 'Nahida', weapon: weapon('athousandfloatingdreams'), sets: { mode: 'none' } };
    const plan = { opener: '', loop: 'Nahida hE(1.5s) N3 > Kazuha fE P > Furina tE Q > Xilonen E N5 Q > nahida fe q' };
    const built = buildConfig(team, data, plan, table, DEFAULT_SETTINGS, 1);
    expect(built.problems).toEqual([]);
    expect(built.config).toContain('nahida skill[hold=90]');
    expect(built.config).toContain('nahida skill[hold=300]');
    expect(JSON.parse(sample(built.config!, '1')).error).toBeUndefined();
  });

  it('works out ER targets from fights where bursts ignore energy, for a written and a stand-in rotation', () => {
    const fights = (plan: { opener: string; loop: string }) => {
      const built = buildConfig(placeholderTeam(data), data, plan, table, DEFAULT_SETTINGS, 1);
      expect(built.problems).toEqual([]);
      return Array.from({ length: 10 }, (_, i) => {
        const out = energyNeeded(built.config!, String(i + 1));
        expect(error(out)).toBeUndefined();
        return JSON.parse(out) as EnergyFight;
      });
    };
    const written = energyTargets(fights({ opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' }));
    expect(written.map((c) => c.status)).toEqual(['target', 'no-burst', 'target', 'target']); // Kazuha never bursts here
    for (const c of written) if (c.status === 'target') expect(c.needed.average).toBeGreaterThan(1), expect(c.needed.average).toBeLessThan(3);
    // Before a rotation is written: everyone E Q, 20 s per rotation.
    const rough = energyTargets(fights(standInRotation(['Neuvillette', 'Kazuha', 'Furina', 'Xilonen'])));
    expect(rough.map((c) => c.status)).toEqual(['target', 'target', 'target', 'target']);
    for (const c of rough) if (c.status === 'target') expect(c.interval).toBeGreaterThanOrEqual(19.9);
  });

  it('accepts any level, such as 81/90, with stats between 80/90 and 90/90', () => {
    const furina = placeholderTeam(data)[2];
    const hpAt = (level: string) => {
      const out = JSON.parse(sample(snapshotConfig({ ...furina, level }, data, false), '1'));
      expect(out.error).toBeUndefined();
      return out.character_details[0].snapshot[3] as number;
    };
    const [h80, h81, h90] = [hpAt('80+'), hpAt('81'), hpAt('90')];
    expect(h81).toBeGreaterThan(h80);
    expect(h81).toBeLessThan(h90);
    // The app's own estimate for the Team screen preview is within 0.5% of gcsim's exact curve.
    const est = interpolateStats(data.character.get('Furina')!.stats, '81', ['base_hp'])!.base_hp!;
    expect(Math.abs(est - h81) / h81).toBeLessThan(0.005);
  });

  it('gives the same stats from character totals as from the artifact stats they came from', async () => {
    const plan = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
    const engine = async (config: string): Promise<number[]> => {
      const out = JSON.parse(sample(config, '1'));
      expect(out.error).toBeUndefined();
      return out.character_details[0].snapshot;
    };
    const shown = async (slot: Slot) =>
      statsFromSnapshot(await engine(snapshotConfig({ ...slot, statMode: 'artifacts' }, data, true)), data.character.get(slot.character!)!.element);
    const original = placeholderTeam(data);
    // Each character's totals as the character screen would show them, then entered as totals.
    const fromTotals: Slot[] = [];
    for (const slot of original) {
      const typed: Slot = { ...slot, statMode: 'totals', totals: await shown(slot) };
      fromTotals.push({ ...typed, baseline: await solveArtifacts(typed, data, await getBaseline(typed, data, engine), engine) });
    }
    expect(buildConfig(fromTotals, data, plan, table, DEFAULT_SETTINGS, 100).problems).toEqual([]);
    // Kazuha's Xiphos' Moonlight turns Elemental Mastery into Energy Recharge: the artifacts' 22.04%
    // ER must come out as 22.04%, not with the weapon's extra ER from the artifacts' EM added.
    expect(fromTotals[1].baseline!.solved!.artifacts.er).toBeCloseTo(22.04, 0);
    // Viridescent's 2-piece Anemo bonus is not counted as artifact stats.
    expect(fromTotals[1].baseline!.solved!.artifacts['elem%']).toBeCloseTo(0, 1);
    // gcsim shows every character the same totals from the worked-out artifact stats.
    for (let i = 0; i < original.length; i++) {
      const fromArtifacts = await shown(original[i]);
      const solvedSlot: Slot = { ...fromTotals[i], statMode: 'artifacts', artifacts: { ...fromTotals[i].baseline!.solved!.artifacts } };
      expect(await shown(solvedSlot)).toEqual(fromArtifacts);
    }
  });

  it('runs until the enemy dies when it has HP, and stops at the time limit when it does not die', () => {
    const plan = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
    const run = (enemyHp: number, duration: number) => {
      const built = buildConfig(placeholderTeam(data), data, plan, table, { ...DEFAULT_SETTINGS, enemyHp, duration }, 20);
      expect(built.problems).toEqual([]);
      expect(error(initializeAggregator(built.config!))).toBeUndefined();
      expect(initializeWorker(built.config!)).toBeNull();
      for (let i = 0; i < 20; i++) aggregate(simulate() as Uint8Array);
      return JSON.parse((flush() as { result: string }).result);
    };
    // About 35,000 DPS against 2,000,000 HP: roughly a minute, well inside a 300 s limit.
    const killed = run(2_000_000, 300);
    expect(killed.mode).toBe(2);
    expect(killed.statistics.total_damage.min).toBeCloseTo(2_000_000, 0);
    expect(killed.statistics.duration.mean).toBeGreaterThan(40);
    expect(killed.statistics.duration.mean).toBeLessThan(90);
    // Far too much HP: every fight stops soon after the 30 s limit, with the enemy alive.
    const alive = run(100_000_000, 30);
    expect(alive.statistics.total_damage.max).toBeLessThan(100_000_000);
    expect(alive.statistics.duration.min).toBeGreaterThanOrEqual(30);
    expect(alive.statistics.duration.max).toBeLessThan(60);
  });

  it("uses an enemy's real resistances (including negative ones and 200%) and freeze resistance", () => {
    const plan = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
    const run = (enemy: string | null) => {
      const built = buildConfig(placeholderTeam(data), data, plan, table, { ...DEFAULT_SETTINGS, enemy }, 20);
      expect(built.problems).toEqual([]);
      expect(error(initializeAggregator(built.config!))).toBeUndefined();
      expect(initializeWorker(built.config!)).toBeNull();
      for (let i = 0; i < 20; i++) aggregate(simulate() as Uint8Array);
      return JSON.parse((flush() as { result: string }).result);
    };
    const dummy = run(null).statistics.dps.mean;
    // Childe: 70% Hydro and Electro resistance, 0% to the rest, can't be frozen. This team is mostly Hydro.
    const childe = run('childe');
    expect(childe.target_details[0].resist).toMatchObject({ hydro: 0.7, electro: 0.7, pyro: 0, physical: 0 });
    expect(childe.statistics.dps.mean).toBeLessThan(dummy * 0.8);
    // 200% to everything: far less damage again.
    expect(run('mystifyingmegachurl').statistics.dps.mean).toBeLessThan(childe.statistics.dps.mean * 0.5);
    // Negative resistances are passed on as they are (Hydro Cicin: -50% Physical).
    expect(run('hydrocicin').target_details[0].resist).toMatchObject({ physical: -0.5, hydro: 0.5 });
  });
});
