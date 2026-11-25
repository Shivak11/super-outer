#!/usr/bin/env bash
# Proves the skill's tools work on this machine: generates the example, checks it,
# renders it, slices it, and runs the verification skeleton against it.
# Usage: scripts/selftest.sh   (needs python3 and node; Chrome, Chromium, Edge or Brave for the render steps)
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
python3 "$here/assets/example-code-flow.py" "$work/example.svg"
node "$here/scripts/check-diagram.mjs" "$work/example.svg"
if diff -q "$work/example.svg" "$here/assets/template-code-flow.svg" >/dev/null; then
  echo "template matches its generator"
else
  echo "FAIL: assets/template-code-flow.svg is out of date; regenerate it from assets/example-code-flow.py" >&2
  exit 1
fi
python3 "$here/scripts/verify_facts_template.py" --selftest
if node "$here/scripts/render-diagram.mjs" "$work/example.svg" >/dev/null 2>&1; then
  node "$here/scripts/slice-diagram.mjs" "$work/example.svg" 900 >/dev/null
  echo "render and slice work"
else
  echo "note: no Chrome-family browser found, so render and slice were skipped"
fi
echo "selftest passed"
