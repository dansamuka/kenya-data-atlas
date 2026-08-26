# Methodology — Geographies

**Boundary era:** `2012-01`
**Last rebuilt:** 26 August 2026
**Status:** Externally sourced, reconciled to a legal registry, provisional pending
direct verification against an authoritative IEBC register.

---

## 1. The hierarchy

Kenya Data Atlas records the **electoral** hierarchy:

```text
Kenya
 └── 47 Counties
      └── 290 Constituencies
           └── 1,450 County Assembly Wards
```

These are not the same as the **administrative** hierarchy (county → sub-county →
division → location → sub-location), and the two are never joined by name. Every
geography carries a `geography_system` value (`electoral`, `administrative`,
`statistical`, `other`), and any join across systems must pass through an explicit
crosswalk with recorded weights and a named reviewer.

"Sub-county" is not one thing. KNBS census sub-counties, national government (NGAO)
sub-counties, Ministry of Health sub-counties and Ministry of Education sub-counties
share names without reliably sharing boundaries. A name-based join between them
produces wrong numbers that pass every schema check.

## 2. What is authoritative for what

| Question | Authority |
|---|---|
| Which wards exist, and which constituency each belongs to | Legal Notice 14 of 2012, via a transcription reconciled to exact counts |
| The shape of each ward | External geometry, reconciled to the registry |
| The shape of each constituency, county and the country | **Derived** by dissolving wards |

The registry governs the hierarchy. Geometry is evidence about shape, not about
membership. Where a third-party boundary layer disagrees with the registry about which
constituency a ward belongs to, the registry wins and the disagreement is published.

## 3. Identifiers

Codes are structural, not descriptive:

```text
KEN
KEN-C032                       county 32
KEN-C032-CON176                constituency 176
KEN-C032-CON176-W0879          ward 879
```

`geography_id` is a deterministic UUID derived from the canonical code, so a rebuild
reproduces the same identifiers. Names change; identifiers do not.

Identifier columns must be positive integers, must agree with the code embedded in
`geo_code`, and must form complete `1..N` sequences with no gaps. Uniqueness alone is
not sufficient — a code of `"NaN"` is unique.

## 4. Source corrections

The transcription of Legal Notice 14 contains defects. They are repaired through
`data/geography/source/legal-order-transcription/corrections.csv`, never by editing the
source and never silently in code. Each correction records the field, the original
value, the replacement, a reason, the evidence and a reviewer, and every applied
correction is written to `registry/applied-corrections.json` on each build.

Corrections applied to date:

| ID | Subject | Change | Evidence |
|---|---|---|---|
| KDA-COR-0001 | Baringo North constituency | `CONSTITUENCY ID` `#N/A` → `158` | 158 is the only gap in the 1..290 sequence (Tiaty 157, Baringo Central 159); the HDX IEBC constituency shapefile records `CONST_CODE 158` for Baringo North |

Spreadsheet error values (`#N/A`, `#REF!`, `#VALUE!` and similar) are rejected at parse
time. They are never coerced to a number.

Names have internal whitespace collapsed at parse time. Three source names carried
double or triple spaces; uncorrected they propagate into slugs, aliases and geometry
name matching, and cause a normalised name to fail to match itself.

## 5. Boundary versioning

`boundary_version` records the **legal delimitation era**, not the file the coordinates
came from.

```text
boundary_version    2012-01              the era
geometry_source_id  HDX-…-2019           where these coordinates came from
geometry_revision   1                    bumped when coordinates improve
```

This separation matters. If IEBC-issued geometry for the same 2012 boundaries is
obtained later, it increments `geometry_revision` — it does not create a new era. An era
change means the boundaries themselves changed, which would invalidate comparisons
across it.

**Current era.** The 2012 first review has been in force since the 2013 general
election. In January 2026 the IEBC announced a phased approach to the second review and
confirmed that no constituency or ward boundaries will change before the August 2027
general election; substantive delimitation follows the poll. `2012-01` is therefore the
only era in scope for this dataset, and the 2013 / 2017 / 2022 / 2027 elections form a
closed, internally comparable set on one boundary definition.

## 6. Geometry pipeline

```text
Legal Notice 14 transcription + corrections.csv
        │
        ▼
   canonical registry              1 / 47 / 290 / 1,450
        │
        ▼
   ward geometry ingest            external ward layer reconciled to the registry
        │  ├─ blank source records dropped before matching
        │  ├─ every polygon normalised to valid OGC geometry
        │  ├─ degenerate polygons rejected
        │  └─ match method, match score and quality status recorded per feature
        ▼
   dissolve                        constituency ← wards
                                   county       ← constituencies
                                   country      ← counties
```

