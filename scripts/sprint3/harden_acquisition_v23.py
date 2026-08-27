#!/usr/bin/env python3
"""Treat a non-reconciling flattened split-row match as a parser non-match.

Some FY2023/24 PDFs render monetary cells with spaces after thousands commas
(e.g. `74, 236, 322`). A regex over flattened text can then pair the wrong tokens
while still superficially matching the Executive/Assembly split-row shape.

A component arithmetic mismatch therefore proves that the regex did not parse a
valid table row; it is not evidence that the official report itself is wrong.
Return None from that candidate so the existing source-backed narrative path can
supply the values. Final county budget/expenditure/absorption reconciliation and
all release validators remain unchanged.
"""
from pathlib import Path

import harden_acquisition_v22

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v22.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")

    old = '''                    if abs(calc - published) > 1.0:\n                        raise RuntimeError(\n                            f"{fy} {county}: {row_name} {component} table absorption mismatch "\n                            f"published={published} calc={calc:.2f}"\n                        )\n'''
    new = '''                    if abs(calc - published) > 1.0:\n                        # Flattened-PDF tokenization did not produce a valid row.\n                        # Reject this parser candidate; do not weaken downstream validation.\n                        return None\n'''
    if old not in s:
        raise RuntimeError("Expected split-component mismatch block missing")
    s = s.replace(old, new, 1)

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v23 applied; invalid flattened split rows fall back to official narrative")


if __name__ == "__main__":
    main()
