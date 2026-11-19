// Translates rotations written the community way into gcsim statements.
//
//   Opener (runs once):  Mitya tE > Sucrose N1 E > Odette EE
//   Loop (repeats):      Odette EE > Mitya tE > Sucrose N1 Q?@1/2|E
//
// Turns are separated by ">" or new lines and start with a team member's name (full name, any word
// of it that no other member shares, or the gcsim key). After the name come moves:
//   E, Q, N5, C, N2C, hE ...   from the shorthand table (a number repeats: N5 = attack:5)
//   hE(60), C(beams=2)         options in brackets: a lone number sets the one option the code
//                              already has (hE = skill[hold=1], so hE(60) = skill[hold=60])
//   L, M ...                   codes that stand for a whole gcsim statement (Kinich, Mualani)
//   attack:3, skill[hold=1]    gcsim actions, passed through unchanged
//   Q?          only if ready (skill and burst only); otherwise skip it
//   Q@1/2       only in loop 1 of every 2 (loops 1, 3, 5...); @2/2 = loops 2, 4, 6; @2+ = loop 2 onwards
//   Q?@1/2|E    "|" means otherwise: burst in odd loops if ready, otherwise skill
// A line starting with "!" is a gcsim statement, copied exactly as written.
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
  /** Under ?, @ or | : it may or may not happen. */
  conditional: boolean;
};

export type Section = 'opener' | 'loop';

export type Turn = {
  section: Section;
  /** Position within its section, starting at 1. */
  index: number;
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
  /** Loop counters the statements rely on: `kc_loop` and one cycle counter per "every N loops". */
  counters: { loop: boolean; cycles: number[] };
};

export type RotationText = { opener: string; loop: string };

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

/** Tokens that already look like gcsim pass through unchanged: "attack:3", "skill[hold=1]", "burst". */
function isGcsimToken(token: string): boolean {
  return token.includes(':') || token.includes('[') || /^[a-z_]{4,}$/.test(token);
}

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

/** Applies "(60)" or "(beams=2,hold=1)" to an action from the table. */
function withOptions(action: string, options: string, code: string): { action?: string; error?: string } {
  if (action.startsWith('!')) return { error: `"${code}" stands for a whole gcsim statement, so it can't take options.` };
  const parsed = parseAction(action);
  const params = { ...parsed.params };
  for (const part of options.split(',').map((x) => x.trim()).filter(Boolean)) {
    const named = part.match(/^([a-z_]+)\s*=\s*(-?\d+)$/);
    if (named) {
      params[named[1]] = Number(named[2]);
    } else if (/^-?\d+$/.test(part)) {
      const keys = Object.keys(parsed.params);
      if (keys.length !== 1) return { error: `"${code}(${options})": a lone number only works on a code with one option (like hE(60)); write name=value, like C(beams=2).` };
      params[keys[0]] = Number(part);
    } else {
      return { error: `"${code}(${options})": options look like hE(60) or C(beams=2).` };
    }
  }
  return { action: actionText(parsed.action, params, parsed.count) };
}

/** "N2C" -> ["attack:2", "charge"], or an error message for unknown codes. "!…" entries are statements. */
export function translateCodes(token: string, codes: Map<string, string>): { actions?: string[]; moves?: Omit<Move, 'conditional'>[]; error?: string } {
  if (isGcsimToken(token)) {
    const p = parseAction(token);
    return { actions: [token], moves: [{ ...p, code: token }] };
  }
  const sorted = [...codes.keys()].sort((a, b) => b.length - a.length);
  const actions: string[] = [];
  const moves: Omit<Move, 'conditional'>[] = [];
  let i = 0;
  while (i < token.length) {
    const code = sorted.find((c) => token.startsWith(c, i));
    if (!code) {
      const rest = token.slice(i);
      return { error: `"${token}" is not in the shorthand table${i > 0 ? `: it doesn't know "${rest}"` : ''}.` };
    }
    i += code.length;
    let action = codes.get(code)!;
    const options = token.slice(i).match(/^\(([^)]*)\)/);
    if (options) {
      i += options[0].length;
      const r = withOptions(action, options[1], code);
      if (r.error) return { error: r.error };
      action = r.action!;
    }
    const digits = token.slice(i).match(/^\d+/)?.[0];
    if (digits) i += digits.length;
    const count = digits ? Number(digits) : 1;
    if (count < 1) return { error: `"${token}" repeats a move 0 times.` };
    if (action.startsWith('!')) {
      if (count > 1) return { error: `"${code}${digits}": "${code}" already repeats until it's done, so it can't take a number.` };
      actions.push(action);
      moves.push({ action: 'statement', params: {}, count: 1, code });
      continue;
    }
    const parsed = parseAction(action);
    actions.push(count > 1 ? `${action}:${count}` : action);
    moves.push({ ...parsed, count: parsed.count * count, code });
  }
  return { actions, moves };
}

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

