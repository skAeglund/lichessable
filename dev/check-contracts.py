#!/usr/bin/env python3
"""Contract-surface check for CLAUDE.md.

CLAUDE.md is loaded into every Claude Code session; the design docs are not.
So CLAUDE.md's job is NOT to explain a feature — it is to stop an edit made
somewhere ELSE breaking one. The names by which one section reaches into
another are exactly that risk surface, and they must never be condensed away.

The codebase has one idiom for those: a module-level

    let someBridge = null;

declared near the top of `content/lichessable.js` and assigned by the owning
section's init function. This script discovers every one of them and asserts
each is named in CLAUDE.md.

It also checks the reverse direction: a bridge documented in CLAUDE.md that no
longer exists in the code is a stale contract, which is worse than an
undocumented one — it describes a seam that is not there.

Run after any CLAUDE.md condensation:

    py dev/check-contracts.py

Exit code 0 = pass, 1 = fail. No dependencies; there is no Node on this
machine, hence Python rather than a JS harness.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "content", "lichessable.js")
DOC = os.path.join(ROOT, "CLAUDE.md")

# The bridge idiom: two-space indent, module scope, explicitly nulled.
BRIDGE_RE = re.compile(r"^  let ([A-Za-z_][A-Za-z0-9_]*) = null;$", re.M)

# Bridges that are genuinely internal plumbing rather than a cross-section
# contract. Keep this list SHORT and justify every entry — an exemption here is
# a promise that no other section depends on the name.
EXEMPT = {
    # Boot ordering only; no section reads it for behaviour.
    "sessionReadyPromise",
}


def read(path):
    with io.open(path, encoding="utf-8") as fh:
        return fh.read()


def main():
    js = read(JS)
    doc = read(DOC)

    declared = set(BRIDGE_RE.findall(js)) - EXEMPT

    # `let x = null` at module scope is also how an ordinary piece of local
    # state is written, so the declaration alone does not make a seam. What
    # distinguishes a bridge is that some section's init hands it a FUNCTION or
    # an OBJECT for other sections to call — `x = (a) => …` or `x = { … }`.
    # `topPanelVariationMode`, which holds a boolean and is assigned in the very
    # function that reads it, is the case this rules out.
    found = set()
    for name in declared:
        if re.search(
            r"^\s*%s = (?:\(|\{|function\b|async\b)" % re.escape(name), js, re.M
        ):
            found.add(name)

    # A bridge is only a contract if something other than its own declaration
    # and assignment refers to it; otherwise it is dead code, not a seam.
    live = set()
    for name in found:
        uses = len(re.findall(r"\b%s\b" % re.escape(name), js))
        if uses > 2:  # declaration + assignment = 2
            live.add(name)

    undocumented = sorted(n for n in live if n not in doc)

    # Stale: CLAUDE.md calls something a bridge that is not one any more.
    # Matched only where the doc itself uses the word, so an ordinary function
    # whose name merely ends in "Hold" or "Api" is not swept up.
    stale = set()
    for m in re.finditer(r"`([A-Za-z_][A-Za-z0-9_]*)`", doc):
        name = m.group(1)
        if name in found:
            continue
        window = doc[max(0, m.start() - 90) : m.end() + 90]
        if "bridge" in window.lower() and not re.search(
            r"\b%s\b" % re.escape(name), js
        ):
            stale.add(name)
    stale = sorted(stale)

    print("bridges discovered : %d" % len(found))
    print("  live (referenced): %d" % len(live))
    print("  documented       : %d" % (len(live) - len(undocumented)))

    ok = True
    if undocumented:
        ok = False
        print("\nFAIL — cross-module bridges missing from CLAUDE.md:")
        for n in undocumented:
            print("    %s" % n)
        print(
            "\n  These are the names another section reaches in by. An edit\n"
            "  elsewhere that touches one must be able to find out why from\n"
            "  the always-loaded file. Name it in CLAUDE.md (one clause is\n"
            "  enough) or add it to EXEMPT with a reason."
        )

    if stale:
        ok = False
        print("\nFAIL — CLAUDE.md names bridges that no longer exist:")
        for n in stale:
            print("    %s" % n)

    if ok:
        print("\nOK — every live bridge is named in CLAUDE.md.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
