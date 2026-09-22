# P42 Stunting Small-Area Estimation Pilot

Status: **input-access pending; model not yet fit; zero values authorised for publication**

Machine-readable authorities:

- `data/p42/kenada-source-readiness.json`
- `data/p42/sae-pilot-contract.json`
- `data/p42/sae-pilot-readiness-report.json`
- `scripts/p42/validation-gate.mjs`

## Why stunting is the first pilot

`IND-STUNTING-RATE` is the cleanest first test of the P42 survey-small-area path. KDA already carries an official numeric county value for all 47 counties, while the constituency and ward rows are explicitly classified as feasibility-C `small_area_estimation`. KDHS 2022 directly measures child anthropometry, so the model does not substitute an unrelated proxy for the target outcome.

A passing production run could add at most **1,740** S5 cells: 290 constituency estimates and 1,450 ward estimates. That potential yield is not counted until every publication gate passes.

## Source decision

KeNADA documents KDHS 2022 as an anonymised Public Use Dataset and describes a 1,692-cluster design drawn from the 2019 KPHC household master frame. The survey is designed for national/rural-urban and some county estimates, not constituency or ward estimates. The DHS Program separately makes Kenya 2022 geographic data available through its registered-access process.

Those geographic points are privacy displaced. Therefore this pilot **must not** assign a published DHS point directly to a ward and call the cluster a ward observation.

The approved geometry path is:

`displaced cluster -> displacement-aware covariates -> geostatistical prediction surface -> population-weighted constituency/ward aggregation -> county reconciliation`

## Data handling

Raw KNBS/DHS respondent or cluster files are controlled research inputs, not repository assets.

The public repository may retain source metadata, non-sensitive schema manifests, hashes, disclosure-safe cluster sufficient statistics, model diagnostics and published aggregate predictions where the source terms permit. It must not contain respondent records, household coordinates, raw DHS GPS files or any attempt to reverse spatial displacement.

## Model design

The target observation is a cluster-level stunted-child numerator and eligible-child denominator built outside the public repository from the authorised KDHS recode. Survey weights are retained in the derivation and validation process.

The first model family is a displacement-aware geostatistical binomial/logit model with declared covariates, an explicit spatial component, and county/urban-rural effects where justified. The exact implementation may change after exploratory diagnostics, but a change of model family may not change the predeclared publication thresholds after results are seen.

Training covariates must use the same definitions and vintages as the prediction grid. DHS displacement is handled through buffer/sensitivity extraction rather than treating the published point as exact.

Predictions are generated on a small spatial support and aggregated to current KDA constituency and ward boundaries using a population surface. This avoids pretending that a displaced survey cluster is an exact ward label.

## Validation

Before fitting, the pilot freezes these publication thresholds:

- county hold-out MAE <= **5 percentage points**;
- county hold-out RMSE <= **7 percentage points**;
- held-out nominal-90% interval coverage >= **80%**;
- final population-weighted constituency/ward back-aggregation to each official county rate within **0.5 percentage points**;
- median ward uncertainty-interval width <= **20 percentage points**.

`scripts/p42/validation-gate.mjs` now contains rate-aware gates. Rate reconciliation uses population weights rather than summing percentages, and hold-out validation is measured in percentage points rather than MAPE, which is inappropriate for bounded rates near zero.

County controls used for evaluation are held out from training/calibration in that validation fold. Only after the hold-out thresholds pass may the final model be refit on all eligible data and reconciled to the official county controls.

## Current blockers

The deterministic readiness report currently blocks fitting because:

1. the authorised KDHS child recode is not present in the execution environment;
2. the registered Kenya 2022 DHS geographic file is not present;
3. the prediction-covariate registry and licences have not yet been frozen.

These are input blockers, not permission to fabricate a result. `ready_to_publish` remains false until an actual model has passed the P42 gates.

## Next execution

Once the controlled inputs are available outside Git, record only non-sensitive file hashes/schema metadata, freeze the covariate registry, generate disclosure-safe cluster sufficient statistics, run county-held-out validation, and proceed to final gridded prediction only if every threshold passes.
