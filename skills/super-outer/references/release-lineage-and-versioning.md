# Release lineage and versioning

Before choosing a base or version, read the enabled copy's resolved path,
version and available source identity for every target client, then compare
them with trunk and the candidate. Follow the client's actual registration;
the newest cache directory alone does not prove which copy is enabled.

If an enabled copy contains newer or divergent work, identify its source branch
and preserve those changes. Obtain the owner's base decision when existing
approval does not settle it. Treat unknown provenance as unproved; do not
silently downgrade a client to make a fix installable.

Integrate the release through the repository's normal pull request flow before
installation. If the owner explicitly approves installing a branch first, open
its pull request into trunk the same day and record the pending merge.
Installation never proves integration.

Bump versions through an explicit stamp allowlist derived from
`tests/version-consistency.test.mjs` and the current manifests. Inspect each
additional occurrence before changing it. Review the bump-only diff: every
changed line must be a known version stamp. Preserve historical versions in
comments, tests and dated records. Run version consistency after the final
edits and regenerate any source digest through the repository's command.

When parallel sessions share the repository, the next version number is a
shared resource. A sibling worktree with no version change today can still
release tomorrow under the number you chose. Reserve the number where the
siblings read, such as the orchestrating session or the session notes, or
leave the number to the merge step, where the second pull request to merge
takes the next number.
