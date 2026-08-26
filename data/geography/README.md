# Canonical geography foundation

Phase 1 provides the reproducible electoral hierarchy used by Kenya Data Atlas.

## Current coverage

| Level | Records | Status |
|---|---:|---|
| Country | 1 | Complete; external geometry validated |
| County | 47 | Complete; external geometry validated |
| Constituency | 290 | Complete; external geometry validated |
| County Assembly Ward | 1,450 | Complete; external geometry validated |

The totals for constituencies and wards are confirmed by the IEBC boundary-delimitation FAQ. Names, codes and parent relationships are imported from a public CSV transcription explicitly referencing Legal Notice 14 of 2012, the National Assembly Constituencies and County Assembly Wards Order. They remain `provisional` until spelling and code comparison against the controlling Kenya Law document is completed.

Two community datasets and the older HDX election ward archive are retained for cross-checking but rejected as canonical ward geometry because they contain 1,439 or 1,448 wards. The complete ward layer comes from the separately published HDX dataset *Administrative Wards in Kenya 1450*; county and constituency layers come from the HDX *Kenya Admin Boundaries — Election Polling stations* package.

## Build and validate

```sh
npm run geography:build
npm test
```

The build creates deterministic UUIDv5-style identifiers. Rebuilding the same canonical code produces the same immutable ID.

## Outputs

- `registry/geographies.json` and `.csv` — canonical hierarchy.
- `registry/aliases.json` and `.csv` — normalized search aliases.
- `geometry/*.geojson` — WGS84 country, county, constituency and ward boundaries matched to immutable Atlas IDs.
- `registry/geometry-versions.json` and `.csv` — source, CRS, hash, validity and quality records for all 1,788 boundaries.
- `geometry-validation-report.json` — machine-readable completeness, matching, collision and warning report.
- `source/source-manifest.json` — exact provenance, commit and blob hashes.
- `source/legal-order-transcription/` — canonical Phase 1 hierarchy seed.
- `source/osm-package/` and `source/community-extract/` — rejected/cross-check tables and upstream licences.
- `db/schema/geography.sql` — production PostGIS schema, versioned geometry and explicit crosswalk tables.

## Boundary status

All geometry is labelled `validated_external`, never official-direct. Automated checks enforce the 1/47/290/1,450 counts, immutable identity, EPSG:4326 coordinates, non-empty polygon geometry, source hashes and output geometry hashes. Eighteen non-exact ward-name reconciliations are preserved as review warnings in the validation report. The source archives contain one unused county record and five unused constituency records; these duplicate/extra source features are reported and are not promoted.

This is sufficient for the independent MVP's operational Phase 1. It does not mean the polygons were supplied or endorsed by IEBC. An IEBC-issued boundary package can replace the geometry later without changing Atlas geography IDs.

## Identity rules

- Permanent IDs are derived from canonical codes, never names.
- Renames create aliases; they do not replace IDs.
- Parent-child relationships use immutable IDs.
- Electoral and administrative systems remain separate.
- Historical boundaries will receive independent geometry versions and validity dates.

---

## v0.4.0 — geometry integrity

**Published geometry**

| File | Role | Origin |
|---|---|---|
| `geometry/wards.geojson` | canonical | External ward layer reconciled to the registry |
| `geometry/constituencies.geojson` | derived | Dissolved from wards |
| `geometry/counties.geojson` | derived | Dissolved from constituencies |
| `geometry/country.geojson` | derived | Dissolved from counties |
| `reference/constituencies.geojson` | cross-check | 2018 layer, retained for comparison only |
| `reference/counties.geojson` | cross-check | 2018 layer, retained for comparison only |

**Reports**

| File | Produced by | Covers |
|---|---|---|
| `geometry-validation-report.json` | `ingest-boundaries.mjs` | Matching, blank-row drops, repairs, degeneracy, containment |
| `derived-geometry-report.json` | `derive-parents.mjs` | Dissolve results, nesting assertions, reference comparison |
| `reference-divergence.json` | `ingest-boundaries.mjs` | Every ward disagreeing with the reference parent layer |
| `registry/applied-corrections.json` | `build-registry.mjs` | Source corrections applied this build |

The stale `validation-report.json` has been removed: it contradicted the geometry report
and claimed as open items checks the pipeline had since started performing.

**Boundary era.** Every record is on `2012-01`. Provenance is separate
(`geometry_source_id`, `geometry_revision`). See `docs/methodology/geographies.md` §5.
