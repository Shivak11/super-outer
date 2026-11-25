#!/bin/zsh
set -u

bundle_dir="${0:A:h}"
clear
print "SUPER-OUTER v__SUPER_OUTER_VERSION__ — VERIFY"
print ""
node "$bundle_dir/runtime/developer-upgrade.mjs" verify --bundle "$bundle_dir"
status=$?
print ""
read -k 1 "?Press any key to close."
print ""
exit $status
