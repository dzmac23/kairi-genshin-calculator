import { describe, expect, it } from 'vitest';
import { modernizeRotation } from './modernize';

const team = ['Raiden Shogun', 'Bennett', 'Xiangling', 'Xingqiu'];

describe('converting rotations from the older notation', () => {
  it('turns @1/2 and @2/2 into Rotations A and B', () => {
    const r = modernizeRotation({ opener: '', loop: 'Raiden E > Bennett Q@1/2 E > Xiangling Q E > Xingqiu Q@2/2 E > Raiden Q N3C' }, team);
    expect(r).toEqual({
      opener: '',
      loop: 'Raiden E > Bennett Q E > Xiangling Q E > Xingqiu E > Raiden Q N3C',
      alternates: ['Raiden E > Bennett E > Xiangling Q E > Xingqiu Q E > Raiden Q N3C'],
    });
  });

  it('drops a turn with nothing left in that rotation, and keeps "?" choices', () => {
    const r = modernizeRotation({ opener: '', loop: 'Bennett Q?@1/2|E > Xingqiu Q@2/2\nRaiden Q' }, team);
    expect(r.loop).toBe('Bennett Q?/E\nRaiden Q');
    expect(r.alternates).toEqual(['Bennett E > Xingqiu Q\nRaiden Q']);
  });

  it('moves the loops before @2+ into the Start of fight', () => {
    const r = modernizeRotation({ opener: 'Bennett Q', loop: 'Raiden E > Xingqiu Q@2+ E' }, team);
    expect(r).toEqual({ opener: 'Bennett Q\nRaiden E > Xingqiu E', loop: 'Raiden E > Xingqiu Q E' });
  });

  it('converts | to /, L and M to Fill, and hold frames to seconds, levels or the full hold', () => {
    const r = modernizeRotation(
      { opener: '', loop: 'Kinich E L E > Mualani E M N > Bennett hE(2) > Nahida hE(90) > Skirk hE(184) > Furina Q?|E' },
      ['Kinich', 'Mualani', 'Bennett', 'Nahida', 'Skirk', 'Furina'],
    );
    expect(r.loop).toBe('Kinich E Fill E > Mualani E Fill N > Bennett fE > Nahida hE(1.5s) > Skirk fE > Furina Q?/E');
  });

  it('leaves a rotation in the current notation exactly as typed', () => {
    const typed = { opener: '', loop: 'Raiden  E >  Bennett Q/E\n\nXingqiu Q' };
    expect(modernizeRotation(typed, team)).toBe(typed);
  });
});
