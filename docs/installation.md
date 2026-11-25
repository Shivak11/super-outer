# Installation and recovery

## Switching Super-outer on

From a clone of this repository:

```sh
npm run setup
```

This builds the developer package, unpacks it, and installs Super-outer for
whichever of Claude Code and Codex is present. It writes `~/.claude` and
`~/.codex`, and it is the supported way to switch Super-outer on. Use
`npm run setup:verify` to report the installed state and
`npm run setup:rollback` to restore everything the install changed.

Do not use `super-outer install` for this. That command stages a copy in a
temporary directory to prove safe copying, and refuses your real home on
purpose. It is a verification tool, not an installer, and it never switches
anything on. The refusal message it prints is the tool working correctly.

The same package can be handed to someone without a clone. `node
developer-update/build.mjs` writes a zip under `dist/developer-update/`; the
recipient unzips it and double-clicks `Install Super-outer.command` on macOS.
Both routes install the identical artifact and carry identical proof.

## Choosing the optional part

The package also carries one optional plugin: `super-outer-learning`, with the
Brief me and Meditate skills for Claude Code and Codex. The `.command` file
asks whether to install it. From a clone, pass `--components skills` or `none`
after `npm run setup --`. A first install with no choice brings it. The choice
is saved in `~/.super-outer/components.json`; an update with no choice keeps
it, and rollback restores the file as it was. A part that is no longer chosen
loses only the copy this package installed.

## Switching Jev on or off

Installing never switches Jev on and never sends anything to OpenRouter. Jev
reads typed requests only after its owner places a key for Super-outer:

```sh
mkdir -p ~/.config/super-outer && touch ~/.config/super-outer/jev.env && chmod 600 ~/.config/super-outer/jev.env
```

Then add the line `SUPER_OUTER_OPENROUTER_KEY=` followed by the key to that file
in a text editor. The file may also hold `SUPER_OUTER_JEV=off`, which returns
every route to the word lists and stops the reminder, and
`SUPER_OUTER_JEV_RECORD=on`, which keeps the private record described in
`skills/super-outer/references/jev-routing.md`. The same names work as
environment variables, and the environment wins. Super-outer refuses a key file
that other people on the computer can read. `super-outer jev status` reports
what is switched on without printing the key.

## Verification staging

Before you promote a build, run exact-version source
checks and record the independent review result. For QUICK, FOCUSED, and FULL,
a review concern is advisory and remains visible. A CRITICAL or explicit
production-delivery claim still requires independent PASS and live remote
checks for the exact version.

## Safe preparation

`super-outer install` stages the source in an explicit temporary home by
default. This proves safe copying and repeatability. It does not claim that
Claude Code or Codex discovered or ran the plugin.

Promotion requires a native adapter to prove both hosts independently. The
adapter uses Claude Code's marketplace and plugin commands, and Codex's personal
marketplace and plugin commands. It records command outcomes as hashes without
copying authentication data into evidence.

The temporary home deliberately does not copy either host's account session.
Super-outer therefore records two separate results: whether each host completed
the installed hook, and whether each host could also obtain a model response.
A known “not logged in” response may limit the second result, but it cannot turn
a missing or partly executed hook into a pass.

The adapter also installs Super-outer's three review roles in Codex's native
`agents` directory. It preserves unrelated roles, refuses to overwrite an
unmanaged same-name role, verifies the installed role hashes, and includes the
entire prior Codex configuration in transactional rollback.

Discovery requires an enabled Super-outer v4 listing. Hook completion is bound
to the activation, staged source digest, and plugin version. Authentication,
transport, provider, and executable failures remain distinct; only a narrowly
matched missing-account outcome may be recorded as a model-response limitation
instead of a plugin failure.

## Earlier OUTER versions

Before promotion, Super-outer inventories OUTER 2.1 and v3 and writes separate,
hash-verified archives under `~/.super-outer/legacy-archives/`. Promotion changes
the owner to v4 only after both hosts prove discovery and hook execution. It then
moves the retained 2.1 and v3 skill copies out of Claude and Codex discovery and
removes v3's active hooks and global approval instructions. The files are not
deleted and remain available for exact recovery.

The `/outer` command is changed to point to Super-outer only during a successful
promotion. The Claude/Codex developer-upgrade package still does not touch
Cursor; use `node scripts/install-cursor.mjs` for the separate Cursor host
install.

## Cursor host

Install native Cursor hooks without changing Claude or Codex:

```sh
npm run install:cursor
```

This stages `~/.super-outer/cursor-runtime`, installs
`~/.cursor/hooks/super-outer-bridge.mjs`, and merges Super-outer entries into
`~/.cursor/hooks.json`. Restart Cursor afterward. Details live in
`adapters/cursor/README.md`.

Cursor can also load the existing Claude Code hooks from `~/.claude/settings.json`
when third-party hooks are enabled; the native adapter is the supported path.

Installation is transactional. If copying, host discovery, hook execution, v3
containment, or final verification fails, every recorded target is restored.
Rollback is repeatable and returns a versioned result showing what was restored
and whether v4 remains active.

`super-outer install --promote` deliberately refuses a real user-home
promotion. That staged promotion path remains a later, separately authorised
step after clean exact-head, cross-host, and rollback proof. It is a different
thing from `npm run setup`, which installs the reviewed package through each
host's own plugin commands and is the supported route today. Missing CI or a
review concern is reported for ordinary installation; it becomes blocking only
at the CRITICAL or explicit production-delivery boundary.
