// Translates rotations written the community way into gcsim statements.
//
//   Start of fight (runs once):  Mitya tE > Sucrose N1 E > Odette EE
//   Rotation A, B, C… (repeat in turn: A, B, A, B…):  Odette EE > Mitya tE > Sucrose N1 Q/E
//
// Turns are separated by ">" or new lines and start with a team member's name (full name, any word
// of it that no other member shares, or the gcsim key). After the name come moves; upper and lower
// case don't matter:
//   E, Q, N5, C, N2C, hE, fE …   from the shorthand table (a number repeats: N5 = attack:5)
//   hE(1.5s)                     hold for 1.5 seconds (characters whose hold has a length)
//   hE(60), C(beams=2)           gcsim options in brackets: a lone number sets the one option the
//                                code already has (hE = skill[hold=1], so hE(60) = skill[hold=60])
//   Fill                         a code that stands for a whole gcsim statement (Kinich, Zibai, Mualani)
//   attack:3, skill[hold=1]      gcsim actions, passed through unchanged
//   Q?          only if ready (skill and burst only); otherwise skip it
//   Q/E, Q/N3   "/" means otherwise: burst if ready, otherwise skill (or three attacks)
// A line starting with "!" is a gcsim statement, copied exactly as written.
//
// Kinich's cannon and Zibai's Spirit Steed's Stride need a full bar. Before each of their skills the
// app adds "Normal Attack until the bar is full" (it does nothing when the bar is already full, or
// when the skill starts the special state), so an exact count like Kinich E N4 E never stops the run
// or leaves them standing still; the timing replays report how often it was needed.
//
// Older forms are still understood (and converted by modernizeRotation): "|" for "/", "@1/2" and
// "@2+" for which loops, L and M for Fill.
//
// A turn whose moves are all conditional is skipped entirely in loops where none apply: gcsim only
// swaps to a character when one of their actions actually runs.

import { normalise, type TokenTable } from './tokens';

export type TeamMember = { name: string; key: string | null };

export type TokenResult = { text: string; error?: string };

/** One move as the checks see it (src/rotation/checks.ts). */
export type Move = {
  /** gcsim action: attack, charge, skill, burst, high_plunge, dash, aim… ("statement" for L, M). */
  action: string;
  params: Record<string, number>;
  /** How many times in a row (N5 = attack × 5). */
  count: number;
  /** The shorthand code it came from (E, hE, N, L…), or the gcsim text. */
  code: string;
  /** Under ?, / (or the older @ and |): it may or may not happen. */
  conditional: boolean;
};

export type Section = 'opener' | 'loop';

export type Turn = {
  section: Section;
  /**
   * Position within its section, starting at 1. Loop turns are numbered on through Rotations A, B,
   * C… (so every loop turn has its own number); `rotation` and `position` say where it is.
   */
  index: number;
  /** For loop turns: 0 for Rotation A, 1 for B… */
  rotation?: number;
  /** Position within the Start of fight or its rotation, starting at 1. */
  position: number;
  /** Indexes into `statements` of the automatic "attack until the bar is full" loops (Kinich, Zibai). */
  topUps?: number[];
  text: string;
  member?: TeamMember;
  /** True for a "!" line passed to gcsim unchanged. */
  raw?: boolean;
  tokens: TokenResult[];
  /** The turn's moves in order, for the checks. */
  moves?: Move[];
  /** gcsim statements for this turn, when it translated cleanly and gcsim supports the character. */
  statements?: string[];
  error?: string;
  /** A non-blocking note, e.g. the character isn't supported by gcsim and is skipped. */
  note?: string;
};

export type Translation = {
  turns: Turn[];
  ok: boolean;
  /** How many rotations repeat in turn (1 = just Rotation A). */
  rotations: number;
  /** Loop counters the statements rely on: `kc_loop` and one cycle counter per "every N loops". */
  counters: { loop: boolean; cycles: number[] };
};

/**
 * A rotation as typed: the Start of fight (`opener`, runs once), Rotation A (`loop`) and any further
 * rotations (`alternates`: B, C…), which repeat in turn: A, B, C, A, B, C…
 */
export type RotationText = { opener: string; loop: string; alternates?: string[] };

/** All repeating rotations, A first. */
export const rotationBoxes = (r: RotationText): string[] => [r.loop, ...(r.alternates ?? [])];

export const rotationName = (index: number) => `Rotation ${String.fromCharCode(65 + index)}`;

