# Patches: characters gcsim doesn't include yet

Each `<character>.patch` here adds one character to gcsim, from an **unmerged gcsim pull request**,
sometimes with small fixes from this project. They are experimental: gcsim's maintainers haven't
reviewed or accepted the code, so results may not match the game. The app marks these characters
"Experimental", and gcsim itself flags them as incomplete in every result.

| Patch | Character | Source |
| --- | --- | --- |
| `linnea.patch` | Linnea | [genshinsim/gcsim#2596](https://github.com/genshinsim/gcsim/pull/2596) at 0e439a5, plus three timing fixes (see the top of the file) |
| `nefer.patch` | Nefer | [genshinsim/gcsim#3045](https://github.com/genshinsim/gcsim/pull/3045) at 4932d0e, moved onto v2.50.0 after `linnea.patch`, plus fixes: plunge removed, N4 length, burst energy timing, burst Veil bonus, no Slither movement, marked incomplete (see the top of the file) |
| `vodyanitsa.patch` | Vodyanitsa | [genshinsim/gcsim#3274](https://github.com/genshinsim/gcsim/pull/3274) by a gcsim maintainer, at 5fb8aa6 (based on v2.50.0), applied after `nefer.patch`, plus: its Stellar Swirl timing change only in teams with her (other teams unchanged), marked incomplete (see the top of the file) |

## How they're used

`scripts/build-gcsim.sh` applies every patch here, in name order, to the pinned gcsim version before
building the engine, both locally (`npm run engine`) and on GitHub Actions. The gcsim copy it
downloads into `.cache/` is reset to the clean tag first, so edited patches apply fresh. For each patch it:

- **applies it** if it applies cleanly;
- **leaves it** if it's already applied (only in a checkout you pass in `GCSIM_SRC`, which is never reset);
- **skips it**, with a note, if gcsim now includes that character itself (the patch no longer
  applies and `internal/characters/<name>` exists). Then delete the patch and remove
  `gcsim_patch` from the character in `data/characters.json`;
- **stops the build** otherwise, so a patch that no longer fits a new gcsim version is noticed.

The engine's `version.json` lists the patches it was built with.

## Adding or updating a patch

1. Get the pull request's code on top of the pinned gcsim tag (rebase it if it's based on another
   version), make any fixes, and check gcsim's own tests pass:
   `go test ./internal/tests/abilities/ ./internal/tests/frames_func/ ./pkg/...`
2. Write the patch: a short header explaining the source and every change made here, then
   `git diff <gcsim tag> <branch> -- . ':(exclude)ui'` (the website files aren't needed).
3. In `data/characters.json`, set the character's `gcsim_key` and `"gcsim_patch": "<name>"`, and add
   them to `data/gcsim_keys.json`.
4. Run `npm run engine` and `npm test` (the engine tests simulate patched characters).

If two patches ever change the same lines of gcsim's shared lists (`pkg/shortcut`, `pkg/core/keys`,
`pkg/catalog`…), make the second patch on top of the first so they apply in name order.
