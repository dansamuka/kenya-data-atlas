# P23 Cycle 2 — 109-way promotion review

This pass assigns exactly one independent CI worker to each of the canonical 109 P23 constituencies.

The pass is deliberately non-promotional. A Cycle-1 `verified` state makes a row a **promotion candidate only**; it does not authorize publication. Candidate workers require revalidation of source provenance, pinned PDF/image hashes, 250-DPI review context, candidate arithmetic, governed denominator, and target geography mapping. All other Cycle-1 terminal states remain non-candidates and quarantined for exception resolution.

Hard invariants: `no_inheritance=true`, `no_promotion=true`, `promotion_authorized=false`, `canonical_turnout_written=false`. The aggregate gate requires an exact 109-row set and refuses any silent canonical write.
