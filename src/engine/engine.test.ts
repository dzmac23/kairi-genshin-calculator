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
});
