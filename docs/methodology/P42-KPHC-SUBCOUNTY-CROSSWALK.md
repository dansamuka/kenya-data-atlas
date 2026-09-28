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

No force matching, parent copying, arbitrary allocation, partial-county reconciliation, or current administrative-boundary substitution is permitted.

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

A second, pinned PCode crosswalk route is permitted only when it resolves uniquely to the same KDA constituency identity. Both routes remain subject to full-county reconciliation.

## Current governed result

The executed probe currently records:

- **438** source rows passing a geography route;
- **12** county/indicator groups passing the exhaustive one-to-one reconciliation gate;
- **66** promotion-candidate rows across **33** unique constituencies;
- **0** rows marked publication-eligible before canonical promotion.

Those 66 rows are deliberately held at `promotion_candidate=true` with `next_gate=canonical_registry_and_local54_validation`. Publication eligibility is granted only by the separate promotion workflow after canonical registry insertion, distribution rebuild, and Local-54 validation complete successfully.

This section also retriggers the pull-request checks from a human-authored branch commit after the generated candidate artifact was committed by GitHub Actions.
