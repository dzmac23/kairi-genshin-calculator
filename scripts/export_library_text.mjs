// Exports the written text the Library and the Setup screen's ⓘ panels show: every character's
// talents, passives and constellations, and each weapon's description, to data/library.json.
// Stats, weapon passives and artifact set effects are already in the other data
// files. Uses the open genshin-db package (the same source as the rest of data/):
//
//   npm install --no-save genshin-db@5.2.15
//   node scripts/export_library_text.mjs
//
// It also writes each talent's scaling lines exactly as the game does: the game's template for each
// line and its values for talent levels 1-15, so the Library can show any talent level.
//
// Text keeps the game's highlights as **bold**; links, colours and controller-specific wording are
// reduced to the PC wording.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const g = require('genshin-db');

/** Game markup -> plain text with **highlights**. */
function clean(raw) {
  return (raw ?? '')
    .replace(/\{LAYOUT_MOBILE#([^}]*)\}\{LAYOUT_PC#([^}]*)\}\{LAYOUT_PS#([^}]*)\}/g, '$2')
    .replace(/\{LAYOUT_\w+#([^}]*)\}/g, '$1')
    .replace(/\{LINK#[^}]*\}|\{\/LINK\}/g, '')
    .replace(/\{TIMEZONE\}/g, '')
    .replace(/<color=[^>]*>([\s\S]*?)<\/color>/g, (_, inner) => (inner.trim() ? `**${inner}**` : inner))
    .replace(/<\/?i>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*\*\*/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

const COMBAT = [
  ['combat1', 'Normal Attack'],
  ['combat2', 'Elemental Skill'],
  ['combatsp', 'Alternate Sprint'],
  ['combat3', 'Elemental Burst'],
];
// The game unlocks the first passive at Ascension 1 and the second at Ascension 4; the rest are
// always on (utility passives, Moonsign).
const PASSIVE_UNLOCK = ['Ascension 1', 'Ascension 4'];

const characters = JSON.parse(readFileSync('data/characters.json', 'utf8'));
const weapons = JSON.parse(readFileSync('data/weapons.json', 'utf8'));
const out = { source: 'genshin-db 5.2.15', characters: {}, weapons: {} };
const missing = [];

for (const c of characters) {
  const t = g.talents(c.name);
  const k = g.constellations(c.name);
  const info = g.characters(c.name.replace(/^Traveler \(.*\)$/, 'Aether'));
  if (!t || !k) {
    missing.push(c.name);
    continue;
  }
  out.characters[c.name] = {
    title: info?.title ?? '',
    region: info?.region ?? '',
    description: clean(info?.description),
    talents: COMBAT.filter(([key]) => t[key]).map(([key, kind]) => ({ kind, name: t[key].name, text: clean(t[key].descriptionRaw) })),
    passives: ['passive1', 'passive2', 'passive3', 'passive4']
      .filter((key) => t[key])
      .map((key, i) => ({ name: t[key].name, unlock: PASSIVE_UNLOCK[i] ?? 'Always', text: clean(t[key].descriptionRaw) })),
    constellations: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((key, i) => ({ level: i + 1, name: clean(k[key]?.name), text: clean(k[key]?.descriptionRaw) })),
  };
}
for (const w of weapons) {
  const d = g.weapons(w.name);
  if (d) out.weapons[w.name] = { description: clean(d.description) };
}

// Talent scaling, exactly as the game writes it: each line's template ("1-Hit DMG|{param1:F1P}")
// and the values it uses for talent levels 1-15 (one value when it doesn't change).
const COMBAT_GROUP = { combat1: 'Normal Attack', combat2: 'Skill', combatsp: 'Special', combat3: 'Burst' };
out.scaling = {};
for (const c of characters) {
  const t = g.talents(c.name);
  if (!t) continue;
  const groups = {};
  for (const [key, group] of Object.entries(COMBAT_GROUP)) {
    const attrs = t[key]?.attributes;
    if (!attrs?.labels?.length) continue;
    const used = new Set(attrs.labels.flatMap((l) => [...l.matchAll(/\{(param\d+):/g)].map((m) => m[1])));
    const params = {};
    for (const p of used) {
      const v = attrs.parameters[p] ?? [];
      params[p] = v.every((x) => x === v[0]) ? [v[0]] : v;
    }
    groups[group] = { lines: attrs.labels, params };
  }
  out.scaling[c.name] = groups;
}

// Compact (one line): the app downloads this file, so spaces would only add size.
writeFileSync('data/library.json', JSON.stringify(out) + '\n');
console.log(`Wrote ${Object.keys(out.characters).length} characters and ${Object.keys(out.weapons).length} weapons to data/library.json`);
if (missing.length) console.log('Not in genshin-db:', missing.join(', '));
