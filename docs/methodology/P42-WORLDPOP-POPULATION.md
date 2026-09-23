# P42 WorldPop Population Spatial Allocation

Status: **validated for governed S5 promotion**

Execution contract: `data/p42/worldpop-population-contract.json`  
Validated candidate: `data/p42/worldpop-population-candidate.json`  
Engine: `scripts/p42/worldpop_population.py`

## Purpose

KDA has official KNBS 2019 population totals for all 47 counties, but the current Local-54 surface had no population values for the 290 constituencies and 1,450 wards. This method fills that gap without copying a county value downward or dividing it equally.

The official KNBS county total remains the numeric authority. WorldPop is used only to estimate **where within each county** the enumerated population is spatially distributed.

## Inputs

1. **KNBS 2019 Kenya Population and Housing Census** — official population control for every county; all 47 controls sum to 47,564,296.
2. **WorldPop Global 2015–2030 R2024B, 2019 constrained 100 m surface** — central within-county spatial pattern.
3. **WorldPop Global 2015–2030 R2024B, 2019 unconstrained 100 m surface** — independent model-structure sensitivity pattern.
4. **KDA canonical 2012-01 electoral geometry** — 290 constituencies and 1,450 wards.

WorldPop datasets are published under CC BY 4.0. The source rasters are downloaded only in the execution runner and are not committed to this repository.

## Allocation

For each county and each local level independently:

1. sum WorldPop raster cells intersecting every child geography;
2. convert the child raster sums to shares of the county raster sum;
3. multiply each share by the **official KNBS 2019 county population**;
4. use largest-remainder integer allocation so child values sum exactly to the official county total.

The process is repeated for both constrained and unconstrained WorldPop variants.

This guarantees:

- no equal split;
- no parent-value inheritance;
- no force-matched boundary assignment;
- exact reconciliation to each of the 47 official county controls;
- exact national reconciliation to 47,564,296 at both constituency and ward level.

## Predeclared stability gate

Before execution, the contract froze the following rule:

`spread = |constrained allocation - unconstrained allocation| / mean(two allocations)`

A cell is publication-eligible only when:

- both variants allocate a positive population; and
- model-structure spread is **<= 50%**.

The threshold was frozen before results were inspected and was not relaxed after execution.

### Result

All **1,740 / 1,740** candidate cells passed.

| Level | Cells | Eligible | Median spread | P90 spread | Maximum spread |
|---|---:|---:|---:|---:|---:|
| Constituency | 290 | 290 | 0.0013% | 0.2385% | 5.3468% |
| Ward | 1,450 | 1,450 | 0.0058% | 1.0510% | 43.1537% |
| Total | 1,740 | 1,740 | 0.0045% | 0.8360% | 43.1537% |

The relatively high maximum occurs in a small number of sparsely populated wards; it remains below the predeclared gate and is exposed through the sensitivity bounds.

## Public evidence treatment

Every promoted value is:

- evidence tier **S5**;
- `geographic_method = modelled`;
- badge **D** in the existing KDA registry;
- labelled **Modelled estimate**;
- tied to the 2019 census reference period and boundary version 2012-01;
- published with lower/upper bounds equal to the minimum/maximum of the two WorldPop allocations.

The bounds are a **model-structure sensitivity envelope**, not a frequentist confidence interval.

The public official/observed-only view must exclude these S5 estimates. The Best Available view may display them with their model label and methodology.

## Reproducibility

`.github/workflows/p42-worldpop-population.yml` downloads the frozen rasters, rebuilds all 1,740 candidates, validates exact county/national reconciliation and the predeclared stability rule, and commits only aggregate derived data.

`scripts/p42/apply-worldpop-population.mjs` promotes the eligible values into the canonical catalogue/indicator registries and is wired into normal KDA rebuilds so the promotion is deterministic rather than a one-off patch.
