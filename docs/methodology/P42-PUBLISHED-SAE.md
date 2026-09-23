# P42 Published Kenya Small-Area Estimates

## Purpose

This tranche tests whether already-published Kenya 2022 small-area estimates can add defensible numeric evidence to the Local-54 atlas without treating non-equivalent administrative boundaries as constituencies.

## Source

- Publisher: Multi-Indicator Small Area Estimation Resource / University of Washington Statistics
- Release: `v2025.11.20`
- Kenya asset: `KEN_combined_estimates.csv`
- Survey reference: Kenya DHS 2022
- Published estimates include point estimates and 90% uncertainty intervals.

## Frozen promotion gates

An indicator may be promoted only when its published county-level estimates reconcile to KDA's official county controls within the predeclared P42 thresholds:

- all 47 counties must match;
- MAE <= 5 percentage points;
- RMSE <= 7 percentage points;
- absolute mean bias <= 3 percentage points;
- at least 75% of official county values must lie inside the published 90% intervals;
- required point/interval fields may not be missing.

A source Admin-2 polygon may be assigned directly to a KDA constituency only when:

- the best match is one-to-one;
- intersection-over-union >= 0.98;
- at least 99% of the source polygon is covered;
- at least 99% of the KDA constituency polygon is covered.

Names alone never authorize an assignment.

## Publication semantics

Passing values publish as **S5 — Modelled estimate**. They are not official constituency statistics, are excluded from official-only views, are not ranking-eligible, and retain the published 90% interval plus the geometry diagnostics used to authorize the crosswalk.

Admin-2 estimates that fail the geometry gate remain unavailable until a separately validated population-weighted boundary crosswalk or prediction-grid method exists. Thresholds are not relaxed after observing results.
