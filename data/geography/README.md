# Canonical geography foundation

Phase 1 provides the reproducible electoral hierarchy used by Kenya Data Atlas.

## Current coverage

| Level | Records | Status |
|---|---:|---|
| Country | 1 | Verified |
| County | 47 | Provisional record-level verification |
| Constituency | 290 | Provisional record-level verification |
| County Assembly Ward | 1,450 | Provisional record-level verification |

The totals for constituencies and wards are confirmed by the IEBC boundary-delimitation FAQ. Names, codes and parent relationships are imported from a public CSV transcription explicitly referencing Legal Notice 14 of 2012, the National Assembly Constituencies and County Assembly Wards Order. They remain `provisional` until spelling and code comparison against the controlling Kenya Law document is completed.

Two community datasets are retained for cross-checking but rejected as canonical ward seeds because their tables contain 1,439 and 1,448 rather than 1,450 records. The validation system exposed these discrepancies rather than silently accepting or filling them.

## Build and validate

```sh
npm run geography:build
npm test
```

The build creates deterministic UUIDv5-style identifiers. Rebuilding the same canonical code produces the same immutable ID.

## Outputs

- `registry/geographies.json` and `.csv` — canonical hierarchy.
- `registry/aliases.json` and `.csv` — normalized search aliases.
- `registry/geometry-versions.json` and `.csv` — lineage/version records for every boundary, held at `pending` until spatial QA passes.
- `source/source-manifest.json` — exact provenance, commit and blob hashes.
- `source/legal-order-transcription/` — canonical Phase 1 hierarchy seed.
- `source/osm-package/` and `source/community-extract/` — rejected/cross-check tables and upstream licences.
- `db/schema/geography.sql` — production PostGIS schema, versioned geometry and explicit crosswalk tables.

## Boundary status

Geometry is deliberately not promoted in this phase. The upstream package exposes boundaries, but an authoritative boundary version, CRS verification, topology checks, simplification policy and record-level match must be completed before geometry is marked `validated`. The database schema is ready for those versions and forbids treating administrative crosswalks as identity relationships.

## Identity rules

- Permanent IDs are derived from canonical codes, never names.
- Renames create aliases; they do not replace IDs.
- Parent-child relationships use immutable IDs.
- Electoral and administrative systems remain separate.
- Historical boundaries will receive independent geometry versions and validity dates.

