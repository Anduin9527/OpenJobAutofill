#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
UPDATER="$PROJECT_ROOT/scripts/Update-OpenJobAutofill.command"
WINDOWS_UPDATER="$PROJECT_ROOT/scripts/Update-OpenJobAutofill.ps1"
WINDOWS_LAUNCHER="$PROJECT_ROOT/scripts/Update-OpenJobAutofill.cmd"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ojaf-updater-test.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

REMOTE="$TEMP_ROOT/remote.git"
SEED="$TEMP_ROOT/seed"
CLIENT="$TEMP_ROOT/client"

git init --bare --initial-branch=main "$REMOTE" >/dev/null
git init -b main "$SEED" >/dev/null
git -C "$SEED" config user.email "test@example.invalid"
git -C "$SEED" config user.name "OpenJobAutofill updater test"
git -C "$SEED" config commit.gpgsign false
mkdir -p "$SEED/scripts"
cp "$UPDATER" "$SEED/scripts/Update-OpenJobAutofill.command"
printf '{\n  "manifest_version": 3,\n  "version": "1.0.0"\n}\n' > "$SEED/manifest.json"
git -C "$SEED" add manifest.json scripts/Update-OpenJobAutofill.command
git -C "$SEED" commit -m "initial" >/dev/null
git -C "$SEED" remote add origin "$REMOTE"
git -C "$SEED" push -u origin main >/dev/null

git clone --branch main "$REMOTE" "$CLIENT" >/dev/null

printf '{\n  "manifest_version": 3,\n  "version": "1.1.0"\n}\n' > "$SEED/manifest.json"
git -C "$SEED" add manifest.json
git -C "$SEED" commit -m "release 1.1.0" >/dev/null
git -C "$SEED" push origin main >/dev/null

OJAF_SKIP_OPEN_EXTENSIONS=1 OJAF_NO_PAUSE=1 "$CLIENT/scripts/Update-OpenJobAutofill.command" >/dev/null
test "$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$CLIENT/manifest.json")" = "1.1.0"

printf 'local-only\n' > "$CLIENT/uncommitted.txt"
printf '{\n  "manifest_version": 3,\n  "version": "1.2.0"\n}\n' > "$SEED/manifest.json"
git -C "$SEED" add manifest.json
git -C "$SEED" commit -m "release 1.2.0" >/dev/null
git -C "$SEED" push origin main >/dev/null

if OJAF_SKIP_OPEN_EXTENSIONS=1 OJAF_NO_PAUSE=1 "$CLIENT/scripts/Update-OpenJobAutofill.command" >/dev/null 2>&1; then
  echo "updater unexpectedly accepted a dirty worktree" >&2
  exit 1
fi
test "$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$CLIENT/manifest.json")" = "1.1.0"
test -f "$CLIENT/uncommitted.txt"

grep -q 'pull", "--ff-only"' "$WINDOWS_UPDATER"
grep -q 'status --porcelain --untracked-files=normal' "$WINDOWS_UPDATER"
grep -q 'ExecutionPolicy Bypass' "$WINDOWS_LAUNCHER"
if grep -Eqi 'git[[:space:]]+(reset|clean)|git[[:space:]]+stash|Remove-Item' "$UPDATER" "$WINDOWS_UPDATER" "$WINDOWS_LAUNCHER"; then
  echo "updaters must not contain destructive or implicit-stash commands" >&2
  exit 1
fi

echo "local updater smoke test passed"
