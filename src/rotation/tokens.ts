// The shorthand table: which community rotation codes mean which gcsim actions.
// It is plain text so it can be edited in the app, one entry per line:
//   E = skill
//   Neuvillette: C = charge        (character-specific; wins over the general entry)
// Codes are letters only, because a number after a code means "repeat" (N5 = attack:5).
// An action starting with "!" is a whole gcsim statement (for moves like Kinich's "Loop Shot until
// the bar is full"); {key} in it becomes the character's gcsim name.

export const DEFAULT_TOKEN_TABLE = `# Rotation shorthand. One per line:  code = gcsim action
# Character-specific entries win over the general ones:  Name: code = action
# Codes are letters only and upper/lower case doesn't matter; a number after a code repeats it
# (N5 = attack:5).
E = skill
tE = skill
hE = skill[hold=1]
fE = skill[hold=1]
Q = burst
N = attack
NA = attack
C = charge
CA = charge
P = high_plunge
hP = high_plunge
lP = low_plunge
D = dash
J = jump
W = walk
Aim = aim
# Full hold (fE): the longest hold, or the highest charge level.
Bennett: fE = skill[hold=2]
Yun Jin: fE = skill[hold=2]
Sigewinne: fE = skill[hold=2]
Nahida: fE = skill[hold=300]
Navia: fE = skill[hold=241]
Skirk: fE = skill[hold=184]
Charlotte: fE = skill[hold=809]
Chevreuse: fE = skill[hold=301]
Lynette: fE = skill[hold=150]
Lan Yan: fE = skill[hold=610]
Jean: fE = skill[hold=300]
Kinich: fE = skill[hold=301]
Kirara: fE = skill[hold=600]
Sayu: fE = skill[hold=600]
# Short hold (sE) and Neuvillette's short Charged Attack (sC).
Kirara: sE = skill[short_hold=1]
Sayu: sE = skill[short_hold=1]
Dahlia: sE = skill[short_hold=1]
Traveler (Geo): sE = skill[short_hold=1]
Neuvillette: sC = charge[short=1]
# Nefer's held Charged Attack.
Nefer: hC = charge[hold=1]
Nefer: fC = charge[hold=150]
# Mavuika's Finisher: ends her bike Charged Attack chain (Mavuika hE C3 F).
Mavuika: F = charge[final=1]
# Fill: keep going until the special move is ready. A "!" action is a gcsim statement; {key} is the
# character's gcsim name.
Kinich: Fill = !while .{key}.nightsoul.state && .{key}.nightsoul.points < 20 { {key} attack; }
Zibai: Fill = !while .{key}.radiance > 0 && .{key}.radiance < 70 { {key} attack; }
Mualani: Fill = !while .{key}.nightsoul.state && .{key}.momentum < 3 { {key} walk; }
# Earlier names, still understood.
Kinich: L = !while .{key}.nightsoul.state && .{key}.nightsoul.points < 20 { {key} attack; }
Mualani: M = !while .{key}.nightsoul.state && .{key}.momentum < 3 { {key} walk; }
`;

// The built-in table from the special-characters update (L, M, case-sensitive codes).
const SPECIAL_CHARACTERS_TABLE = `# Rotation shorthand. One per line:  code = gcsim action
# Character-specific entries win over the general ones:  Name: code = action
# Codes are letters only; a number after a code repeats it (N5 = attack:5).
E = skill
tE = skill
hE = skill[hold=1]
Q = burst
N = attack
NA = attack
C = charge
CA = charge
P = high_plunge
hP = high_plunge
lP = low_plunge
d = dash
D = dash
j = jump
J = jump
w = walk
W = walk
Aim = aim
# Special characters (see the Notation guide). A "!" action is a gcsim statement; {key} is the
# character's gcsim name.
Kinich: L = !while .{key}.nightsoul.state && .{key}.nightsoul.points < 20 { {key} attack; }
Mualani: M = !while .{key}.nightsoul.state && .{key}.momentum < 3 { {key} walk; }
Kirara: sE = skill[short_hold=1]
Sayu: sE = skill[short_hold=1]
Dahlia: sE = skill[short_hold=1]
Traveler (Geo): sE = skill[short_hold=1]
Neuvillette: sC = charge[short=1]
`;

