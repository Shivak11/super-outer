#!/bin/zsh
set -u

bundle_dir="${0:A:h}"
saved_choice="$HOME/.super-outer/components.json"
clear
print "SUPER-OUTER v__SUPER_OUTER_VERSION__ — DEVELOPER UPDATE"
print ""
print "This will install Super-outer globally for Claude Code and Codex where present."
print "OUTER 2.1 and v3 will be deactivated and backed up, not deleted."
print "Cursor will not be touched."
print ""
print "Super-outer can also install one optional part:"
print "  1) Learning skills: Brief me and Meditate, for Claude Code and Codex"
print "  2) No optional part"
if [[ -f "$saved_choice" ]]; then
  read "choice?Choose 1 or 2, or press Return to keep your current choice: "
else
  read "choice?Choose 1 or 2 (press Return for 1): "
fi
case "$choice" in
  1) components=(--components skills) ;;
  2) components=(--components none) ;;
  "")
    if [[ -f "$saved_choice" ]]; then components=(); else components=(--components skills); fi
    ;;
  *)
    print "That was not 1 or 2. Nothing changed."
    read -k 1 "?Press any key to close."
    print ""
    exit 0
    ;;
esac
print ""
read "reply?Continue? Type YES: "
if [[ "$reply" != "YES" ]]; then
  print "Nothing changed."
  read -k 1 "?Press any key to close."
  print ""
  exit 0
fi

node "$bundle_dir/runtime/developer-upgrade.mjs" install --bundle "$bundle_dir" --yes "${components[@]}"
status=$?
print ""
if [[ $status -eq 0 ]]; then
  print "Done. Restart Claude Code and Codex before the next task."
else
  print "The update did not complete. The installer restored the prior managed state."
fi
read -k 1 "?Press any key to close."
print ""
exit $status
