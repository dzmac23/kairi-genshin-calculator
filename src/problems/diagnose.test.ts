import { beforeAll, describe, expect, it } from 'vitest';
import { teamMembers } from '../config/build';
import { DEFAULT_SETTINGS } from '../config/settings';
import { loadGameData, type GameData } from '../data/gameData';
import { DEFAULT_TOKEN_TABLE, parseTokenTable } from '../rotation/tokens';
import { placeholderTeam } from '../team/placeholderTeam.testutil';
import { burstsIfReady, diagnoseRun, withoutBurstEnergy, type Runner } from './diagnose';

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

  // A fake engine: fails unless bursts ignore energy or the given character's bursts are "only if ready".
  const fake = (cause?: string): Runner => async (config) => {
    if (config.includes('ignore_burst_energy=true')) return cause === 'not energy' ? { tried: 3, failure: 'boom' } : { tried: 60 };
    if (cause && config.includes(`if .${cause}.burst.ready`)) return { tried: 60 };
    return { tried: 2, failure: 'boom' };
  };
  const input = () => ({ team: placeholderTeam(data), data, rotation, table, settings: DEFAULT_SETTINGS });

  it("finds whose burst is late, and says how to fix it", async () => {
    const steps: string[] = [];
    const d = await diagnoseRun(input(), fake('furina'), (done, total) => steps.push(`${done}/${total}`));
    expect(d).toMatchObject({ energy: true, fixes: ['Furina'] });
    expect(d.verdict).toMatch(/^Furina's burst isn't always ready in time.*written as Q\?.*all 60 test fights/);
    expect(steps).toEqual(['0/3', '1/3', '2/3', '3/3']); // energy test, then Neuvillette and Furina (Kazuha never bursts; Xilonen's Q/E is already conditional)
  });

  it('says when it is about energy but no single burst fixes it, or not about energy at all', async () => {
    expect(await diagnoseRun(input(), fake('nobody'))).toMatchObject({ energy: true, fixes: [] });
    expect((await diagnoseRun(input(), fake('not energy'))).verdict).toMatch(/^It isn't about energy/);
  });
});
