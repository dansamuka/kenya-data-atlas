# P42 KPHC sub-county → constituency crosswalk probe

## Purpose

This tranche tests a potentially high-yield Local-54 path that was not exhausted by the earlier closure work: whether the **2019 Kenya Population and Housing Census (KPHC) Volume IV sub-county tables** can be reused at constituency level where the 2019 census sub-county and electoral constituency are demonstrably equivalent.

The opportunity matters because Volume IV publishes several Local-54-relevant measures below county level. The first probe targets:

- school attendance (`V4_T2.2`);
- household car ownership (`V4_T2.36`);
- household motorcycle ownership (`V4_T2.36`).

If all 290 constituency equivalents were eventually validated, this first wave could unlock up to **870 numeric constituency cells**.

## Evidence basis

KNBS's 2019 census materials identify both **constituency** and **ward** in the census collection geography, and the 2019 collection design listed 47 counties, 290 constituencies and 290 sub-counties. Volume IV publishes the target tables by county/sub-county.

That count symmetry is a lead, **not proof of spatial equivalence**. Kenya's administrative sub-county system has evolved since the census, and identical or near-identical names cannot substitute for a boundary check.

## Reproducible extraction

The probe pins `Shelmith-Kariuki/rKenyaCensus` at commit:

`6db00e5b1b71a781e6def15dd98a4828b6d960bc`

The package is used only as a reproducible transcription aid for KNBS Volume IV. It does not become the primary authority and does not, by itself, satisfy KDA's publication gate.

The workflow extracts the three target measures, joins source sub-county names to the KDA constituency registry within county, and writes a sanitized candidate ledger.

## Hard publication gate

A candidate is **not** publishable merely because county and normalized name match.

Before any value can enter the canonical registry, a subsequent tranche must establish one of:

1. an official 2019 KNBS/IEBC crosswalk proving the census sub-county and constituency are equivalent; or
2. independently sourced 2019 boundary geometries that pass a predeclared one-to-one overlap gate.

The probe therefore writes `publication_eligible=false` for every row. No force matching, parent copying, arbitrary allocation, or current administrative-boundary substitution is permitted.

## Next step

If the candidate yield is substantial, build the boundary-equivalence stage and freeze its overlap thresholds **before** inspecting pass/fail results. Only rows that pass source, geography and reconciliation checks should then be considered for Local-54 promotion.


## Boundary-equivalence stage

The second stage uses two frozen geometry comparators:

1. a 2019-era Admin-2 boundary layer whose published metadata identifies IEBC as originator and describes the polygons as Kenya sub-counties; and
2. a pinned archival constituency GeoJSON extracted from the former IEBC vote endpoint after the 2012 delimitation.

The sources are intentionally frozen in `data/p42/kphc-subcounty-equivalence-sources.json` before comparison. They are not treated as interchangeable simply because each has roughly 290 units.

The geometry test reprojects both layers to EPSG:6933 and requires, for a unique county/name candidate:

- intersection-over-union **>= 0.98**;
- at least **99%** of the sub-county area covered by the constituency;
- at least **99%** of the constituency area covered by the sub-county;
- a one-to-one passing match.

The output records all failures and unmatched units, rather than force-matching them. A passing geometry row may advance to value-level reconciliation; it still cannot publish until the relevant census table value and county-level controls pass their own validation.
