# Observed decisions: evidence separation and managed installation

Status: observed. The internal plans describe approved product direction and are not published; original coding-agent/model identities for historical changes are unknown.

## Why evidence categories stay separate

A hash binds a supplied artifact without authenticating its producer. Test candidates do not prove behavior until a recorded run exists. Source checks, package integrity, staged installation, host discovery, hook execution and user journeys establish different outcomes. Keep those limitations explicit when promoting a result.

## Installation ownership

The installer owns bounded markers in hand-written guidance, preserves everything outside them and refuses conflicting unmanaged guidance. This fixes stale installed-version labels without silently replacing user text. New documentation must not imply that installed files prove host discovery or that a passing package test proves a live user journey.

## Documentation and packaging

The package includes documentation and pins its payload digest. Preserve that gate by recomputing the existing digest when packaged files change; do not bypass it or invent a new release. Automatic monitoring may change only the digest declaration alongside generated docs, and must reject any other runtime edit. No release, real client installation or production-proof claim is made by this rollout.

## Revisit conditions

Revisit the convention when host discovery rules, package inputs, observer authenticity or evidence promotion changes. Older plan wording is historical context; the current source and later amendments decide active behavior. Independent agent review is unrun and remains an advisory gap for this ordinary documentation change.
