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
