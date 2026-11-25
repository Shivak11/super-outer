# Git topology and CI

## Load boundary

Load for branches, worktrees, commits, PRs, merges, stacked work, CI, or an
exact-head delivery claim.

## Review

- Compute repository root, worktree identity, branch, intended base, merge-base,
  head, ahead/behind, commit set, changed/renamed/deleted files, and dirty state.
- Compare declared and actual PR target, predecessor/superseding work, reviewed
  head, and terminal CI SHA. Do not repair divergence by widening the diff.
- Audit full status and staged paths; preserve unrelated work.
- Before a first publish to a new repository or remote, check the acting
  account (`gh auth status`) against the target owner, and finish local
  preparation first: secret scan of full history, tests, commit. If the host
  refuses the outward step, give the owner the exact commands; never retry
  through another tool or credential.

## Failure probes and proof

Positive: expected bounded diff and terminal CI match the exact head. Negative:
wrong base, stale CI, dirty state, unexpected deletion, or stacked dependency
stops delivery. Boundary: local source proof can pass while delivery remains
unproved. Test rename/delete, merge commit, stale head, and worktree mismatch.

## Recovery

Stop push/merge, preserve snapshots, recreate/transplant the smallest verified
change from the correct base, and rerun topology plus exact-head CI.
