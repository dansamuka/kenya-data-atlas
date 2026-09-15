# P23 Cycle 1 — remaining 71 parallel evidence pass

This branch retargets the existing governed 32-way evidence cycle to the exact remainder emitted by `audit-turnout-terminal-coverage.py`.

Invariant at branch creation: 109 canonical rows = 38 terminally covered + 71 remaining.

The 71 are assigned round-robin across exactly 32 isolated GitHub Actions workers. Each worker must build a fresh 250-DPI review context with result values forbidden, `no_inheritance=true`, `no_promotion=true`, and no canonical turnout write. Aggregation requires exactly 71 unique geo codes and exact set equality with the audit `remaining[]` list.

This pass prepares fresh evidence contexts only. Independent visual transcription and denominator reconciliation remain required before any row can receive a Cycle-1 terminal classification. No record produced by this pass is promotion eligible.