### 6.1 Why parents are dissolved

The project previously published three independently sourced layers. Independently
digitised layers cannot nest. Measured against each other they produced:

- 198 of 1,450 wards overlapping their parent constituency by under 90%;
- 81 of 290 constituencies whose wards covered less than 90% of the parent;
- 20 wards whose polygon fell outside the assigned constituency entirely.

Dissolving parents from children makes correct nesting true **by construction**. After
the change, all 1,450 wards sit at ≥99% inside their constituency, all 290
constituencies at ≥99% inside their county, and ward-union coverage of every
constituency is 1.000 with zero spill.

**The trade-off is deliberate and stated:** parent edges inherit the ward layer's
accuracy rather than the older constituency layer's. Internal consistency matters more
to this product than agreement with a third party's coastline. The 2018 layers are
retained under `data/geography/reference/` as independent cross-checks, and divergence
is measured and published rather than discarded.

### 6.2 Ward name reconciliation

Ward names are matched to the registry through a cascade, most confident first:

| Method | Wards | What it means |
|---|---|---|
| `canonical_code_or_normalized_name` | 1,335 | Exact normalised name within the correct county |
| `county_constituency_fuzzy_name` | 74 | Fuzzy name within the correct county and constituency |
| `spatial_parent_and_fuzzy_name` | 23 | Polygon falls in exactly one constituency, then fuzzy name |
| `complete_parent_group_residual_assignment` | 15 | Residual set within one constituency matched one-to-one |
| `unique_spatial_parent_residual_assignment` | 2 | Exactly one unmatched candidate remained in the containing constituency |
| `complete_county_residual_assignment` | 1 | Residual set within one county matched one-to-one |

Every feature records the method and score it was matched by. Anything below an exact
match is flagged for review in the ingest report.

## 7. Quality status

`quality_status` is derived from the match method and measured containment, never
assigned flat. A flat label across every record is a decorative label.

| Status | Meaning |
|---|---|
| `validated_external` | Exact match, agrees with the independent reference layer |
| `validated_external_with_review` | Matched by a fallback method; reviewed, agrees with the reference |
| `provisional` | Sits entirely outside the reference parent layer — an unresolved conflict between sources |
| `derived_validated` | Dissolved from children that are all validated |
| `derived_provisional` | Dissolved from children where at least one is provisional |
| `rejected` | Degenerate or otherwise unpublishable. Never published |

## 8. Registered divergences

`data/geography/reference-divergence.json` lists every ward whose polygon disagrees with
the independently sourced 2018 constituency layer: 194 divergences, of which 15 are
outright parent conflicts.

Those 15 were checked individually against the 2012 delimitation. **In every case the
registry assignment is correct and the reference layer is wrong** — for example Nyayo
Highrise is a Langata ward, Komarock is an Embakasi Central ward, and the Tinderet /
Nandi Hills cases are a clean four-ward swap in the reference layer. They are recorded
as provisional and published, not suppressed.

## 9. Known limitations

1. **Not IEBC-issued.** All geometry is externally sourced and reconciled. It is not
   supplied by, endorsed by or verified against an authoritative IEBC register. Records
   remain `registry_status: provisional` until that verification happens.
2. **Ward-layer taxonomy is unconfirmed.** The ward geometry comes from a dataset titled
   *Administrative Wards in Kenya 1450*, attached to geographies recorded as electoral.
   A 1,450-ward layer is in practice the County Assembly Wards, but the publisher does
   not state that lineage and it has not been confirmed. See `source-manifest.json`.
3. **Parent geometry inherits ward-layer edges** (§6.1).
4. **No simplified geometry yet.** `simplified_geometry` is unpopulated; per-zoom
   simplification and tiling are outstanding.
5. **No administrative geography.** The census, NGAO, health and education taxonomies
   are not yet loaded, so no crosswalk to administrative units exists. This blocks all
   census-derived ward content.

## 10. Reproducing and checking

```bash
npm run geography:build      # registry → ward geometry → dissolve parents
npm test                     # registry, catalogue and geometry assertions
npm run geography:audit      # independent geometric audit (requires: pip install shapely)
```

`npm test` fails on any malformed code, incomplete sequence, irregular whitespace,
unresolved duplicate source match, degenerate polygon, unclosed ring, hash mismatch,
flat quality label, wrong boundary era, or nesting failure.

`audit-geometry.py` is written independently of the build and re-derives the same
findings from the published artefacts alone. It is the check that caught the defects
this document describes, and it should be run on every rebuild.
