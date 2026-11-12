# Data pipeline scripts

These scripts produced the files in `data/`. They were written as one-off tools during prototyping, so they use flat relative paths (for example `raw.json` in the working directory, `../raw.json` from the Node scripts) and should be tidied into a proper pipeline (one command, paths under `data/`) before being relied on. The logic is the valuable part.

## Order of operations

1. `export_game_data.js` (Node, needs `npm install genshin-db@5.2.15`) exports characters with stats at every level breakpoint, talent labels and parameters, and weapons with stat curves to `raw.json`. Aether, Lumine and Manekin(a) are dropped and replaced by seven `Traveler (<Element>)` entries.
2. `parse.py` turns talent labels such as `5-Hit DMG|{param5:F1P}+{param6:F1P}` into scaling stat(s), per-level multipliers, hit counts and flat additions. Output: `talents.json`. Status values are `OK`, `Non-damage value` (cooldowns, durations, costs) and `Special` (per-stack, Bond of Life, percent of another attack; needs manual handling).
3. `export_buff_text.js` exports weapon passive templates with R1 to R5 values, artifact set texts, and every character passive and constellation text to `buffsrc.json`.
4. `bparse.py` is the text parser that turns descriptions into buff rows (stat, attack-type filter, element filter, target, basis stat, values, stacks, default always-on). `blib.py` runs it over everything and writes `lib_auto.json` plus a review list of texts it could not convert.
5. `manual.py` holds hand-checked overrides keyed by (owner, item) and the talent-scaled team buffs (Bennett Q, Sara E, Furina Q, Shenhe E and so on). Manual rows replace auto rows for the same item.
6. `final_lib.py` merges auto rows, manual rows and talent buffs, maps every C3/C5 constellation to the talent it boosts, and writes `lib_final.json` (published as `data/buffs.json`).
7. `keymap.py` maps names to gcsim keys using gcsim's `pkg/shortcut/*.dm.go` alias tables (gcsim source must be downloaded first). Published as `data/gcsim_keys.json`.

## Known parser weaknesses

Spot checks put auto-parsed buffs at roughly three quarters fully correct. Typical errors are a wrong attack-type filter, a wrong target (a condition clause read as the recipient), and unusual phrasing such as "per 1,000 ATK", "increased to X%" or "the aforementioned bonus". Rows with unusual phrasing are tagged `Check`. Extra damage instances ("deals DMG equal to X% of ATK") are deliberately excluded because they are hits, not buffs. Lunar reaction wording is excluded.