/** "Start of fight, turn 2", "Rotation B, turn 1" (or "Rotation, turn 1" when there is only one). */
export function turnLabel(turn: Pick<Turn, 'section' | 'rotation' | 'position'>, rotations: number): string {
  if (turn.section === 'opener') return `Start of fight, turn ${turn.position}`;
  return `${rotations > 1 ? rotationName(turn.rotation ?? 0) : 'Rotation'}, turn ${turn.position}`;
}

/**
 * Names a team member can be called in a rotation: full name, gcsim key, and each word of the name
 * (3+ letters) when no other team member shares that word.
 */
function aliasMap(team: TeamMember[]): Map<string, TeamMember> {
  const map = new Map<string, TeamMember>();
  const wordOwners = new Map<string, TeamMember[]>();
  for (const m of team) {
    map.set(normalise(m.name), m);
    if (m.key) map.set(m.key, m);
    for (const word of m.name.split(/[\s()]+/).map(normalise).filter((w) => w.length >= 3)) {
      wordOwners.set(word, [...(wordOwners.get(word) ?? []), m]);
    }
  }
  for (const [word, owners] of wordOwners) if (owners.length === 1 && !map.has(word)) map.set(word, owners[0]);
  return map;
}

/** Tokens that can only be gcsim: "attack:3", "skill[hold=1]", "low_plunge". */
const isGcsimSyntax = (token: string) => token.includes(':') || token.includes('[') || token.includes('_');
/** Plain words of 4+ letters that aren't shorthand are gcsim actions too: "burst", "dash". */
const isGcsimWord = (token: string) => /^[a-z]{4,}$/.test(token);

/** "skill[hold=1]" -> { action: "skill", params: { hold: 1 } }; "attack:3" -> count 3. */
export function parseAction(text: string): { action: string; params: Record<string, number>; count: number } {
  const m = text.match(/^([a-z_]+)(?:\[([^\]]*)\])?(?::(\d+))?$/);
  if (!m) return { action: text, params: {}, count: 1 };
  const params: Record<string, number> = {};
  for (const kv of (m[2] ?? '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    params[k.trim()] = Number(v);
  }
  return { action: m[1], params, count: m[3] ? Number(m[3]) : 1 };
}

const actionText = (action: string, params: Record<string, number>, count: number) => {
  const p = Object.entries(params);
  return `${action}${p.length ? `[${p.map(([k, v]) => `${k}=${v}`).join(',')}]` : ''}${count > 1 ? `:${count}` : ''}`;
};

/** Applies "(60)", "(1.5s)" or "(beams=2,hold=1)" to an action from the table. */
function withOptions(action: string, options: string, code: string, codes: Map<string, string>): { action?: string; error?: string } {
  if (action.startsWith('!')) return { error: `"${code}" stands for a whole gcsim statement, so it can't take options.` };
  const parsed = parseAction(action);
  const params = { ...parsed.params };
  for (const part of options.split(',').map((x) => x.trim()).filter(Boolean)) {
    const named = part.match(/^([a-z_]+)\s*=\s*(-?\d+)$/i);
    const seconds = part.match(/^(\d+(?:\.\d+)?)\s*s$/i);
    if (named) {
      params[named[1].toLowerCase()] = Number(named[2]);
    } else if (seconds) {
      const r = holdFrames(Number(seconds[1]), parsed, code, codes);
      if (r.error) return { error: r.error };
      params.hold = r.frames!;
    } else if (/^-?\d+$/.test(part)) {
      const keys = Object.keys(parsed.params);
      if (keys.length !== 1) return { error: `"${code}(${options})": a lone number only works on a code with one option (like hE(60)); write name=value, like C(beams=2).` };
      params[keys[0]] = Number(part);
    } else {
      return { error: `"${code}(${options})": options look like hE(1.5s) or C(beams=2).` };
    }
  }
  return { action: actionText(parsed.action, params, parsed.count) };
}

/**
 * Seconds -> gcsim's hold frames. Only for holds that have a length: the full hold (fE, or fC for a
 * held Charged Attack) is then more than 2 frames. Holds with levels (Bennett) or one length don't.
 */
function holdFrames(sec: number, parsed: { action: string; params: Record<string, number> }, code: string, codes: Map<string, string>): { frames?: number; error?: string } {
  if (!('hold' in parsed.params)) return { error: `"${code}" isn't a hold, so it can't take a time. Write hE(1.5s).` };
  const full = codes.get(`f${parsed.action === 'charge' ? 'c' : 'e'}`);
  const max = full ? parseAction(full).params.hold : undefined;
  if (!max || max <= 2) {
    return {
      error:
        max === 2
          ? `This character's hold has levels, not a length: write hE for level 1 or fE for level 2.`
          : `This character's hold has only one length in gcsim: write hE.`,
    };
  }
  const frames = Math.round(sec * 60);
  if (frames < 1) return { error: `"${code}(${sec}s)" is too short; holds start at 0.02 s.` };
  if (frames > max) return { error: `The longest hold gcsim allows here is ${Math.round((max / 60) * 10) / 10} s (write fE for the full hold).` };
  return { frames };
}

