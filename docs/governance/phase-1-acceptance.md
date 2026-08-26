# Phase 1 acceptance record

**Decision:** Accepted for the independent Kenya Data Atlas MVP on 26 August 2026.

## Acceptance checks

- [x] Stable canonical IDs and codes exist for Kenya, 47 counties, 290 constituencies and 1,450 wards.
- [x] Every non-country geography has a valid immutable parent.
- [x] Search aliases and deterministic rebuilds are implemented.
- [x] Publicly accessible alternative geometry is retained with source files, URLs, dates and SHA-256 hashes.
- [x] Geometry is normalized to WGS84/EPSG:4326 and published as GeoJSON.
- [x] Exactly 1 country, 47 county, 290 constituency and 1,450 ward geometry features are matched to canonical IDs.
- [x] Every geometry version has a source, CRS, validity date, geometry hash and `validated_external` status.
- [x] Incomplete 1,439- and 1,448-ward alternatives are rejected rather than silently filled.
- [x] Extra/duplicate source features and all non-exact ward-name matches are exposed in a machine-readable validation report.
- [x] `npm test` fails on hierarchy, count, identity, CRS, hash, lineage or geometry completeness regressions.

## Qualification

Operational completion does not convert external geometry into official IEBC geometry. The Atlas must display it as externally sourced and validated. If IEBC later supplies an authoritative machine-readable package, it should be added as a new boundary version and compared before promotion; immutable geography IDs must remain unchanged.

Evidence: `data/geography/geometry-validation-report.json`, `data/geography/registry/geometry-versions.json`, and the generated GeoJSON files in `data/geography/geometry/`.
