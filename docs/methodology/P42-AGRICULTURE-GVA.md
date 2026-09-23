# P42 Agriculture GVA — county-constrained local model

## Purpose

Produce defensible 2024 constituency and ward estimates for **Agriculture gross value added** without copying county values, equal-splitting, or treating a coarse economic raster as an official local account.

## Official control

Every allocation starts from the official KNBS 2024 county Agriculture GVA observation in KDA. The raster never changes the county control; it supplies only the within-county spatial allocation.

## Spatial prior

Central allocation uses the World Bank **Global Gridded Agricultural Gross Domestic Product (AgGDP)** surface (circa 2010, 5 arc-minute resolution, CC BY 4.0). Before candidate construction KDA froze a feasibility gate requiring county rank correlation of at least 0.60 against official KNBS 2024 Agriculture GVA. The measured Spearman correlation is 0.810592 across all 47 counties.

Because the raster is coarse relative to wards, extraction uses fractional pixel–polygon overlap rather than pixel-centre inclusion. This gives positive central weights for all 290 constituencies and all 1,450 wards.

## County-constrained allocation

For each target level independently:

1. Fractionally aggregate the AgGDP raster to each KDA child polygon.
2. Normalize child weights within its canonical county.
3. Multiply the normalized weight by official KNBS 2024 county Agriculture GVA.
4. Allocate to 0.01 KES million using largest-remainder cents so the complete candidate allocation reconciles exactly to the county control.

## Stability specification

A second allocation uses the sum of the World Bank crop, livestock, fish and forest component priors. This is a materially different spatial specification of the same agricultural activity family.

For each child cell:

- central = county-constrained AgGDP allocation;
- sensitivity = county-constrained summed-component-prior allocation;
- model-structure spread = absolute difference divided by their mean;
- lower/upper = minimum/maximum of the two allocations.

The envelope is **not a statistical confidence interval**.

## Frozen publication gate

Before cell-level results were seen, KDA froze these requirements:

- source feasibility Spearman >= 0.60;
- all 47 official county controls present;
- canonical geometry counts = 290 constituencies and 1,450 wards;
- summed child central raster weight must reconcile to direct county raster weight within 1%;
- central and sensitivity allocations must both be positive;
- model-structure spread <= 50%.

Cells failing a gate remain governed unavailable. Thresholds are not relaxed after observing results.

## Result

The first execution produced 1,740 candidate cells:

- **1,661 promotion-eligible**;
- **279 / 290 constituency cells**;
- **1,382 / 1,450 ward cells**;
- **79 rejected cells**, all because model-structure spread exceeded 50%.

Published cells are **S5 — Modelled estimate**. They are excluded from official-only views and must never be presented as KNBS constituency or ward economic accounts.