/** "N2C" -> ["attack:2", "charge"], or an error message for unknown codes. "!…" entries are statements. */
export function translateCodes(token: string, codes: Map<string, string>): { actions?: string[]; moves?: Omit<Move, 'conditional'>[]; error?: string } {
  const passThrough = () => {
    const p = parseAction(token);
    return { actions: [token], moves: [{ ...p, code: token }] };
  };
  if (isGcsimSyntax(token)) return passThrough();
  const lower = token.toLowerCase();
  const sorted = [...codes.keys()].sort((a, b) => b.length - a.length);
  const actions: string[] = [];
  const moves: Omit<Move, 'conditional'>[] = [];
  let i = 0;
  while (i < token.length) {
    const code = sorted.find((c) => lower.startsWith(c, i));
    if (!code) {
      if (isGcsimWord(token)) return passThrough();
      const rest = token.slice(i);
      return { error: `"${token}" is not in the shorthand table${i > 0 ? `: it doesn't know "${rest}"` : ''}.` };
    }
    const written = token.slice(i, i + code.length);
    i += code.length;
    let action = codes.get(code)!;
    const options = token.slice(i).match(/^\(([^)]*)\)/);
    if (options) {
      i += options[0].length;
      const r = withOptions(action, options[1], written, codes);
      if (r.error) return { error: r.error };
      action = r.action!;
    }
    const digits = token.slice(i).match(/^\d+/)?.[0];
    if (digits) i += digits.length;
    const count = digits ? Number(digits) : 1;
    if (count < 1) return { error: `"${token}" repeats a move 0 times.` };
    if (action.startsWith('!')) {
      if (count > 1) return { error: `"${written}${digits}": "${written}" already repeats until it's done, so it can't take a number.` };
      actions.push(action);
      moves.push({ action: 'statement', params: {}, count: 1, code: written });
      continue;
    }
    const parsed = parseAction(action);
    actions.push(count > 1 ? `${action}:${count}` : action);
    moves.push({ ...parsed, count: parsed.count * count, code: written });
  }
  return { actions, moves };
}

/**
 * Characters whose special skill needs a full bar, and the gcsim condition "in the special state but
 * the bar isn't full yet". Before each of their skills the app attacks while it holds.
 */
export const TOP_UP: Record<string, { condition: (key: string) => string; what: string }> = {
  kinich: { condition: (k) => `.${k}.nightsoul.state && .${k}.nightsoul.points < 20`, what: 'Loop Shots before the cannon' },
  zibai: { condition: (k) => `.${k}.radiance > 0 && .${k}.radiance < 70`, what: "Normal Attacks before Spirit Steed's Stride" },
};

/** Turns actions into gcsim statements: runs of actions as "key a, b;", "!…" entries as written. */
export function actionsToStatements(key: string, actions: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) out.push(`${key} ${run.join(', ')};`);
    run = [];
  };
  for (const a of actions) {
    if (a.startsWith('!')) {
      flush();
      out.push(a.slice(1).trim().replaceAll('{key}', key));
    } else run.push(a);
  }
  flush();
  return out;
}

type Choice = { actions: string[]; moves: Omit<Move, 'conditional'>[]; conditions: string[]; text: string };

