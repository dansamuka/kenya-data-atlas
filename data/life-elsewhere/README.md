# County Life comparison metrics

This package adds five county-level context measures used by the Kenya Data Atlas **Direct Compare** and **My Life Elsewhere** experiences.

It contains **235 immutable source rows = 47 counties × 5 indicators**. Each row keeps its source, table, reference period and limitation. These are separate measures, not components of a composite quality-of-life score.

## Published measures

| Family | Indicator | Reference period | Source | Interpretation |
| --- | --- | --- | --- | --- |
| Cost & affordability | Rent as % of household expenditure | 2024 | KNBS Economic Survey 2025, Table 20.5 | Rent-burden signal only; not a synthetic cost-of-living index |
| Housing | Households owning main dwelling (%) | 2021 survey | KNBS Kenya Time Use Survey 2021, Table 3.6b | Tenure status; not housing quality or wealth |
| Health access / supply | Health facilities in 2023 census target (count) | KMHFL as of 1 Aug 2023 | Ministry of Health Kenya Health Facility Census 2023, Table 2 | Facility-stock context; not travel time or service quality |
| Education | Population age 3+ at school / learning institution (%) | 2019 census | KNBS Education & Training analytical report, Appendix 2.2 | Attendance status; age structure affects comparisons |
| Employment | Labour-force participation rate, age 15–64 (%) | 2019 census | KNBS Labour Force analytical report, Table 3.19 | Labour-force participation; not unemployment or job quality |

## Statistical rules

- County values remain **county values**. They are never copied to constituencies or wards.
- Published values are reproduced at the source precision; the Atlas does not interpolate missing observations.
- My Life Elsewhere describes differences around a person. It does not predict an individual's rent, home ownership, healthcare access, educational outcome or employment outcome.
- The health-facility count is the Ministry of Health census **target-facility stock** from the KMHFL list as at 1 August 2023. The 47 county values sum to the published national target of **14,366**.
- School attendance and labour-force participation are distinct concepts and keep their published age denominators.
- All five indicators are shown independently. No undocumented weighting or composite score is calculated.

## Files

- `county-life-metrics.csv` — normalized 47 × 5 source snapshot.
- `sources.json` — source definitions, interpretation limits and release integrity expectations.

The deterministic promoter is `scripts/life/build-native.mjs`; release assertions are in `scripts/indicators/validate-life-elsewhere.mjs`.
