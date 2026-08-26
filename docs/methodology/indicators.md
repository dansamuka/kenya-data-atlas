# Methodology — Indicators, Series and Observations

**Last rebuilt:** 26 August 2026
**Status:** First real (non-demo) content. Seven indicators, 55 series, 56 observations.

---

## 1. The model

Every statistic in the Atlas is an **indicator** (what is measured), realised as one
or more **series** (measured where, how often, in what units, on what basis), each
holding **observations** (the actual values over time).

```text
indicator  "Population"
   └── series   KDA-POP-TOTAL-KEN         (Kenya, decennial, persons)
   └── series   KDA-POP-TOTAL-C032        (Nakuru County, decennial, persons)
        └── observation   2019-08-24/25   2,162,202
```

A series is unique on `(indicator, geography, boundary_version, frequency, unit,
price_basis, seasonal_adjustment, transformation)`. Changing any of those creates a
new series, not a mutation of an existing one.

## 2. The publication gate

No observation reaches the published registry unless its dataset's
`publication_status` is `approved` or `published`, per
`docs/governance/statistical-publication-policy.md` §11–12. This is enforced **in
the build script**, not only checked afterwards: `build-registry.mjs` holds back
any series or observation whose dataset fails the gate, writing it to
`data/indicators/registry/held-for-review.json` instead of publishing it. The
validator re-checks the same gate independently, so a build-script bug and a
validator bug would both have to fail the same way for something ungated to reach
the site.

Most of the Atlas's catalogue (13 of 21 datasets) remains `blocked`, exactly as
before this work — full census microdata, full CPI baskets, full monetary
statistics, ward-level voter rolls. This round added five **narrowly-scoped**
datasets, each covering only the specific headline figure actually published here,
each with its own real source URL, real publication date, and a stated reason the
narrower slice was reviewable when the broader dataset was not:

| Dataset | Scope | Narrower than |
|---|---|---|
| `DS-KNBS-CENSUS-TOPLINE` | National and county enumerated population only | `DS-KNBS-CENSUS` (full census, all volumes) |
| `DS-KNBS-CPI-HEADLINE` | Headline YoY inflation rate only | `DS-KNBS-CPI` (full basket, sub-indices) |
| `DS-CBK-RATES-HEADLINE` | CBR, 91-day T-bill yield, USD/KES reference | `DS-CBK-MONETARY` (full monetary/financial statistics) |
| `DS-IEBC-VOTERS-TOPLINE` | Certified national topline as of the 2022 register cutoff | `DS-IEBC-VOTERS` (full register, constituency/ward level) |
| `DS-KDA-DERIVED-AREA` | Land area computed from the Atlas's own boundary geometry | — (new: an Atlas self-derivation, not a republished agency statistic) |

## 3. What's actually seeded

### Population (badge A, direct official)
National (47,564,296) and Nakuru County (2,162,202), both from the 2019 census,
enumerated on census night, 24–25 August 2019, published 4 November 2019. `period_type:
point_in_time` — a census counts a moment, not an annual average.

### Consumer price inflation (badge A)
Two real monthly observations: June 2026 (6.4%) and July 2026 (6.5%), both KNBS. This
is a genuine two-point series, not a fabricated history — consistent with "missing
data is preferable to misleading data" (spec §3.3): a short real series beats a long
invented one. `comparability_group: CPI-BASE-2019M2` records the index base so a
future rebasing can be recorded as a break (spec §18C) rather than silently spliced.

### USD/KES exchange rate (badge E — external, not A)
129.40 as of 26 August 2026. This is a **market mid-rate**, corroborated across
Investing.com, Xe and Wise on the same date — not CBK's own published indicative
rate, which was not directly retrieved. It is recorded with `geographic_method:
direct` but `source_class: external`, which is why it badges **E** rather than A
even though it lives under a dataset otherwise sourced from CBK. This is the
project's first real use of the axis-override rule from spec §28.1: any method,
non-government-verified source → E.

### Central Bank Rate and 91-day Treasury bill (badge A)
CBR retained at 8.75% (MPC decision, 11 August 2026). 91-day T-bill weighted average
yield 8.782% (auction dated 10 August 2026). Both `period_type: point_in_time` — a
policy decision or an auction result is a single event, not a period average.

### Registered voters (badge A)
22,120,458, the certified, KPMG-audited national register total as of the 2022
General Election (register cutoff 20 June 2022; election held 9 August 2022; the two
dates are recorded separately, since conflating them is exactly the reference-period/
publication-date confusion spec §9 warns against — here it's reference-period vs.
election-date, the same discipline).

### Land area (badge B, official derived)
Computed directly from the Atlas's own dissolved boundary geometry — the same
geometry hardened in the Phase 1 geometry remediation — for the country and all 47
counties. **This is not a surveyed or IEBC-issued figure.** The computation uses an
equirectangular planar projection (see `scripts/indicators/compute-derived-area.mjs`
for the exact method) with an estimated error band of roughly ±2% at Kenya's
latitude range. Two sanity checks against independently known figures: Kenya's
computed total (583,966 km²) falls inside the commonly cited 580,000–592,000 km²
range depending on whether inland water is included; Nakuru's computed area (7,515
km²) is within 0.1% of the figure used as the illustrative example in the original
product specification (7,510 km²).

This is the Atlas's first indicator with **full county coverage** — 48 series (1
national + 47 county) from a single computation, all badge B, all carrying the same
honest caveat rather than a false precision claim.

## 4. Badge derivation

The A–E badge is computed at build time from two inputs — `geographic_method` and
`source_class` — and is **re-derived and checked, never trusted as stored**, by both
the build script and an independent validator:

```text
geographic_method: direct        + source_class: official  → A
geographic_method: aggregated    + source_class: official  → B
geographic_method: interpolated  + source_class: official  → C
geographic_method: modelled      + source_class: official  → D
any geographic_method            + source_class: external  → E
```

`scripts/indicators/validate-registry.mjs` recomputes this for every observation and
fails the build if a stored badge disagrees — the same discipline applied to
`geography_geometry.quality_status` after the Phase 1 geometry audit.

## 5. What this deliberately does not do

- **No GCP, no county economic indicators.** Consistent with the revised product
  spec §33.1: GCP is episodic and would be stale within a year of "launch." Better
  to publish nothing here than a number that looks current and isn't.
- **No fabricated Pulse cards.** The homepage previously showed demo values for
  GDP, public debt, electricity access and mobile subscriptions. Those are removed
  rather than left standing next to real numbers — showing real and fabricated
  figures side by side without a visible distinction would be the exact failure
  this whole project exists to prevent.
- **No county-level voter, CBR, T-bill or FX series.** Only genuinely available
  national figures were seeded. Ward and constituency-level electoral data (spec
  §33A.1) is a legitimate near-term target but was out of scope for this pass.

## 6. Reproducing

```bash
npm run indicators:build      # compute area, then build the registry
npm run indicators:validate   # or: npm test (runs geography, catalogue, indicators)
```

`indicators:build` depends on the geography and catalogue registries already being
built (`npm run build:data` runs all three in the correct order).
