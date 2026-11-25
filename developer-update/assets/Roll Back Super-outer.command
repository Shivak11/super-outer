#!/bin/zsh
set -u

bundle_dir="${0:A:h}"
clear
print "SUPER-OUTER v__SUPER_OUTER_VERSION__ — ROLL BACK"
print ""
print "This restores the managed Claude Code and Codex files from before the latest update."
print "The separate OUTER 2.1 and v3 recovery archives will remain available."
print ""
read "reply?Continue? Type ROLLBACK: "
if [[ "$reply" != "ROLLBACK" ]]; then
  print "Nothing changed."
  read -k 1 "?Press any key to close."
  print ""
  exit 0
fi

node "$bundle_dir/runtime/developer-upgrade.mjs" rollback --bundle "$bundle_dir" --yes
status=$?
print ""
read -k 1 "?Press any key to close."
print ""
exit $status
