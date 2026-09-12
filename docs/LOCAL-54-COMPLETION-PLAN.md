# Kenya Data Atlas — P27–P35 Local 54-Indicator Completion Plan

Status: **planned successor programme**

Machine-readable phase authority: [`data/local-54-completion-roadmap.json`](../data/local-54-completion-roadmap.json)  
Machine-readable execution overlay: [`data/local-54-completion-execution.json`](../data/local-54-completion-execution.json)  
Legacy provenance audit contract: [`data/legacy-secondary-source-audit-contract.json`](../data/legacy-secondary-source-audit-contract.json)  
Existing local cascade contract: [`data/local-indicator-cascade-contract.json`](../data/local-indicator-cascade-contract.json)

## Purpose

P27–P35 is the governed successor to the P18–P26 completion programme. It does not rewrite the historical 20,115-slot denominator, prior phase closure semantics, or v1.0 release history. Its purpose is to establish a stronger local-public-data contract:

- exactly **54 governed indicators** evaluated consistently across local geographies;
- all **290 constituencies × 54 = 15,660** cells explicitly resolved;
- all **1,450 wards × 54 = 78,300** cells explicitly resolved;
- **93,960 child-level indicator cells** in total;
- a **47 × 54 = 2,538** county audit surface to keep the hierarchy aligned;
- a governed county-level elected-representative layer;
- credible secondary evidence permitted as a labelled fallback where primary evidence is inaccessible, dynamic, non-responsive or does not publish the required local value;
- a mandatory retrospective audit so the same source rules are applied to data already present in KDA;
- conflicting credible values retained and adjudicated transparently rather than hidden.

The programme distinguishes **disposition completeness** from **numeric completeness**. Every cell must be resolved, but a resolved cell may legitimately be `Data unavailable` or `Not applicable` where no defensible value exists. The programme must never manufacture a number merely to improve numeric coverage.

### Publication presumption: label rather than omit

Where a defensible value exists, KDA should normally **represent it at the lowest truthful evidence tier rather than omit it**. A value does not need to be primary/official to be useful, provided its status, method, confidence, period and limitations are explicit.

Omission is the last resort and should be used only where evidence is not defensible, the geography/definition cannot be reconciled, uncertainty would make a preferred value misleading even with disclosure, or publication would violate rights/privacy/safety/source restrictions.

This principle applies both to new P27–P35 data and to values or gaps already in the Atlas.

## Source hierarchy

The publication order is:

1. **S0 — Official**: direct primary-source observation.
2. **S1 — Derived from official data**: exact or policy-approved derivation from primary official inputs.
3. **S2 — Secondary — verified**: credible secondary publication that can be traced to an identifiable primary source or primary evidence lineage.
4. **S3 — Secondary — corroborated**: at least two genuinely independent credible secondary evidence lineages materially agree.
5. **S4 — Probable value — sources conflict**: credible sources disagree, but one value is judged most probable under the conflict policy.
6. **S5 — Estimated / modelled**: transparent modelled or geospatial estimate explicitly allowed by the indicator contract.
7. **S6 — Data unavailable**: evidence search completed but no defensible value is publishable.
8. **S7 — Not applicable**: the indicator does not conceptually apply to that geography.

Secondary evidence is not a shortcut around available official evidence. It is permitted where the primary source is inaccessible/non-responsive, highly dynamic and difficult to capture stably, does not publish the needed geography/period, or where independent credible sources can verify the same value. Every secondary observation must retain a fallback reason, evidence lineage, verification date and public source-tier label.

Multiple websites repeating the same upstream report count as **one evidence lineage**, not independent corroboration.

## Conflict-resolution policy

All defensible competing observations are retained in a candidate-observation layer. KDA may publish a preferred value when the evidence supports a most-probable selection, but the conflict must remain visible.

Default selection dimensions are:

- source authority — 30%;
- exact geography match — 25%;
- period/freshness match — 20%;
- methodological fit — 15%;
- independent corroboration — 10%.

These are default methodology weights, not a licence for blind arithmetic. Indicator-specific rules may override them where documented. A newer source does not automatically beat an older source if the periods or definitions differ. Exact geography outranks a mismatched proxy. Conflicting values must never simply be averaged to create a compromise number. Close-scoring, definition-incompatible or materially divergent cases remain in manual review.

