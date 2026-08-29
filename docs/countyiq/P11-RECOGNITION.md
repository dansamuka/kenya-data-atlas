# P11 — Administration-period scorecards and CountyIQ Recognition

## Publication status: published

P11 now publishes real administration-**period** scorecards for all 47 counties without creating personal political scores.

The unit of analysis is:

`county_administration_period`

No governor name, party or personal score is required for the analytical comparison. The period is anchored to Kenya's **9 August 2022 General Election** and the constitutional five-year election cycle.

## Fiscal-period attribution rule

A general-election date does not line up with Kenya's 1 July–30 June fiscal year. P11 therefore uses an explicit transition rule:

- **FY2021/22** — last full pre-election fiscal year; baseline;
- **FY2022/23** — straddles the August 2022 election/transition; shown as context but excluded from baseline-to-current change;
- **FY2023/24** — first full fiscal year after the election;
- **FY2024/25** — latest full fiscal year in the current cycle.

This is more defensible than treating FY2022/23 as if one administration exclusively owned the whole year's fiscal outcome.

## What each county scorecard contains

- baseline and latest overall absorption, with percentage-point change;
- baseline and latest development absorption, with percentage-point change;
- the transition-year values for context;
- current P10 fiscal-delivery score/rank where complete;
- FY2024/25 OSR target attainment;
- pending-bills burden;
- wage-ceiling compliance;
- FY2023/24 audit context.

Narok's administration-period page remains publishable even though its P10 composite is incomplete: the missing pending-bills submission is shown and the P10 score is withheld rather than imputed.

## Attribution limit

Administration-period association is **not causation**. The data model intentionally keeps `office_holder_name: null` and `person_attribution: false`.

County fiscal results can reflect the executive, assembly, public service, inherited contracts and arrears, national transfers, economic conditions and other shocks. P11 therefore says “during this administration cycle,” not “because of this governor.”

## CountyIQ Recognition

Recognition is generated mechanically from published P10/fiscal fields and never from the P09 development snapshot. P09 cleared only a current cross-sectional snapshot, not longitudinal composite movement.

Published categories are:

1. **Current fiscal delivery leaders** — top P10 scores among complete records.
2. **Most improved overall budget absorption this administration cycle** — FY2024/25 minus FY2021/22.
3. **Most improved development absorption this administration cycle** — same baseline/latest rule.
4. **OSR target-attainment leaders** — reported raw FY2024/25 attainment.
5. **Lowest pending-bills burden** — only counties with submitted values.
6. **Wage-ceiling compliance** — all eight compliant counties shown equally; no ranking.

For ranked categories the published tie rule includes every county tied at the fifth-place cutoff. Every rule states its formula, eligibility set, period and tie treatment.

## Sources

The election-cycle definition records:

- IEBC's 9 August 2022 General Election source;
- Constitution of Kenya, Article 180, for the county-government election cycle.

Fiscal/accountability source URLs are inherited visibly from P10 and the underlying CountyIQ fiscal panel.

## Files

- `scripts/p11/recognition.mjs` — P11-v2 period records, transition treatment and recognition engine.
- `scripts/countyiq/validate-p11.mjs` — recomputes baseline/latest changes, verifies all 47 records, enforces person-attribution=false, and checks rule/formula/tie/eligibility publication.
- `data/countyiq/county-summary.json` — `administrationScorecard` and `recognition` blocks for every county.
