# Patches: characters and weapons gcsim doesn't include yet

Each `<name>.patch` here adds one character or weapon to gcsim, from an **unmerged gcsim pull
request**, sometimes with small fixes from this project. They are experimental: gcsim's maintainers
haven't reviewed or accepted the code, so results may not match the game. The app marks them
"Experimental" (pickers, slot and team check); for characters, gcsim also flags them as incomplete
in every result (gcsim has no such flag for weapons).

| Patch | Character | Source |
| --- | --- | --- |
| `linnea.patch` | Linnea | [genshinsim/gcsim#2596](https://github.com/genshinsim/gcsim/pull/2596) at 0e439a5, plus three timing fixes (see the top of the file) |
| `nefer.patch` | Nefer | [genshinsim/gcsim#3045](https://github.com/genshinsim/gcsim/pull/3045) at 4932d0e, moved onto v2.50.0 after `linnea.patch`, plus fixes: plunge removed, N4 length, burst energy timing, burst Veil bonus, no Slither movement, marked incomplete (see the top of the file) |
| `hymn.patch` | Hymn of the Maelstrom (5★ catalyst) | [genshinsim/gcsim#3282](https://github.com/genshinsim/gcsim/pull/3282) at fbea026 (based on gcsim main after #3279): only the weapon, plus a fix: its Max HP and ATK buffs shared one stat array, so each also added the other's bonus (see the top of the file) |
| `starsealed.patch` | Starsealed Edict (5★ catalyst) | [genshinsim/gcsim#3279](https://github.com/genshinsim/gcsim/pull/3279) at 2b3320f (based on v2.50.0): only the weapon, without three unrelated gcsim fixes on that branch (see the top of the file). **Merged into gcsim main on 2026-11-20**: delete this patch when moving to the next gcsim release |
| `vodyanitsa.patch` | Vodyanitsa | [genshinsim/gcsim#3274](https://github.com/genshinsim/gcsim/pull/3274) by a gcsim maintainer, at 5fb8aa6 (based on v2.50.0), applied after `nefer.patch`, plus: its Stellar Swirl timing change only in teams with her (other teams unchanged), marked incomplete (see the top of the file) |

### Engine additions

| Patch | What it adds | Why |
| --- | --- | --- |
| `wasm-energy.patch` | `energyNeeded(config, seed)` in the browser engine (`cmd/wasm/main.go`): one fight with gcsim's `ignore_burst_energy`, returning for every burst the particle energy before Energy Recharge, flat energy (both by source), the burst's cost and the character's ER | The Setup screen's Energy Recharge targets (`src/energy`). It measures energy the way gcsim's substat optimizer does (`pkg/optimization/optstats/energy_stats.go`), but per burst and fast enough to update live (gcsim's replay logs are about 50 times slower). It doesn't change anything else in the engine. |

## How they're used

`scripts/build-gcsim.sh` applies every patch here, in name order, to the pinned gcsim version before
building the engine, both locally (`npm run engine`) and on GitHub Actions. The gcsim copy it
downloads into `.cache/` is reset to the clean tag first, so edited patches apply fresh. For each patch it:

- **applies it** if it applies cleanly;
- **leaves it** if it's already applied (only in a checkout you pass in `GCSIM_SRC`, which is never reset);
- **skips it**, with a note, if gcsim now includes that character or weapon itself (the patch no
  longer applies and the folder it adds, such as `internal/characters/<name>` or
  `internal/weapons/<type>/<name>`, exists). Then delete the patch and remove `gcsim_patch` from
  `data/characters.json` or `data/weapons.json`;
- **stops the build** otherwise, so a patch that no longer fits a new gcsim version is noticed.

The engine's `version.json` lists the patches it was built with.

## Adding or updating a patch

1. Get the pull request's code on top of the pinned gcsim tag (rebase it if it's based on another
   version), make any fixes, and check gcsim's own tests pass:
   `go test ./internal/tests/abilities/ ./internal/tests/frames_func/ ./pkg/...`
2. Write the patch: a short header explaining the source and every change made here, then
   `git diff <gcsim tag> <branch> -- . ':(exclude)ui'` (the website files aren't needed).
3. In `data/characters.json` (or `data/weapons.json`), set its `gcsim_key` and
   `"gcsim_patch": "<name>"`, and add it to `data/gcsim_keys.json`.
4. Run `npm run engine` and `npm test` (the engine tests simulate patched characters and weapons).

If two patches ever change the same lines of gcsim's shared lists (`pkg/shortcut`, `pkg/core/keys`,
`pkg/catalog`…), make the second patch on top of the first so they apply in name order.
