#!/usr/bin/env bash
# Builds gcsim's browser engine (WebAssembly) and puts it in public/gcsim/.
#
# Output:
#   public/gcsim/main.wasm      the gcsim simulator compiled for browsers
#   public/gcsim/wasm_exec.js   Go's JavaScript helper that runs main.wasm (must match the Go version)
#   public/gcsim/version.json   which gcsim tag/commit and Go version built it
#
# The gcsim version is pinned in gcsim-version.txt at the repository root.
# GitHub Actions runs this same script (see .github/workflows/build-gcsim-wasm.yml).
#
# Needs: git and Go. gcsim may require a newer Go than you have installed; with
# GOTOOLCHAIN=auto (set below) Go downloads the right version by itself.
#
# Environment variables (optional):
#   GCSIM_SRC  path to an existing gcsim checkout at the pinned tag (skips cloning)
#
# Patches in patches/ (characters gcsim doesn't have yet) are applied before building.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="$(tr -d '[:space:]' < "$repo_root/gcsim-version.txt")"
out="$repo_root/public/gcsim"
export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"

src="${GCSIM_SRC:-$repo_root/.cache/gcsim-$tag}"
if [ ! -d "$src/.git" ]; then
  echo "Cloning gcsim $tag into $src"
  git clone --quiet --depth 1 --branch "$tag" https://github.com/genshinsim/gcsim "$src"
fi

commit="$(git -C "$src" rev-parse HEAD)"

# Characters gcsim doesn't have yet, from unmerged gcsim pull requests: every patches/<name>.patch
# (see patches/README.md). If a patch no longer applies because gcsim now includes that character
# itself, it is skipped with a note.
#
# The copy of gcsim this script downloaded (.cache/) is put back to the clean tag first, so edited
# patches are applied fresh. A checkout passed in GCSIM_SRC is never reset: there, a patch that is
# already applied is left alone.
if [ -z "${GCSIM_SRC:-}" ]; then
  git -C "$src" checkout --quiet -- .
  git -C "$src" clean --quiet -fd
fi
patches=()
for patch in "$repo_root"/patches/*.patch; do
  [ -e "$patch" ] || continue
  name="$(basename "$patch" .patch)"
  if git -C "$src" apply --reverse --check "$patch" 2>/dev/null; then
    echo "Patch $name: already applied"
    patches+=("$name")
  elif git -C "$src" apply --check "$patch" 2>/dev/null; then
    git -C "$src" apply "$patch"
    echo "Patch $name: applied"
    patches+=("$name")
  elif [ -d "$src/internal/characters/$name" ]; then
    echo "Patch $name: skipped, gcsim $tag already includes $name. Delete patches/$name.patch and update data/characters.json."
  else
    echo "Patch $name doesn't apply to gcsim $tag, and gcsim doesn't include $name yet:" >&2
    git -C "$src" apply --check "$patch" >&2 || true
    echo "Update patches/$name.patch for this gcsim version (see patches/README.md)." >&2
    exit 1
  fi
done
patch_list="$(printf '"%s",' "${patches[@]+"${patches[@]}"}")"
patch_list="[${patch_list%,}]"

echo "Building gcsim $tag ($commit)${patches[*]+ with patches: ${patches[*]}}"

# This is the same command gcsim's own cmd/wasm/build.sh uses. go build also picks up
# cmd/wasm/default.pgo, a profile gcsim ships to make the engine faster.
(cd "$src/cmd/wasm" && GOOS=js GOARCH=wasm go build -trimpath -o main.wasm .)

# wasm_exec.js moved from misc/wasm to lib/wasm in Go 1.24; check both.
goroot="$(cd "$src" && go env GOROOT)"
go_version="$(cd "$src" && go env GOVERSION)"
wasm_exec=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [ -f "$candidate" ]; then wasm_exec="$candidate"; break; fi
done
if [ -z "$wasm_exec" ]; then
  echo "Could not find wasm_exec.js in $goroot" >&2
  exit 1
fi

mkdir -p "$out"
mv "$src/cmd/wasm/main.wasm" "$out/main.wasm"
cp "$wasm_exec" "$out/wasm_exec.js"
cat > "$out/version.json" <<EOF
{
  "gcsimTag": "$tag",
  "gcsimCommit": "$commit",
  "goVersion": "$go_version",
  "patches": $patch_list,
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Done: $(du -h "$out/main.wasm" | cut -f1) main.wasm, built with $go_version"