/** "Q?@1/2|E" (older) or "Q/E": the alternatives of one word. "/" inside "@1/2" isn't one. */
function splitAlternatives(word: string): string[] {
  return word
    .replace(/@(\d+)\/(\d+)/g, '@$1#$2')
    .split(/[|/]/)
    .map((p) => p.replace(/@(\d+)#(\d+)/g, '@$1/$2'));
}

/** Parses one move with its modifiers, e.g. "Q?" -> burst, if ready; "Q?@1/2" (older) also in loop 1 of 2. */
function parseChoice(
  part: string,
  key: string,
  codes: Map<string, string>,
  section: Section,
  counters: Translation['counters'],
  ready: boolean,
): { choice?: Choice; error?: string } {
  const match = part.match(/^(.*?)((?:\?|@\d+\/\d+|@\d+\+)*)$/);
  const core = match?.[1] ?? part;
  const modifiers = match?.[2] ?? '';
  if (!core) return { error: `"${part}" has no move before its ?.` };
  const { actions, moves, error } = translateCodes(core, codes);
  if (error) return { error };
  const conditions: string[] = [];
  const kind = actions!.length >= 1 ? actions![0].match(/^(skill|burst)\b/)?.[1] : undefined;
  const marks: string[] = modifiers.match(/\?|@\d+\/\d+|@\d+\+/g) ?? [];
  if (marks.includes('?') || ready) {
    if (!kind) {
      return {
        error: marks.includes('?')
          ? `"${part}": ? (only if ready) works on a skill or burst, like E? or Q?.`
          : `"${core}" can always be done, so what comes after "/" never would. Only a skill or burst can be not ready: write it first, like Q/E or E/N3.`,
      };
    }
    conditions.push(`.${key}.${kind}.ready`);
  }
  for (const m of marks.filter((x) => x !== '?')) {
    if (section === 'opener') return { error: `"${part}": @ (which loops) only works in a repeating rotation, because the Start of fight runs once.` };
    const every = m.match(/^@(\d+)\/(\d+)$/);
    if (every) {
      const [k, n] = [Number(every[1]), Number(every[2])];
      if (n < 2 || k < 1 || k > n) return { error: `"${part}": @${k}/${n} needs 1 ≤ ${k} ≤ ${n} and at least 2 (like @1/2 or @2/3).` };
      if (!counters.cycles.includes(n)) counters.cycles.push(n);
      conditions.push(`kc_c${n} == ${k}`);
    } else {
      const from = Number(m.slice(1, -1));
      if (from < 2) return { error: `"${part}": @${from}+ would mean every loop; use @2+ or later.` };
      counters.loop = true;
      conditions.push(`kc_loop >= ${from}`);
    }
  }
  return { choice: { actions: actions!, moves: moves!, conditions: [...new Set(conditions)], text: part } };
}

/** "Q/E" -> if .x.burst.ready { x burst; } else { x skill; } */
function choiceStatement(choices: Choice[], key: string): string {
  const build = (i: number): string => {
    const c = choices[i];
    const body = actionsToStatements(key, c.actions).join(' ');
    if (c.conditions.length === 0) return body;
    const rest = i + 1 < choices.length ? ` else { ${build(i + 1)} }` : '';
    return `if ${c.conditions.join(' && ')} { ${body} }${rest}`;
  };
  return build(0);
}

function translateTurn(
  text: string,
  place: { section: Section; index: number; position: number; rotation?: number },
  aliases: Map<string, TeamMember>,
  table: TokenTable,
  counters: Translation['counters'],
): Turn {
  const { section } = place;
  const base = { ...place, text, tokens: [] as TokenResult[] };
  if (text.startsWith('!')) {
    const statement = text.slice(1).trim();
    if (!statement) return { ...base, raw: true, error: 'A "!" line needs a gcsim statement after it.' };
    return { ...base, raw: true, statements: [statement] };
  }
  const words = text.split(/\s+/);
  // The character name may be several words ("Kaedehara Kazuha"); try the longest first.
  let member: TeamMember | undefined;
  let used = 0;
  for (let n = Math.min(3, words.length); n >= 1 && !member; n--) {
    member = aliases.get(normalise(words.slice(0, n).join(' ')));
    if (member) used = n;
  }
  if (!member) {
    return { ...base, error: `"${words[0]}" is not a character in your team. Start each turn with a team member's name.` };
  }
  const codes = new Map(table.general);
  for (const [code, action] of table.overrides.get(normalise(member.name)) ?? []) codes.set(code, action);
  const key = member.key ?? normalise(member.name);

  const tokens: TokenResult[] = [];
  const statements: string[] = [];
  const topUps: number[] = [];
  const moves: Move[] = [];
  let plain: string[] = [];
  const topUp = member.key ? TOP_UP[member.key] : undefined;
  const flush = () => {
    plain.forEach((a, j) => {
      // Kinich, Zibai: attack until the bar is full before each skill (does nothing otherwise).
      // Not straight after Fill, which already filled it.
      if (topUp && /^skill\b/.test(a) && !plain[j - 1]?.startsWith('!')) {
        topUps.push(statements.length);
        statements.push(`while ${topUp.condition(key)} { ${key} attack; }`);
      }
      statements.push(...actionsToStatements(key, [a]));
    });
    plain = [];
  };
  for (const word of words.slice(used)) {
    const choices: Choice[] = [];
    let error: string | undefined;
    const parts = splitAlternatives(word);
    for (const [i, part] of parts.entries()) {
      const r = parseChoice(part, key, codes, section, counters, i < parts.length - 1);
      if (r.error) {
        error = r.error;
        break;
      }
      choices.push(r.choice!);
    }
    if (!error && choices.length === 1 && choices[0].conditions.length === 0) {
      plain.push(...choices[0].actions);
      moves.push(...choices[0].moves.map((m) => ({ ...m, conditional: false })));
    } else if (!error) {
      for (const c of choices) moves.push(...c.moves.map((m) => ({ ...m, conditional: true })));
      flush();
      statements.push(choiceStatement(choices, key));
    }
    tokens.push({ text: word, error });
  }
  flush();

  const turn: Turn = { ...base, member, tokens, moves };
  if (tokens.length === 0) return { ...turn, error: `${member.name}'s turn has no moves.` };
  const bad = tokens.find((t) => t.error);
  if (bad) return { ...turn, error: bad.error };
  if (!member.key) return { ...turn, note: `${member.name} is not in gcsim yet, so this turn is skipped.` };
  return { ...turn, statements: mergeRuns(statements, key), ...(topUps.length ? { topUps: shiftTopUps(statements, topUps, key) } : {}) };
}

/** Joins neighbouring "key a;" statements into "key a, b;" (as gcsim configs are usually written). */
function mergeRuns(statements: string[], key: string): string[] {
  return groupRuns(statements, key).map((g) => g.text);
}
function shiftTopUps(statements: string[], topUps: number[], key: string): number[] {
  const groups = groupRuns(statements, key);
  return topUps.map((t) => groups.findIndex((g) => g.from <= t && t < g.to));
}
function groupRuns(statements: string[], key: string): { text: string; from: number; to: number }[] {
  const plain = new RegExp(`^${key} ([^;{}]+);$`);
  const out: { text: string; from: number; to: number }[] = [];
  statements.forEach((st, i) => {
    const m = st.match(plain);
    const last = out[out.length - 1];
    if (m && last && last.text.match(plain) && last.to === i) {
      last.text = `${last.text.slice(0, -1)}, ${m[1]};`;
      last.to = i + 1;
    } else out.push({ text: st, from: i, to: i + 1 });
  });
  return out;
}

/**
 * Kinich's grapple and Zibai's Lunar Phase Shift end when they swap out, so the first skill of a turn
 * that follows another character's turn only starts the state: its top-up is dropped (it would do
 * nothing). Kept when the turn before (including, for the first repeating turn, the last one, which
 * comes before it from the second time round) is the same character.
 */
function dropFirstTopUps(turns: Turn[]) {
  const opener = turns.filter((t) => t.section === 'opener' && !t.raw);
  const loop = turns.filter((t) => t.section === 'loop' && !t.raw);
  const before = (t: Turn): (Turn | undefined)[] => {
    const list = t.section === 'opener' ? opener : loop;
    const i = list.indexOf(t);
    if (i > 0) return [list[i - 1]];
    return t.section === 'opener' ? [undefined] : [loop[loop.length - 1], opener[opener.length - 1]];
  };
  for (const t of turns) {
    if (!t.topUps?.length || t.topUps[0] !== 0 || !t.statements) continue;
    if (before(t).some((b) => b?.member && b.member.name === t.member?.name)) continue;
    t.statements = t.statements.slice(1);
    t.topUps = t.topUps.slice(1).map((i) => i - 1);
    if (!t.topUps.length) delete t.topUps;
  }
}

/** Splits a rotation box into turns: "!" lines are whole turns; other lines split on ">". */
function splitTurns(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    const t = line.trim();
    if (!t) return [];
    if (t.startsWith('!')) return [t];
    return t.split('>').map((x) => x.trim()).filter(Boolean);
  });
}

export function translateRotation(rotation: RotationText, team: TeamMember[], table: TokenTable): Translation {
  const aliases = aliasMap(team);
  const counters: Translation['counters'] = { loop: false, cycles: [] };
  const turns: Turn[] = splitTurns(rotation.opener).map((text, i) =>
    translateTurn(text, { section: 'opener', index: i + 1, position: i + 1 }, aliases, table, counters),
  );
  let index = 0;
  const boxes = rotationBoxes(rotation);
  boxes.forEach((box, r) => {
    splitTurns(box).forEach((text, i) => {
      index++;
      turns.push(translateTurn(text, { section: 'loop', index, position: i + 1, rotation: r }, aliases, table, counters));
    });
  });
  dropFirstTopUps(turns);
  counters.cycles.sort((a, b) => a - b);
  const hasLoop = turns.some((t) => t.section === 'loop');
  return { turns, ok: hasLoop && turns.every((t) => !t.error), counters, rotations: boxes.length };
}
