# Package, installation, and runtime

## Load boundary

Load for package build, checksums, install/upgrade, isolated homes, host
discovery, hook execution, launch, or runtime activation.

## Review

- Before choosing a base or bumping versions, follow
  [release lineage and versioning](../../../references/release-lineage-and-versioning.md).
- Build twice from clean equivalent inputs with stable ordering, metadata, modes,
  timestamps, and exclusions; compare bytes and checksums.
- Install only in a temporary home first. Verify repeated install, interrupted
  write recovery, corrupt package rejection, settings coexistence, and identity.
- Prove separately: files installed, host discovered plugin, hooks executed,
  runtime launched, and direct journey worked.
- For a module loaded at run time or a quiet fallback, run the staged copy and
  show a signal only the new code produces.

## Failure probes and proof

Positive: two packages match and isolated discovery works. Negative: corrupt,
partial, conflicting, or repeated install leaves the prior state recoverable.
Boundary: launch is not feature proof. macOS is the primary supported platform
and Linux is the secondary CI platform for v6.6.0. Windows is not supported in
this release. Test both Claude/Codex adapters where applicable.

## Recovery

Stop activation, restore the exact atomic snapshot, remove only task-owned
temporary artifacts, and verify prior host settings and behavior.
