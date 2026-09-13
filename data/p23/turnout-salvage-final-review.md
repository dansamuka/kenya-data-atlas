# P23 turnout salvage queue — final governance review

As of 2026-09-13, salvage tranches A–K assign all 85 canonical salvage positions deterministically.

This closes only the locator-governance step. It does **not** verify or promote turnout values.

## Mandatory boundary for the next phase

For every salvaged constituency, prior closed-PR material (#143–#145) is locator history only. A new verification attempt must independently:

1. locate and freshly download the official IEBC source;
2. compute fresh source hashes;
3. render new review context at exactly 250 DPI;
4. satisfy the current machine-review-context gate;
5. satisfy same-row candidate-vote reconciliation and arithmetic gates;
6. reconcile the printed registered-voter denominator to the governed P23 denominator;
7. satisfy the existing promotion contract before any canonical materialization.

No source URL, form ID, PDF hash, review-context hash, verified value, verification state, promotion state, or canonical turnout value is inherited from the closed PRs.

Rows that fail any gate remain explicitly non-promotable; they must not be corrected, inferred, silently inherited, or relabelled to force completion.
