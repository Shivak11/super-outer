#!/usr/bin/env python3
"""Skeleton for the script that proves a diagram's claims against the code.

Copy it next to your generator, fill in the checks, run it every time the
diagram or the code changes. It reads the SVG's facts block, then compares each
fact with the source text of the refs you name (snapshots from snapshot-refs.sh,
or `git show <ref>:<path>`). A claim with no check is unproved; say so in the report.

    python3 verify_facts.py diagram.svg --main /tmp/scratch/be-main --staging /tmp/scratch/be-staging
    python3 verify_facts.py --selftest      # checks this file against the shipped template

Exit code 0 only when every check passes.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

failures: list[str] = []


def check(name: str, condition: bool) -> None:
    """Print one line per claim. FAIL lines are the redraw list."""
    print(("ok   " if condition else "FAIL ") + name)
    if not condition:
        failures.append(name)


def facts_of(svg_path: Path) -> dict:
    text = svg_path.read_text(encoding="utf-8")
    block = re.search(r'<metadata id="(?:diagram|architecture)-facts">(.*?)</metadata>', text, re.S)
    if not block:
        sys.exit(f"{svg_path}: no diagram-facts block")
    return json.loads(block.group(1))


def read(root: Path, rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


def git_show(repo: str, ref: str, path: str) -> str:
    """Text of one file at a ref, for repos you did not snapshot (an app repo, for example)."""
    out = subprocess.run(
        ["git", "-C", repo, "show", f"{ref}:{path}"], capture_output=True, text=True
    )
    return out.stdout


def function_exists(source: str, name: str) -> bool:
    return (
        re.search(
            rf"\bdef {re.escape(name)}\b|\bfunction {re.escape(name)}\b|\b{re.escape(name)}\s*[=(]",
            source,
        )
        is not None
    )


def run_checks(facts: dict, main: Path | None, staging: Path | None) -> None:
    # ---- replace these with real checks, one per claim in the facts block --------------
    # Constants: assert the literal in the source, then compare it to the fact.
    #   check("job timeout", "timeout = 600" in read(main, "workers/export.py") and facts["jobTimeoutSeconds"] == 600)
    # Order of steps: find each call's position in the function body and require ascending order.
    #   body = read(main, "workers/export.py"); pos = [body.find(s) for s in ("load(", "render(", "send(")]
    #   check("steps run in order", all(p >= 0 for p in pos) and pos == sorted(pos))
    # Parallelism: require the primitive (gather, Semaphore(n), a thread pool) or its absence.
    #   check("render runs two at once", "Semaphore(2)" in read(main, "workers/export.py"))
    # Live versus staging: the dashed parts must be absent on main and present on staging.
    #   check("mail service not on main", not (main / "services/mail.py").exists())
    # Function names printed as code pointers: they must exist.
    #   for fn in facts.get("functions", []): check("function exists: " + fn, function_exists(read(main, "x.py"), fn))
    if main is None:
        print("note: no --main snapshot given, so no source checks ran")


def selftest() -> int:
    template = (
        Path(__file__).resolve().parent.parent
        / "assets"
        / "template-code-flow.svg"
    )
    if not template.exists():
        print(f"selftest: {template} is missing; run assets/example-code-flow.py first")
        return 1
    facts = facts_of(template)
    check(
        "template facts parse", isinstance(facts, dict) and facts.get("example") is True
    )
    check("template names its route", facts.get("route") == "POST /orders/{id}/export")
    check(
        "template marks the mail step as not deployed",
        facts.get("sendEmail", {}).get("deployed") is False,
    )
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("svg", nargs="?")
    ap.add_argument("--main", type=Path)
    ap.add_argument("--staging", type=Path)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.svg:
        ap.error("give the SVG path, or --selftest")
    run_checks(facts_of(Path(args.svg)), args.main, args.staging)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
