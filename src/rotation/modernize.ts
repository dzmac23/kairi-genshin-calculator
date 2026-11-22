// Converts rotations written in the older notation to the current one, so saved rotations, team
// files and backups read the new way:
//   Q?|E         -> Q?/E           ("|" is now "/")
//   Kinich E L E -> Kinich E Fill E (L and M are now Fill)
//   hE(60)       -> hE(1s)         (hold times in seconds; levels and the longest hold become fE)
//   Q@1/2, @2/2  -> Rotations A and B, which repeat in turn
//   Q@2+         -> the first loop moves into the Start of fight
// The translator still understands the older forms, so a rotation that can't be converted (or a
// past run's rotation, which stays as it was) keeps working.

import { rotationBoxes, type RotationText } from './notation';
import { normalise } from './tokens';

/** gcsim's hold limits, as in the shorthand table's fE lines: hold levels, or the longest hold in frames. */
const HOLDS: Record<string, { levels: true } | { full: number }> = {
  bennett: { levels: true },
  yunjin: { levels: true },
  sigewinne: { levels: true },
  nahida: { full: 300 },
  navia: { full: 241 },
  skirk: { full: 184 },
  charlotte: { full: 809 },
  chevreuse: { full: 301 },
  lynette: { full: 150 },
  lanyan: { full: 610 },
  jean: { full: 300 },
  kinich: { full: 301 },
  kirara: { full: 600 },
  sayu: { full: 600 },
};
const NEFER_FULL_SLITHER = 150;

/** The most rotations an older "@" rotation is expanded into (@1/2 and @1/3 together need 6). */
const MAX_ROTATIONS = 6;

/** Splits a team member's name off the front of a turn, using the team's names (any word of them). */
function splitName(words: string[], names: string[]): { who?: string; nameWords: number } {
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const said = normalise(words.slice(0, n).join(' '));
    for (const name of names) {
      const parts = name.split(/[\s()]+/).map(normalise).filter((w) => w.length >= 3);
      if (said === normalise(name) || (n === 1 && parts.includes(said))) return { who: normalise(name.split(' (')[0]), nameWords: n };
    }
  }
  return { nameWords: 1 };
}

const seconds = (frames: number) => `${Math.round((frames / 60) * 100) / 100}s`;

/** One move word in the current notation (everything except "@", which needs the loop number). */
function modernizeWord(word: string, who: string | undefined): string {
  let w = word.replace(/\|/g, '/');
  if (who === 'kinich') w = w.replace(/^L$/i, 'Fill');
  if (who === 'mualani') w = w.replace(/^M$/i, 'Fill');
  const hold = who ? HOLDS[who] : undefined;
  w = w.replace(/\b([hH][eE])\((\d+)\)/g, (all, _code: string, n: string) => {
    const v = Number(n);
    if (!hold) return all;
    if ('levels' in hold) return v >= 2 ? 'fE' : 'hE';
    if (v >= hold.full) return 'fE';
    return v <= 1 ? 'hE' : `hE(${seconds(v)})`;
  });
  if (who === 'nefer') {
    w = w.replace(/\b[cC]\(hold=(\d+)\)/g, (_, n: string) => (Number(n) >= NEFER_FULL_SLITHER ? 'fC' : Number(n) <= 1 ? 'hC' : `hC(${seconds(Number(n))})`));
  }
  return w;
}

type Line = { raw: string } | { turns: { words: string[]; who?: string; nameWords: number }[] };

function parseLines(text: string, names: string[]): Line[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith('!')
        ? { raw: line }
        : {
            turns: line
              .split('>')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((t) => {
                const words = t.split(/\s+/);
                return { words, ...splitName(words, names) };
              }),
          },
    );
}

/**
 * The words of a turn in loop `loop` (1, 2, …): "@" alternatives that don't apply in that loop are
 * dropped, and so is a move with nothing left. Undefined `loop` keeps every word (no "@" in it).
 */
