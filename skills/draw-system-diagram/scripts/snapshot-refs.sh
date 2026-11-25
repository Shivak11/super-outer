#!/usr/bin/env bash
# Read code from a git ref without touching your checkout or local branches.
# Usage: snapshot-refs.sh <repo-dir> <ref> <out-dir> [path ...]
# Example: snapshot-refs.sh ~/code/backend origin/main /tmp/scratch/be-main api controllers workers utils
#
# Why: a checkout is often on a stale feature branch or has unrelated edits, so
# reading it describes code nobody runs. Read the refs that are live (main) and
# upcoming (staging) instead.
#
# What it changes: nothing in the working tree, the index or any local branch.
# For an origin/* ref it first runs `git fetch`, which needs the network and
# updates that remote-tracking ref and the repository's .git directory
# (FETCH_HEAD, reflog, objects). Set SNAPSHOT_NO_FETCH=1 to skip the fetch and
# read what was fetched last. It then writes only into <out-dir>, which must be
# outside the repository.
set -euo pipefail
if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <repo-dir> <ref> <out-dir> [path ...]" >&2
  exit 2
fi
repo="$1"; ref="$2"; out="$3"; shift 3
top="$(git -C "$repo" rev-parse --show-toplevel)"
case "$out" in /*) out_abs="$out" ;; *) out_abs="$PWD/$out" ;; esac
case "$out_abs/" in
  "$top"/*) echo "refusing: <out-dir> ($out_abs) is inside the repository ($top); pick a scratch folder" >&2; exit 2 ;;
esac
case "$ref" in
  origin/*)
    if [ -z "${SNAPSHOT_NO_FETCH:-}" ]; then
      git -C "$repo" fetch origin "${ref#origin/}" --quiet || echo "note: fetch failed, using the last fetched $ref" >&2
    fi ;;
esac
mkdir -p "$out"
if [ "$#" -gt 0 ]; then
  git -C "$repo" archive "$ref" -- "$@" | tar -x -C "$out"
else
  git -C "$repo" archive "$ref" | tar -x -C "$out"
fi
echo "$ref: $(git -C "$repo" log -1 --format='%h %ad %s' --date=short "$ref")"
echo "snapshot written to $out"