type Choice = { actions: string[]; moves: Omit<Move, 'conditional'>[]; conditions: string[] };

/** Parses one move with its modifiers, e.g. "Q?@1/2" -> burst, if ready and in loop 1 of 2. */
function parseChoice(
  part: string,
  key: string,
  codes: Map<string, string>,
  section: Section,
  counters: Translation['counters'],
): { choice?: Choice; error?: string } {
  const match = part.match(/^(.*?)((?:\?|@\d+\/\d+|@\d+\+)*)$/);
  const core = match?.[1] ?? part;
  const modifiers = match?.[2] ?? '';
  if (!core) return { error: `"${part}" has no move before its ? or @.` };
  const { actions, moves, error } = translateCodes(core, codes);
  if (error) return { error };
  const conditions: string[] = [];
  for (const m of modifiers.match(/\?|@\d+\/\d+|@\d+\+/g) ?? []) {
    if (m === '?') {
      const kind = actions!.length === 1 ? actions![0].match(/^(skill|burst)\b/)?.[1] : undefined;
      if (!kind) return { error: `"${part}": ? (only if ready) works on a single skill or burst, like E? or Q?.` };
      conditions.push(`.${key}.${kind}.ready`);
      continue;
    }
    if (section === 'opener') return { error: `"${part}": @ (which loops) only works in the Loop, because the Opener runs once.` };
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
  return { choice: { actions: actions!, moves: moves!, conditions } };
}

/** "Q?@1/2|E" -> if .x.burst.ready && kc_c2 == 1 { x burst; } else { x skill; } */
function choiceStatement(choices: Choice[], key: string, part: string): { statement?: string; error?: string } {
  for (let i = 0; i < choices.length - 1; i++) {
    if (choices[i].conditions.length === 0) {
      return { error: `"${part}": the choice before "|" always happens, so what comes after it never would. Add ? or @ to it.` };
    }
  }
  const build = (i: number): string => {
    const c = choices[i];
    const body = actionsToStatements(key, c.actions).join(' ');
    if (c.conditions.length === 0) return body;
    const rest = i + 1 < choices.length ? ` else { ${build(i + 1)} }` : '';
    return `if ${c.conditions.join(' && ')} { ${body} }${rest}`;
  };
  return { statement: build(0) };
}

function translateTurn(
  text: string,
  section: Section,
  index: number,
  aliases: Map<string, TeamMember>,
  table: TokenTable,
  counters: Translation['counters'],
): Turn {
  const base = { section, index, text, tokens: [] as TokenResult[] };
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
  const moves: Move[] = [];
  let plain: string[] = [];
  const flush = () => {
    statements.push(...actionsToStatements(key, plain));
    plain = [];
  };
  for (const word of words.slice(used)) {
    const choices: Choice[] = [];
    let error: string | undefined;
    for (const part of word.split('|')) {
      const r = parseChoice(part, key, codes, section, counters);
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
      const r = choiceStatement(choices, key, word);
      if (r.error) error = r.error;
      else {
        flush();
        statements.push(r.statement!);
      }
    }
    tokens.push({ text: word, error });
  }
  flush();

  const turn: Turn = { ...base, member, tokens, moves };
  if (tokens.length === 0) return { ...turn, error: `${member.name}'s turn has no moves.` };
  const bad = tokens.find((t) => t.error);
  if (bad) return { ...turn, error: bad.error };
  if (!member.key) return { ...turn, note: `${member.name} is not in gcsim yet, so this turn is skipped.` };
  return { ...turn, statements };
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
  const turns = (['opener', 'loop'] as const).flatMap((section) =>
    splitTurns(rotation[section]).map((text, i) => translateTurn(text, section, i + 1, aliases, table, counters)),
  );
  counters.cycles.sort((a, b) => a - b);
  const hasLoop = turns.some((t) => t.section === 'loop');
  return { turns, ok: hasLoop && turns.every((t) => !t.error), counters };
}