A published S4 record must contain `conflict=true`, confidence, number of competing candidate values, a selection rationale and links/references to the competing evidence.

---

## P27 — Freeze the 54-indicator local contract

**Goal:** Define the exact 54 indicators and make their geography/applicability rules deterministic.

**Work:**

- inventory the current governed local indicator set and reconcile the existing 49-slot completion baseline to the requested 54-indicator successor set;
- freeze the 54 indicator IDs;
- define for every indicator: title, definition, unit, numerator/denominator where relevant, reference-period policy, county/constituency/ward applicability, ranking policy, uncertainty requirements and freshness expectation;
- classify each indicator by local treatment: direct, exact aggregation, approved spatial derivation, matched local calculation, modelled, unavailable or not applicable;
- explicitly list prohibited derivations per indicator.

**Outputs:** `data/policy/local-54-indicator-contract.json`, a local indicator manifest and the historical 49→54 migration map.

**Gate:** exactly 54 IDs; 54/54 have complete contracts; no historical P18–P26 completion counts are rewritten.

---

## P28 — Secondary-source, provenance and legacy-data audit governance

**Goal:** Make secondary evidence and conflict handling first-class governed provenance states and apply those rules retrospectively to the current Atlas.

**Work:**

- implement the S0–S7 source-tier vocabulary;
- add fields for primary-source access attempts, fallback reason, original source where identifiable, evidence lineage, confidence and verification date;
- define credible-secondary eligibility criteria;
- distinguish source authority from evidence independence;
- add the candidate-observation and conflict-decision schemas before large-scale local ingestion begins;
- run mandatory subphase **P28A** across existing KDA observations and omission states.

### P28A — Audit existing KDA data under the new secondary-source rule

The new provenance policy is not prospective only. P28A audits the data already in KDA, including canonical observations/series, county/constituency/ward profile values, P18–P26 observations and closure states, public source labels, and CountyIQ/results mappings that depend on canonical data.

For every in-scope current preferred observation, P28A assigns or verifies an S0–S7 tier and evidence lineage. It specifically looks for:

- secondary evidence currently labelled or implied as official/unspecified;
- existing `official_unavailable` / `governed_unavailable` / omitted values where credible S2/S3/S4/S5 evidence can now support representation;
- legacy conflicts where only one value was retained and competing credible evidence should be preserved;
- duplicate web copies of the same upstream source incorrectly treated as independent corroboration.

The audit should **re-open omissions rather than grandfather them**. Where a defensible secondary, probable or modelled value exists, the default action is to publish it with the truthful label and confidence rather than keep the slot empty.

**P28/P28A gate:** S0–S7 validates machine-readably; 100% of in-scope preferred observations are audited; 100% of in-scope unavailable/omitted states are checked for representable secondary evidence; zero known current secondary observations remain unlabelled; newly representable legacy gaps are promoted or retain an explicit reason for remaining unavailable.

---

## P29 — Build the complete local denominator

**Goal:** Generate the full 54-indicator successor ledger.

**Required surfaces:**

- county audit: 47 × 54 = 2,538 cells;
- constituency: 290 × 54 = 15,660 cells;
- ward: 1,450 × 54 = 78,300 cells;
- child-level total: 93,960 cells.

Every cell receives a machine-readable disposition. The summary reports disposition completion separately from numeric/categorical value coverage and separately by source tier.

**Gate:** all expected cells compile deterministically; unknown/unclassified cells equal zero.

---

## P30 — County representation layer

**Goal:** Add a governed county-level representative while using a schema that can also support MP and MCA records.

The county-level representative displayed in the same hierarchy as constituency MP and ward MCA is the **Woman Representative**. The schema must remain extensible for Governor and Senator as additional county leadership roles.

Each record should support: geography ID, role, person name, party where verifiable, term start/end, current/vacant/disputed/by-election status, source tier, source reference and `verified_at`.

**Gate:** 47/47 counties have an explicit current Woman Representative disposition; stale officeholders cannot remain silently active after vacancy, by-election or term change.

---

## P31 — Complete all 54 indicators across constituencies

**Goal:** Resolve all 15,660 constituency cells.

Implementation is **indicator-wide**, not 290-file manual research. For each indicator, use the hierarchy:

`official exact local value → exact official child aggregation → official administrative/geocoded records → credible verified secondary → corroborated secondary → probable conflicting value → approved spatial/modelled derivation → governed unavailable/not applicable`.

