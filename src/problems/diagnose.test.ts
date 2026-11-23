import { beforeAll, describe, expect, it } from 'vitest';
import { teamMembers } from '../config/build';
import { DEFAULT_SETTINGS } from '../config/settings';
import { loadGameData, type GameData } from '../data/gameData';
import { DEFAULT_TOKEN_TABLE, parseTokenTable } from '../rotation/tokens';
import { placeholderTeam } from '../team/placeholderTeam.testutil';
import { burstsIfReady, diagnoseRun, withLessEr, withoutBurstEnergy, type Runner } from './diagnose';

let data: GameData;
beforeAll(async () => {
  data = await loadGameData();
});
const table = parseTokenTable(DEFAULT_TOKEN_TABLE);
const rotation = { opener: 'Furina Q', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q/E > Neuvillette C tE q C2' };

describe('the automatic check of a partly failing run', () => {
  it("writes one character's plain bursts as Q?, leaving conditional ones and other characters alone", () => {
    const members = teamMembers(placeholderTeam(data), data);
    expect(burstsIfReady(rotation, 'Neuvillette', members, table)).toEqual({ ...rotation, loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q/E > Neuvillette C tE Q? C2' });
    expect(burstsIfReady(rotation, 'Furina', members, table)).toEqual({ opener: 'Furina Q?', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q? > Xilonen E N5 Q/E > Neuvillette C tE q C2' });
    expect(withoutBurstEnergy('options iteration=1 duration=90 swap_delay=12;\nactive x;')).toBe('options iteration=1 duration=90 swap_delay=12 ignore_burst_energy=true;\nactive x;');
  });

  // A fake engine. "common": the rotation fails in 10 of every 60 fights; "rare": it never fails
  // unless the check lowers everyone's ER. Bursts that ignore energy, or the cause's bursts written
  // as Q?, always work.
  const fake = (cause?: string, how: 'common' | 'rare' | 'not energy' = 'common'): Runner => async (config, fights, countAll) => {
    const ok = { tried: fights, failures: 0 };
    const fail = { tried: countAll ? fights : 2, failures: countAll ? 10 : 1, failure: 'boom' };
    if (config.includes('ignore_burst_energy=true')) return how === 'not energy' ? fail : ok;
    if (cause && config.includes(`if .${cause}.burst.ready`)) return ok;
    const stressed = !config.includes('er=0.1102'); // the placeholder Neuvillette's ER, lowered by the check
    return how === 'rare' && !stressed ? ok : fail;
  };
  const input = () => ({ team: placeholderTeam(data), data, rotation, table, settings: DEFAULT_SETTINGS });

  it('finds whose burst is late in a common failure, and says how to fix it', async () => {
    const steps: string[] = [];
    const d = await diagnoseRun(input(), fake('furina'), (done, total) => steps.push(`${done}/${total}`));
    expect(d).toMatchObject({ energy: true, fixes: ['Furina'] });
    expect(d.verdict).toMatch(/^Writing Furina's burst as Q\? \(only if ready\) made all 60 test fights work/);
    // As written, without burst energy, then Neuvillette and Furina (Kazuha never bursts; Xilonen's Q/E is already conditional).
    expect(steps).toEqual(['0/4', '1/4', '2/4', '3/4', '4/4']);
  });

  it("studies a rare failure with less ER, because there any change would seem to fix it", async () => {
    const d = await diagnoseRun({ ...input(), after: { done: 612, total: 1000 } }, fake('furina', 'rare'));
    expect(d).toMatchObject({ energy: true, fixes: ['Furina'] });
    expect(d.verdict).toMatch(/^This failure is rare: in 60 test fights it didn't happen at all \(your run had it once in 613 fights\)\. .*with 20% less Energy Recharge for everyone, it failed in 10 of 60 fights.*In that harder test, writing Furina's burst as Q\?/);
    expect((await diagnoseRun(input(), async (_c, f) => ({ tried: f, failures: 0 }))).verdict).toMatch(/^This failure is very rare/);
  });

  it('lowers everyone\'s ER in a config', () => {
    expect(withLessEr('a add stats hp=1 er=0.4 cr=0.1;\nb add stats er=0.1;', 0.3)).toBe('a add stats hp=1 er=0.100 cr=0.1;\nb add stats er=-0.200;');
  });

  it('says when it is about energy but no single burst fixes it, or not about energy at all', async () => {
    expect(await diagnoseRun(input(), fake('nobody'))).toMatchObject({ energy: true, fixes: [] });
    expect((await diagnoseRun(input(), fake(undefined, 'not energy'))).verdict).toMatch(/^It isn't about energy/);
  });
});