function wordsFor(turn: { words: string[]; who?: string; nameWords: number }, loop?: number): string[] | undefined {
  const moves: string[] = [];
  for (const word of turn.words.slice(turn.nameWords)) {
    const w = modernizeWord(word, turn.who);
    if (loop === undefined || !w.includes('@')) {
      moves.push(w);
      continue;
    }
    // Alternatives: "Q?@1/2/E" after the "|" -> "/" change; "/" inside "@1/2" isn't a separator.
    const alts = w.replace(/@(\d+)\/(\d+)/g, '@$1#$2').split('/').map((a) => a.replace(/@(\d+)#(\d+)/g, '@$1/$2'));
    const kept: string[] = [];
    for (const alt of alts) {
      const marks = alt.match(/@\d+\/\d+|@\d+\+/g) ?? [];
      const applies = marks.every((m) => {
        const every = m.match(/^@(\d+)\/(\d+)$/);
        if (every) return ((loop - 1) % Number(every[2])) + 1 === Number(every[1]);
        return loop >= Number(m.slice(1, -1));
      });
      if (!applies) continue;
      const plain = alt.replace(/@\d+\/\d+|@\d+\+/g, '');
      kept.push(plain);
      // Without "?" this alternative always happens here, so later ones never would.
      if (!plain.includes('?')) break;
    }
    if (kept.length) moves.push(kept.join('/'));
  }
  return moves.length ? [...turn.words.slice(0, turn.nameWords), ...moves] : undefined;
}

function render(lines: Line[], loop?: number): string {
  return lines
    .map((l) => {
      if ('raw' in l) return l.raw;
      return l.turns
        .map((t) => wordsFor(t, loop))
        .filter((w): w is string[] => !!w)
        .map((w) => w.join(' '))
        .join(' > ');
    })
    .filter(Boolean)
    .join('\n');
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * The rotation in the current notation. `names` are the team's character names (to tell the name
 * from the moves). Returns the same object when nothing needed converting.
 */
export function modernizeRotation(rotation: RotationText, names: string[]): RotationText {
  const opener = parseLines(rotation.opener, names);
  const boxes = rotationBoxes(rotation).map((b) => parseLines(b, names));
  const all = [rotation.opener, ...rotationBoxes(rotation)].join('\n');

  // "@" only ever meant something with a single loop; convert it there.
  const loopText = rotation.loop;
  const cycles = [...loopText.matchAll(/@\d+\/(\d+)/g)].map((m) => Number(m[1]));
  const froms = [...loopText.matchAll(/@(\d+)\+/g)].map((m) => Number(m[1]));
  const period = cycles.reduce((p, n) => (p * n) / gcd(p, n), 1);
  const convertAt = (rotation.alternates ?? []).every((a) => !a.trim()) && (cycles.length > 0 || froms.length > 0) && period <= MAX_ROTATIONS;

  let result: RotationText;
  if (convertAt) {
    const start = Math.max(1, ...froms); // the first loop that is like every later one
    const firstLoops = Array.from({ length: start - 1 }, (_, i) => render(boxes[0], i + 1));
    const repeating = Array.from({ length: period }, (_, i) => render(boxes[0], start + i));
    result = {
      opener: [render(opener), ...firstLoops].filter(Boolean).join('\n'),
      loop: repeating[0],
      ...(repeating.length > 1 ? { alternates: repeating.slice(1) } : {}),
    };
  } else {
    result = {
      opener: render(opener),
      loop: render(boxes[0]),
      ...(rotation.alternates ? { alternates: boxes.slice(1).map((b) => render(b)) } : {}),
    };
  }
  // Keep the user's own layout (spacing, line breaks) when there was nothing to convert.
  return OLDER_FORMS.test(all) ? result : rotation;
}

/** Text that may be in the older notation: "|", "@", hold frames, Nefer's hold option, L or M. */
const OLDER_FORMS = /[|@]|\bhE\(\d+\)|\bC\(hold=\d+\)|(^|\s)[LM](?=\s|$)/im;

/** A rotation read from storage or a file: the right shape, in the current notation. */
export function cleanRotation(v: unknown, names: string[]): RotationText {
  if (typeof v === 'string') return modernizeRotation({ opener: '', loop: v }, names); // saved before the Start of fight existed
  const r = (v && typeof v === 'object' ? v : {}) as Partial<RotationText>;
  const alternates = Array.isArray(r.alternates) ? r.alternates.map((a) => String(a ?? '')) : [];
  return modernizeRotation({ opener: String(r.opener ?? ''), loop: String(r.loop ?? ''), ...(alternates.length ? { alternates } : {}) }, names);
}
