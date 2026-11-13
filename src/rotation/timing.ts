// Rotation timing: how long the opener, each loop and each turn take.
//
// After a run, the app replays a few fights with gcsim's sample() using the "timing" config, which
// prints a marker ("kc o2" = opener turn 2, "kc l3" = loop turn 3) before every turn. A turn lasts
// from its marker to the next marker, so any waiting for a cooldown or energy counts toward the turn
// that waits, and the turns of a loop add up to the loop length. gcsim prints a marker as soon as
// it starts working on that turn (it can do so slightly before the previous animation ends).
// Only complete loops are measured: the last loop of a fight is usually cut off by the time limit.

import type { Turn } from './notation';

export const FPS = 60;

export type Marker = { frame: number; msg: string };
export type Replay = { markers: Marker[]; endFrame: number };
/** Seconds. */
export type Span = { mean: number; min: number; max: number };

export type TurnTiming = {
  section: Turn['section'];
  index: number;
  text: string;
  /** Time per turn, over every time it was measured (including times it was skipped, as 0 s). */
  time?: Span;
  /** How many times the turn was measured, and how many of those it was skipped (took no time). */
  measured: number;
  skipped: number;
};

export type RotationTiming = {
  replays: number;
  opener?: Span;
  loop?: Span;
  /** Average number of loops that fit in the fight after the opener (fractional). */
  loopsPerFight?: number;
  turns: TurnTiming[];
};

const MARKER = /^kc ([ol])(\d+)$/;

function span(values: number[]): Span | undefined {
  if (!values.length) return undefined;
  const sec = values.map((v) => v / FPS);
  return { mean: sec.reduce((a, b) => a + b, 0) / sec.length, min: Math.min(...sec), max: Math.max(...sec) };
}

export function measureTiming(replays: Replay[], turns: Turn[]): RotationTiming {
  const turnFrames = new Map<string, number[]>();
  const openerFrames: number[] = [];
  const loopFrames: number[] = [];
  const loopsPerFight: number[] = [];

  for (const { markers: all, endFrame } of replays) {
    const markers = all.filter((m) => MARKER.test(m.msg));
    const loopStarts = markers.map((m, i) => (m.msg === 'kc l1' ? i : -1)).filter((i) => i >= 0);
    if (!loopStarts.length) continue;
    // Opener: from the first marker to the first loop start.
    if (loopStarts[0] > 0) openerFrames.push(markers[loopStarts[0]].frame - markers[0].frame);
    for (let i = 0; i < loopStarts[0]; i++) {
      const key = markers[i].msg;
      turnFrames.set(key, [...(turnFrames.get(key) ?? []), markers[i + 1].frame - markers[i].frame]);
    }
    // Complete loops only: from one loop start to the next.
    const lengths: number[] = [];
    for (let l = 0; l + 1 < loopStarts.length; l++) {
      const [from, to] = [loopStarts[l], loopStarts[l + 1]];
      lengths.push(markers[to].frame - markers[from].frame);
      for (let i = from; i < to; i++) {
        const key = markers[i].msg;
        turnFrames.set(key, [...(turnFrames.get(key) ?? []), markers[i + 1].frame - markers[i].frame]);
      }
    }
    loopFrames.push(...lengths);
    if (lengths.length) {
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      loopsPerFight.push((endFrame - markers[loopStarts[0]].frame) / avg);
    }
  }

  return {
    replays: replays.length,
    opener: span(openerFrames),
    loop: span(loopFrames),
    loopsPerFight: loopsPerFight.length ? loopsPerFight.reduce((a, b) => a + b, 0) / loopsPerFight.length : undefined,
    turns: turns
      .filter((t) => t.statements)
      .map((t) => {
        const frames = turnFrames.get(`kc ${t.section === 'opener' ? 'o' : 'l'}${t.index}`) ?? [];
        return { section: t.section, index: t.index, text: t.text, time: span(frames), measured: frames.length, skipped: frames.filter((f) => f === 0).length };
      }),
  };
}
