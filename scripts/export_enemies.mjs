// Copies gcsim's enemy data (English names, resistances, freeze resistance) into data/enemies.json,
// for the enemy picker in Fight settings. Run after `npm run engine` has downloaded gcsim into
// .cache/, and again after every gcsim upgrade:
//
//   node scripts/export_enemies.mjs
//
// The data comes from gcsim's own website files, which are generated from the game data that the
// gcsim engine uses, so the app and the engine always agree.

import { readFileSync, writeFileSync } from 'node:fs';

const version = readFileSync('gcsim-version.txt', 'utf8').trim();
const root = `.cache/gcsim-${version}/ui/packages`;
const names = JSON.parse(readFileSync(`${root}/localization/src/locales/names.dm.json`, 'utf8')).English.monster_names;
const resist = JSON.parse(readFileSync(`${root}/docs/src/components/Resist/monster.dm.json`, 'utf8'));

const ELEMENTS = ['pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro', 'physical'];
const enemies = Object.entries(resist)
  // gcsim's data includes a few internal test entries, named "(test) …".
  .filter(([key]) => !names[key]?.startsWith('(test)'))
  .map(([key, r]) => {
    if (!names[key]) throw new Error(`No English name for ${key}`);
    for (const e of ELEMENTS) if (typeof r[e] !== 'number') throw new Error(`${key} has no ${e} resistance`);
    return {
      key,
      name: names[key],
      resist: Object.fromEntries(ELEMENTS.map((e) => [e, r[e]])),
      freezeResist: r.freeze ?? 0,
    };
  })
  .sort((a, b) => a.name.replace(/^\W+/, '').localeCompare(b.name.replace(/^\W+/, '')));

// One enemy per line keeps the file small and easy to read in a diff.
const lines = enemies.map((e) => `  ${JSON.stringify(e)}`).join(',\n');
writeFileSync('data/enemies.json', `{\n "gcsimVersion": ${JSON.stringify(version)},\n "enemies": [\n${lines}\n ]\n}\n`);
console.log(`Wrote ${enemies.length} enemies from gcsim ${version} to data/enemies.json`);
