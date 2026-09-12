# Local Indicator Cascade Contract

## Purpose

Detailed constituency and ward intelligence is a first-class Kenya Data Atlas completion objective, not a best-effort extension of the county product.

The historical P18–P26 rule remains: **every active indicator represented at county level must receive an explicit constituency and ward disposition before that programme closes.** P23/P24 template completion alone is insufficient.

P27–P35 strengthens this into an exact **54-indicator local contract**. Every one of the 54 indicators must be evaluated for all 290 constituencies and 1,450 wards, with the same framework audited at county level. Historical P18–P26 denominators and release history remain auditable and are not rewritten.

## Publication presumption — label rather than omit

The Atlas should **prefer representation with truthful provenance, confidence, method, period and conflict labels whenever a defensible value exists**.

A value should not be omitted merely because it is secondary, modelled, dynamic, difficult to acquire from the primary publisher, or one of several conflicting credible values. Instead, publish it at the lowest truthful evidence tier when the indicator definition, geography and period are sufficiently compatible and the value would not be misleading with disclosure.

`governed_unavailable` is therefore a last-resort evidence state. It remains appropriate where evidence is not defensible, geography/definition cannot be reconciled, uncertainty is too material even with disclosure, or publication would violate rights/privacy/safety/source restrictions.

## Allowed dispositions

For each governed local indicator, child levels may be classified as:

1. `direct_official` — an authoritative local observation exists.
2. `exact_aggregation` — the value is an exact aggregation of authoritative child records.
3. `official_administrative_or_geocoded_records` — official records can be deterministically mapped to the local geography.
4. `spatial_derivation` — the value is reproducibly calculated from authoritative geometry/point/line data.
5. `matched_local_calculation` — numerator and denominator are available for the same geography/vintage.
6. `secondary_verified` — credible secondary evidence can be traced to an identifiable primary evidence lineage.
7. `secondary_corroborated` — at least two genuinely independent credible evidence lineages materially agree.
8. `probable_conflicting_value` — credible sources disagree but one value is judged most probable under the conflict policy and is clearly labelled.
9. `modelled_estimate` — a transparent defensible model or small-area estimate is approved and clearly labelled.
10. `governed_unavailable` — no defensible publishable value currently exists; the evidence constraint and refresh trigger are retained.
11. `not_applicable` — the indicator concept genuinely does not apply at that geography.

Unavailable/not-applicable count as governed dispositions, but not numeric coverage.

## Source tiers

Preferred evidence is classified as:

- **S0 — Official**
- **S1 — Derived from official data**
- **S2 — Secondary — verified**
- **S3 — Secondary — corroborated**
- **S4 — Probable value — sources conflict**
- **S5 — Estimated / modelled**
- **S6 — Data unavailable**
- **S7 — Not applicable**

Secondary evidence is a fallback, not a shortcut around an available matching primary source. A primary source that is inaccessible, non-responsive, dynamically rendered or does not publish the required geography/period may trigger secondary-source review after the access/search attempt is recorded.

Repeated websites copying one upstream report count as one evidence lineage, not independent corroboration.

## P28A — retrospective audit of existing KDA data

The S0–S7 policy applies to **data already in the Atlas**, not only new P27–P35 acquisitions.

P28A must audit:

- current canonical observations, series and dataset provenance;
- county/constituency/ward profile values;
- P18–P26 preferred observations and relevant closure states;
- public source labels/links;
- CountyIQ/results values whose source lineage originates in canonical data.

It must identify and remediate:

- secondary values currently labelled or implied as official/unspecified;
- unavailable/omitted states where credible S2/S3/S4/S5 evidence can now support representation;
- legacy conflicts where competing defensible values were not retained;
- duplicate-lineage corroboration.

P28 cannot close until 100% of the in-scope preferred observations have an audit disposition and 100% of the in-scope unavailable/omitted states have been reconsidered for labelled representation.

## Conflict handling

All defensible competing values are retained as candidate observations before a preferred value is selected.

Default decision dimensions are source authority, exact geography match, period/freshness match, methodological fit and independent corroboration. The default roadmap weighting is 30/25/20/15/10 respectively, but indicator-specific documented rules may override this.

Never average conflicting values merely to make them agree. A newer source does not automatically outrank an older one if period/definition differs. Exact geography outranks an unmatched proxy. Close, incompatible or materially divergent cases require manual review.

A public S4 value must disclose `conflict=true`, confidence, competing-value count and the selection rationale.

## Prohibited shortcuts

- Never copy a county observation into each constituency or ward.
- Never copy a constituency observation into each ward.
- Never divide a parent total equally or by arbitrary shares merely to fill child slots.
- Never treat census sub-counties as electoral constituencies without an authoritative exact crosswalk.
- Never average parent rates downwards.
- Never compute a child rate using numerator/denominator values from incompatible geography or boundary vintages.
- Never classify unfinished source acquisition as unavailable solely because a scraper/API/runner is blocked.
- Never omit a defensible value solely because the supporting evidence is secondary.
- Never publish secondary evidence without a visible source-tier label.
- Never count duplicated evidence lineage as independent corroboration.
- Never resolve conflicts through unlabelled averaging.

## Reconciliation

Where an indicator is additive, the pipeline must test, where meaningful:

`Ward → Constituency → County → Kenya`

For rates, percentages and densities, child values must be recomputed from compatible child numerators/denominators rather than averaged from parent values.

## Programme gates

### P23X — Constituency cascade convergence

P23 cannot be formally closed merely because the original constituency slot queue reaches zero. It requires 100% constituency dispositions for active county indicators, materialisation of every defensible value, explicit closure of remaining cases, and zero county→constituency inheritance.

### P24X — Ward cascade convergence

P24 likewise requires 100% ward dispositions for active county indicators, every defensible ward value materialised, explicit boundary holds, additive reconciliation where meaningful and zero constituency/county→ward inheritance.

### P27–P35 successor gate

The successor programme requires:

- exactly 54 governed indicator contracts;
- 47 × 54 county audit cells;
- 290 × 54 = 15,660 constituency cells;
- 1,450 × 54 = 78,300 ward cells;
- 93,960 child-level cells;
- P28A audit coverage of existing KDA data and omissions;
- 47/47 county representative dispositions;
- zero unlabelled secondary observations;
- zero unexplained conflicts;
- zero prohibited parent→child inheritance;
- zero unknown local cells;
- numeric coverage reported separately from governed disposition completeness;
- recurring re-audit of unavailable and secondary values for later promotion or primary-source supersession.

## Completion metrics

The build must publish at minimum:

- `indicator_contract_count`
- `legacy_preferred_observations_audited_pct`
- `legacy_unavailable_states_reviewed_pct`
- `legacy_omissions_promoted_count`
- `county_audit_disposition_pct`
- `constituency_disposition_pct`
- `constituency_numeric_pct`
- `ward_disposition_pct`
- `ward_numeric_pct`
- source-tier counts
- secondary-observation and unlabelled-secondary counts
- conflict/unexplained-conflict/manual-review counts
- prohibited parent→child inheritance count
- representative coverage
- stale/dynamic observation count

## Completion definition

The Kenya Data Atlas is not complete merely when every slot has a status. It is complete when every local geography has been evaluated against the governed indicator framework, every responsibly obtainable value is represented with truthful provenance, every remaining gap has an auditable reason, every material conflict is visible, and older omissions are periodically re-tested rather than permanently grandfathered.
