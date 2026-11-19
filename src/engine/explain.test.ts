import { describe, expect, it } from 'vitest';
import { explainGcsimError } from './explain';

describe('explaining gcsim errors', () => {
  it("explains gcsim's own messages in plain English, with the fix", () => {
    expect(explainGcsimError('error encountered on raidenshogun executing charge: raidenshogun: need to use attack right before charge')).toMatch(/write N1C/);
    expect(explainGcsimError('error encountered on kinich executing skill: kinich: Cannot use Scalespiker Cannon with 9 Nightsoul points, should be 20')).toMatch(/E L E/);
    expect(explainGcsimError('skirk: cannot use skill in seven-phase flash')).toMatch(/Seven-Phase Flash/);
    expect(explainGcsimError('kaedeharakazuha: cannot low_plunge after skill')).toMatch(/write P, not lP/);
    expect(explainGcsimError('xiangling: action high_plunge not implemented')).toMatch(/doesn't have this move/);
  });
  it('says nothing for messages it has no explanation for', () => {
    expect(explainGcsimError('something completely different')).toBeUndefined();
  });
});
