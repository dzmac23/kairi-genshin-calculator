// Translates rotations written the community way into gcsim lines:
//   "Neuvillette tE > Kazuha tE P > Furina tE d Q"
//   -> neuvillette skill;  kaedeharakazuha skill, high_plunge;  furina skill, dash, burst;
// One turn per character, separated by ">" or new lines. Each turn starts with the character's
// name (full name, any word of it, or gcsim key), followed by space-separated tokens.

import { normalise, type TokenTable } from './tokens';

export type TeamMember = { name: string; key: string | null };

export type TokenResult = { text: string; actions?: string[]; error?: string };

export type Turn = {
  text: string;
  member?: TeamMember;
  tokens: TokenResult[];
  /** The gcsim line, when the turn translated cleanly and gcsim supports the character. */
  gcsim?: string;
  error?: string;
  /** A non-blocking note, e.g. the character isn't supported by gcsim and is skipped. */
  note?: string;
};

export type Translation = { turns: Turn[]; ok: boolean };

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

/** "N2C" -> ["attack:2", "charge"]; returns an error message for unknown codes. */
export function translateToken(token: string, codes: Map<string, string>): TokenResult {
  if (isGcsimToken(token)) return { text: token, actions: [token] };
  const sorted = [...codes.keys()].sort((a, b) => b.length - a.length);
  const actions: string[] = [];
  let i = 0;
  while (i < token.length) {
    const code = sorted.find((c) => token.startsWith(c, i));
    if (!code) {
      const rest = token.slice(i);
      return { text: token, error: `"${token}" is not in the shorthand table${i > 0 ? `: it doesn't know "${rest}"` : ''}.` };
    }
    i += code.length;
    const digits = token.slice(i).match(/^\d+/)?.[0];
    if (digits) i += digits.length;
    const count = digits ? Number(digits) : 1;
    if (count < 1) return { text: token, error: `"${token}" repeats a move 0 times.` };
    const action = codes.get(code)!;
    actions.push(count > 1 ? `${action}:${count}` : action);
  }
  return { text: token, actions };
}

export function translateRotation(text: string, team: TeamMember[], table: TokenTable): Translation {
  const aliases = aliasMap(team);
  const turns: Turn[] = text
    .split(/>|\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((turnText): Turn => {
      const words = turnText.split(/\s+/);
      // The character name may be several words ("Kaedehara Kazuha"); try the longest first.
      let member: TeamMember | undefined;
      let used = 0;
      for (let n = Math.min(3, words.length); n >= 1 && !member; n--) {
        member = aliases.get(normalise(words.slice(0, n).join(' ')));
        if (member) used = n;
      }
      if (!member) {
        return { text: turnText, tokens: [], error: `"${words[0]}" is not a character in your team. Start each turn with a team member's name.` };
      }
      const codes = new Map(table.general);
      for (const [code, action] of table.overrides.get(normalise(member.name)) ?? []) codes.set(code, action);
      const tokens = words.slice(used).map((w) => translateToken(w, codes));
      if (tokens.length === 0) return { text: turnText, member, tokens, error: `${member.name}'s turn has no moves.` };
      const bad = tokens.find((t) => t.error);
      if (bad) return { text: turnText, member, tokens, error: bad.error };
      if (!member.key) {
        return { text: turnText, member, tokens, note: `${member.name} is not in gcsim yet, so this turn is skipped.` };
      }
      return { text: turnText, member, tokens, gcsim: `${member.key} ${tokens.flatMap((t) => t.actions!).join(', ')};` };
    });
  return { turns, ok: turns.length > 0 && turns.every((t) => !t.error) };
}
