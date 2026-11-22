// Exports the written text the Library and the Setup screen's ⓘ panels show: every character's
// talents, passives and constellations, and each weapon's description, to data/library.json.
// Stats, weapon passives and artifact set effects are already in the other data
// files. Uses the open genshin-db package (the same source as the rest of data/):
//
//   npm install --no-save genshin-db@5.2.15
//   node scripts/export_library_text.mjs
//
// It also folds in a compact copy of the talent scaling from data/talents.json (label, the game's
// level-10 text, and the value arrays for levels 1-15), so the Library can show any talent level
// without loading the full 1.5 MB file.
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

// Talent scaling: per character and talent (Normal Attack, Skill, Burst, Special).
const round = (v) => (v === null || v === undefined ? null : Number(Number(v).toPrecision(5)));
out.scaling = {};
for (const row of JSON.parse(readFileSync('data/talents.json', 'utf8'))) {
  const arrays = [row.A, row.B, row.F].filter((a) => Array.isArray(a) && a.some((v) => v !== null));
  const byTalent = (out.scaling[row.char] ??= {});
  (byTalent[row.cat] ??= []).push({ label: row.label, at10: row.raw10, values: arrays.map((a) => a.map(round)) });
}

// Compact (one line): the app downloads this file, so spaces would only add size.
writeFileSync('data/library.json', JSON.stringify(out) + '\n');
console.log(`Wrote ${Object.keys(out.characters).length} characters and ${Object.keys(out.weapons).length} weapons to data/library.json`);
if (missing.length) console.log('Not in genshin-db:', missing.join(', '));