Every defensibly obtainable value must be materialised. Boundary and period mismatches remain explicit. County values are never inherited downward. Secondary/modelled/probable values should be represented with labels rather than omitted merely because they are non-primary.

**Gate:** 15,660/15,660 cells have governed dispositions and constituency numeric coverage is reported separately.

---

## P32 — Complete all 54 indicators across wards

**Goal:** Resolve all 78,300 ward cells.

Ward completion may use direct ward records, exact aggregation, polling-station aggregation, administrative records with ward codes, geocoded facilities/services, authoritative geometry overlays, approved census/local crosswalks and transparent spatial/modelled methods where the indicator contract allows them.

The existing anti-inheritance rules remain absolute: no county or constituency value can simply be copied to wards; no arbitrary equal split; no parent-rate downscaling; no force-matching through boundary ambiguity. Within those constraints, KDA should prefer clearly labelled representation over omission whenever defensible.

**Gate:** 78,300/78,300 cells have governed dispositions; additive measures reconcile Ward → Constituency → County where mathematically meaningful.

---

## P33 — Candidate-value conflict resolution

**Goal:** Preserve and adjudicate credible competing values.

Required products include a candidate-observation registry, conflict-decision ledger, deterministic scoring helper and manual-review queue. Preferred values can be promoted only after candidate evidence is preserved.

**Gate:** zero S4 preferred values without competing-source records, confidence and rationale; zero unexplained conflicts; zero unlabelled averaging.

---

## P34 — Public-product exposure

**Goal:** Make all 54 indicator concepts visible for every constituency and ward and align county pages to the same framework.

Every indicator row/card should expose or make inspectable: value/state, unit, period, source tier, source, verification/freshness date, confidence and conflict note. `Data unavailable` and `Not applicable` remain visible rather than disappearing from the page.

Source badges must distinguish at minimum: Official; Derived from official data; Secondary — verified; Secondary — corroborated; Probable value — sources conflict; Estimated/modelled; Data unavailable; Not applicable.

County pages also display the county representative record. The UI must not hide a defensible secondary/modelled/probable value simply because it is not primary evidence.

**Gate:** automated UI tests confirm the complete governed 54-indicator skeleton; secondary evidence cannot be visually mistaken for official evidence; accessibility/browser/release gates pass.

---

## P35 — Permanent completeness, freshness, supersession and re-audit gate

**Goal:** Prevent the local surface from degrading after the one-time completion push.

The release gate must enforce:

- 54/54 governed indicators;
- 290 × 54 constituency dispositions;
- 1,450 × 54 ward dispositions;
- 47/47 county representative dispositions;
- zero unknown local cells;
- zero unlabelled secondary values across both new and legacy data;
- zero unexplained conflicts;
- zero prohibited parent→child inheritance;
- freshness metadata for dynamic observations;
- recheck triggers for unavailable values;
- automatic queueing of secondary observations for primary-source confirmation/supersession when primary evidence becomes available again;
- periodic re-audit of legacy unavailable states so a gap is promoted when credible evidence later becomes available.

**Gate:** deterministic rebuild plus all focused, geography, browser/accessibility and release validations pass.

---

## Execution process

`data/local-54-completion-execution.json` is the scheduling authority. The preferred execution order is:

`P27 contract → P28 source/conflict rules → P28A legacy provenance + omission audit → P29 denominator → P30 representation + P31 constituency pipelines → P32 ward pipelines → P33 final conflict adjudication → P34 UI → P35 permanent gate`.

P30 may run in parallel with early P31 work once P28/P29 are stable. Candidate collection and conflict logging should happen continuously during P31/P32, but P33 remains the formal conflict-clearance gate after both local levels are populated.

Each tranche must record target indicator/geographies, primary-source attempts, source-tier distribution, evidence lineage, conflicts introduced/resolved, numeric vs closure counts, legacy observations relabelled/promoted where applicable, validation results, known limitations and refresh triggers.

The programme objective is not merely to maximise numbers. It is to make the Atlas able to state, truthfully, that **every one of Kenya's 290 constituencies and 1,450 wards has been assessed against the same 54-indicator framework, every missing value is explained, every secondary value is labelled, every material conflict is disclosed, and legacy gaps are repeatedly challenged rather than permanently grandfathered.**