// The built-in table from the notation cleanup (Fill, hold words), before Mavuika's Finisher.
const FILL_TABLE = `# Rotation shorthand. One per line:  code = gcsim action
# Character-specific entries win over the general ones:  Name: code = action
# Codes are letters only and upper/lower case doesn't matter; a number after a code repeats it
# (N5 = attack:5).
E = skill
tE = skill
hE = skill[hold=1]
fE = skill[hold=1]
Q = burst
N = attack
NA = attack
C = charge
CA = charge
P = high_plunge
hP = high_plunge
lP = low_plunge
D = dash
J = jump
W = walk
Aim = aim
# Full hold (fE): the longest hold, or the highest charge level.
Bennett: fE = skill[hold=2]
Yun Jin: fE = skill[hold=2]
Sigewinne: fE = skill[hold=2]
Nahida: fE = skill[hold=300]
Navia: fE = skill[hold=241]
Skirk: fE = skill[hold=184]
Charlotte: fE = skill[hold=809]
Chevreuse: fE = skill[hold=301]
Lynette: fE = skill[hold=150]
Lan Yan: fE = skill[hold=610]
Jean: fE = skill[hold=300]
Kinich: fE = skill[hold=301]
Kirara: fE = skill[hold=600]
Sayu: fE = skill[hold=600]
# Short hold (sE) and Neuvillette's short Charged Attack (sC).
Kirara: sE = skill[short_hold=1]
Sayu: sE = skill[short_hold=1]
Dahlia: sE = skill[short_hold=1]
Traveler (Geo): sE = skill[short_hold=1]
Neuvillette: sC = charge[short=1]
# Nefer's held Charged Attack.
Nefer: hC = charge[hold=1]
Nefer: fC = charge[hold=150]
# Fill: keep going until the special move is ready. A "!" action is a gcsim statement; {key} is the
# character's gcsim name.
Kinich: Fill = !while .{key}.nightsoul.state && .{key}.nightsoul.points < 20 { {key} attack; }
Zibai: Fill = !while .{key}.radiance > 0 && .{key}.radiance < 70 { {key} attack; }
Mualani: Fill = !while .{key}.nightsoul.state && .{key}.momentum < 3 { {key} walk; }
# Earlier names, still understood.
Kinich: L = !while .{key}.nightsoul.state && .{key}.nightsoul.points < 20 { {key} attack; }
Mualani: M = !while .{key}.nightsoul.state && .{key}.momentum < 3 { {key} walk; }
`;

/** Earlier built-in tables, so a saved copy that was never edited is upgraded automatically. */
// The table before Aim and the special characters were added (it ended at "W = walk").
const BEFORE_SPECIAL_CHARACTERS = SPECIAL_CHARACTERS_TABLE.slice(0, SPECIAL_CHARACTERS_TABLE.indexOf('Aim = aim'));
export const OLD_DEFAULT_TOKEN_TABLES = [
  BEFORE_SPECIAL_CHARACTERS.replace('W = walk\n', ''),
  BEFORE_SPECIAL_CHARACTERS,
  // The table with L, M and case-sensitive codes, before Fill and the hold words.
  SPECIAL_CHARACTERS_TABLE,
  FILL_TABLE,
];

export type TokenTable = {
  /** Code (lower case) -> action. */
  general: Map<string, string>;
  /** Normalised character name -> code (lower case) -> action. */
  overrides: Map<string, Map<string, string>>;
  errors: { line: number; message: string }[];
};

export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseTokenTable(text: string): TokenTable {
  const table: TokenTable = { general: new Map(), overrides: new Map(), errors: [] };
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const match = line.match(/^(?:([^:=]+):\s*)?([A-Za-z]+)\s*=\s*(.+)$/);
    if (!match) {
      table.errors.push({ line: i + 1, message: `Line ${i + 1} should look like "E = skill" or "Name: C = charge".` });
      return;
    }
    const [, character, code, action] = match;
    if (!action.trim().startsWith('!') && /[;,\s]/.test(action.trim())) {
      table.errors.push({ line: i + 1, message: `Line ${i + 1}: the action "${action.trim()}" can't contain spaces, commas or semicolons.` });
      return;
    }
    if (character) {
      const key = normalise(character);
      if (!table.overrides.has(key)) table.overrides.set(key, new Map());
      table.overrides.get(key)!.set(code.toLowerCase(), action.trim());
    } else {
      table.general.set(code.toLowerCase(), action.trim());
    }
  });
  return table;
}
