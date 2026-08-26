# Geography methodology

Kenya Data Atlas treats geography as versioned evidence rather than a label.

## Canonical hierarchy

```text
Kenya
└── 47 counties
    └── 290 constituencies
        └── 1,450 County Assembly Wards
```

IEBC identifies constituencies and County Assembly Wards as electoral boundaries and confirms the national totals of 290 and 1,450 respectively. Administrative systems—sub-counties, divisions, locations and sub-locations—are not automatically interchangeable with electoral areas.

## Registry status

The Phase 1 registry has complete expected counts and validated internal hierarchy. The machine-readable seed is a public transcription explicitly linked to Legal Notice 14 of 2012. Record names and codes carry `provisional` status until spelling and codes are directly compared against the controlling Kenya Law document.

Two separate community packages were tested and retained for discrepancy analysis, but their ward tables contain only 1,439 and 1,448 records despite claims of 1,450 or more. They are not used as canonical ward seeds.

## Stable identity

Each geography receives an immutable UUID derived deterministically from its canonical Atlas code. Names and URL slugs may change without changing identity. Aliases support punctuation and common search variants.

## Boundary versioning

Geometry is stored separately from geography identity. Each boundary version records validity dates, source, source CRS, original and simplified geometry, centroid, area, hash and quality status. Historical observations remain connected to the geography definition applicable to their reference period.

## Crosswalks

Any conversion between administrative, statistical and electoral geographies must record source and target geographies, boundary version, method, weights, reference dataset and uncertainty. Similar names are not evidence of equivalence.

## Sources

- IEBC, *Boundary Delimitation FAQ*: https://iebc.or.ke/uploads/resources/gV62Lv1JdT.pdf
- Kenya Law, Legal Notice 14 of 2012: https://new.kenyalaw.org/akn/ke/act/ln/2012/14/eng@2022-12-31
- Pinned transcription and cross-check source hashes: `data/geography/source/source-manifest.json`

The Atlas does not imply endorsement by IEBC, HDX or the extract maintainer.

