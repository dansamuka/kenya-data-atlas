# Data-quality framework

## Provenance classes

| Class | Label | Definition | Minimum presentation |
|---|---|---|---|
| A | Official direct | Authoritative source publishes the value for that geography | Green A badge, agency, release and period |
| B | Official derived | Reproducible calculation from official inputs | Blue B badge, formula/method link |
| C | Spatially derived | Geographic transformation using documented inputs | C badge, “spatially derived,” uncertainty/limitations |
| D | Modelled | Statistical estimate | D badge, “modelled estimate,” model version and uncertainty |
| E | External | Credible non-government or international source | E badge and original publisher |
| Demo | Demonstration only | Invented or illustrative interface content | Prominent demo label; excluded from production |

The badge describes provenance, not an overall score and not whether a value is “good” or “bad.” A class A value can still be old or non-comparable.

## Quality dimensions

Review each dataset against:

- **Relevance:** corresponds to a defined user need and indicator.
- **Accuracy:** faithfully represents the source and passes validation.
- **Timeliness:** release and ingestion dates are known; staleness is visible.
- **Coherence:** units, definitions and totals are internally consistent.
- **Comparability:** changes across time and geography are understood.
- **Completeness:** expected observations and metadata are present.
- **Accessibility:** data, metadata and limitations are understandable and reusable.
- **Traceability:** every output resolves to inputs, transformations and approvals.

## Quality statuses

Use controlled workflow states:

```text
received → parsed → validation_failed | under_review → approved → published
published → superseded | corrected | withdrawn
```

Only `approved` records can be promoted to `published`.

## Blocking checks

Publication is blocked by any of the following:

- missing source, release, geography, period, unit or method;
- unknown public reuse basis;
- duplicate current observation for the same series/period/vintage;
- invalid or unrecognized geography code;
- value outside a hard logical bound;
- unresolved suppression or privacy risk;
- incompatible source unit or indicator definition;
- failed reconciliation required by the indicator;
- unexplained material deviation from the source or prior release;
- missing statistical and publisher approval.

## Standard automated checks

Every ingestion should test:

- schema and required fields;
- types and date order;
- code and foreign-key validity;
- uniqueness;
- allowed units and frequencies;
- hard bounds, such as percentages outside 0–100;
- soft anomaly thresholds;
- expected row/geography coverage;
- component/total relationships;
- source-file and transformation hashes;
- unexpected revisions;
- prohibited disclosure or suppression markers.

Soft anomalies require review but are not automatically errors. Thresholds must be indicator-specific and versioned.

## Quality issue severity

| Severity | Meaning | Response target |
|---|---|---|
| Critical | Privacy, legal, systemic fabrication or severe public harm risk | Withdraw/contain immediately; notify accountable leads |
| High | Materially wrong value, geography, unit, method or comparison | Triage within 1 business day |
| Medium | Limited error or material metadata omission | Triage within 5 business days |
| Low | Wording, formatting or non-material metadata improvement | Address in normal release cycle |

Targets are operational goals, not guaranteed service levels until staffing is approved.

## Release quality report

Each release retains:

- source and transformation versions;
- records received, accepted, rejected, added and revised;
- coverage expected and observed;
- all validation results;
- reviewer dispositions for anomalies;
- unresolved limitations;
- named approvals and timestamps.

