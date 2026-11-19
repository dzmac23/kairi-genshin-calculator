// Reads rotation rules from gcsim's character code into data/gcsim_rules.json, for the live checks
// on the Rotation screen (src/rotation/checks.ts). Run after `npm run engine` (which puts gcsim, with
// patches/ applied, in .cache/), and again after every gcsim upgrade:
//
//   node scripts/export_character_rules.mjs
//
// For each gcsim character:
//   normals  how many hits their Normal Attack combo has (gcsim's normalHitNum). After the last hit
//            the combo starts again. gcsim resets every combo after any action that isn't a Normal
//            Attack, and on swap (pkg/core/player/exec.go, player.go).
//   charge   when a Charged Attack is allowed (from NextQueueItemIsValid, or gcsim's default rule
//            for swords and polearms in internal/template/character/character.go):
//            "mid-combo"       only right after a Normal Attack of an unfinished combo
//            "not-after-full"  any time except right after the last hit of a full combo
//            "after-attack"    only right after a Normal Attack
//            "free"            any time

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const version = readFileSync('gcsim-version.txt', 'utf8').trim();
const dir = `.cache/gcsim-${version}/internal/characters`;
const characters = JSON.parse(readFileSync('data/characters.json', 'utf8'));
const weaponOf = new Map(characters.filter((c) => c.gcsim_key).map((c) => [c.gcsim_key, c.weapon_type]));

const source = (folder) =>
  readdirSync(`${dir}/${folder}`)
    .filter((f) => f.endsWith('.go') && !f.startsWith('zz_') && !f.endsWith('_test.go'))
    .map((f) => readFileSync(`${dir}/${folder}/${f}`, 'utf8'))
    .join('\n');

function chargeRule(src, weapon) {
  const m = src.match(/func \(c \*\w+\) NextQueueItemIsValid\([^)]*\) error \{([\s\S]*?)\n\}/);
  const body = m?.[1] ?? '';
  const swordOrPolearm = weapon === 'Sword' || weapon === 'Polearm';
  if (/ActionCharge\s*\{\s*(\/\/[^\n]*\n\s*)*return nil/.test(body)) return 'free';
  if (/ActionCharge && c\.Core\.Player\.LastAction\.Type != action\.ActionAttack/.test(body)) return 'after-attack';
  if (/ActionCharge[\s\S]{0,120}LastAction\.Type == action\.ActionAttack[\s\S]{0,80}NormalCounter == 0/.test(body)) return 'not-after-full';
  if (/ActionCharge\s*&&\s*c\.NormalCounter == 0/.test(body)) return 'mid-combo';
  if (/ActionCharge[\s\S]{0,200}WeaponClassSword, info\.WeaponClassSpear[\s\S]{0,80}NormalCounter == 0/.test(body)) return 'mid-combo';
  // Otherwise gcsim's default: swords and polearms need an unfinished combo; everyone else is free.
  return swordOrPolearm ? 'mid-combo' : 'free';
}

// gcsim's folder names differ from its character keys for some characters (raiden ->
// raidenshogun): the key comes from the RegisterCharFunc line (in the generated zz_ file).
const registered = (path) =>
  readdirSync(path)
    .filter((f) => f.endsWith('.go'))
    .flatMap((f) => [...readFileSync(`${path}/${f}`, 'utf8').matchAll(/core\.RegisterCharFunc\(keys\.(\w+),/g)].map((m) => m[1].toLowerCase()));

const rules = {};
const add = (keys, src) => {
  const constant = src.match(/normalHitNum\s*=\s*(\d+)/);
  const normals = constant ? Number(constant[1]) : (src.match(/attackHitmarks\s*=\s*\[\]int\{([^}]*)\}/)?.[1].split(',').filter((x) => x.trim()).length ?? null);
  for (const key of keys) rules[key] = { normals, charge: chargeRule(src, weaponOf.get(key)) };
};
for (const folder of readdirSync(dir).sort()) {
  if (!statSync(`${dir}/${folder}`).isDirectory()) continue;
  if (folder === 'traveler') {
    // traveler/<element>/{aether,lumine} register the characters; the code is in traveler/common/<element>.
    for (const element of readdirSync(`${dir}/traveler`).filter((e) => e !== 'common')) {
      const keys = readdirSync(`${dir}/traveler/${element}`).flatMap((sub) => registered(`${dir}/traveler/${element}/${sub}`));
      add(keys, source(`traveler/common/${element}`));
    }
    continue;
  }
  const src = source(folder);
  if (!src.includes('func (c *char)')) continue;
  add(registered(`${dir}/${folder}`), src);
}
const known = Object.keys(rules).filter((k) => weaponOf.has(k));
writeFileSync('data/gcsim_rules.json', JSON.stringify({ gcsimVersion: version, characters: Object.fromEntries(known.sort().map((k) => [k, rules[k]])) }, null, 1) + '\n');
console.log(`Wrote rules for ${known.length} characters from gcsim ${version} to data/gcsim_rules.json`);
const missing = [...weaponOf.keys()].filter((k) => !rules[k]);
if (missing.length) console.log('No gcsim folder found for:', missing.join(', '));
