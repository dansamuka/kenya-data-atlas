# Kenya Data Atlas — static MVP

A polished, responsive static prototype implementing the central product ideas in the **Kenya Data Atlas Product & Technical Specification v1.0**.

## View it

Open `index.html` directly, or serve this folder from any static host. No build step or dependencies are required. The repository is ready for GitHub Pages from the root of the default branch.

## Included in the prototype

- Universal search across example places and indicators
- Kenya → County → Constituency → Ward hierarchy
- Kenya Pulse with source, period, change and quality labels
- Schematic county map and sample Nakuru area profile
- Explicit ward-level missing-data treatment
- County comparison with benchmarks
- Rankings with comparability warning and CSV export
- Time-series explorer concept and metadata
- Data catalogue and provenance/quality badges
- Responsive layout, keyboard focus, semantic markup and mobile navigation

## Data status

This is a **demonstration interface**, not an official statistical publication. Values are illustrative unless the interface explicitly identifies them as sourced examples. Demo values must be replaced by validated observations before any public-data launch.

Quality labels demonstrate the proposed provenance system:

- **A** — official direct
- **B** — official derived
- **C** — spatially derived
- **D** — modelled
- **E** — external
- **Demo** — illustrative prototype content; not for factual use

The prototype deliberately shows unavailable values as `—` and never copies county values down to constituency or ward level.

## Structure

```text
index.html                    Main GitHub Pages entry point
assets/styles.css             Visual system and responsive layout
assets/app.js                 Demo data and interactions
data/geography/registry/      Canonical registry, aliases, boundary versions, corrections
data/geography/geometry/      Published geometry (wards canonical, parents dissolved)
data/geography/reference/     Independently sourced layers retained as cross-checks
data/geography/source/        Immutable source files, hashes and manifest
data/catalogue/               Agencies, sources, datasets, releases, lineage
db/schema/                    PostgreSQL + PostGIS schema
scripts/geography/            Build, ingest, dissolve, validate, audit
docs/governance/              Phase 0 governance and statistical publication system
docs/methodology/             Published methodology
CHANGELOG.md                  Release history
README.md                     Project and data-status documentation
```

## Toolchain

The published site is static: no build step, no runtime dependencies. The **data
pipeline** uses Node with one dependency, `polygon-clipping`, for dissolve, geometry
validity repair and containment measurement. The optional audit uses Python with
`shapely`.

## Project status

- **Static product prototype:** Complete
- **Phase 0 — Governance and statistical policy:** Implemented as a repository policy package
- **Phase 1 — Canonical geography foundation:** Operationally complete for the independent MVP (1/47/290/1,450 hierarchy plus externally sourced, hashed and validated WGS84 geometry; explicitly not IEBC-issued)
- **Phase 2 — Source, dataset and provenance registry:** Implemented and validated
- **Geography integrity remediation (v0.4.0):** All findings from the Phase 1 build audit closed. See [`CHANGELOG.md`](CHANGELOG.md).

### Geometry integrity

County, constituency and country polygons are **derived by dissolving the canonical ward
layer**, so the hierarchy nests by construction rather than by coincidence. All 1,450
wards sit at least 99% inside their constituency, all 290 constituencies at least 99%
inside their county, and ward-union coverage of every constituency is 1.000 with zero
spill. Every polygon is valid OGC geometry.

The independently sourced 2018 county and constituency layers are retained under
`data/geography/reference/` as cross-checks. Where they disagree with the registry, the
registry governs and the divergence is published in `reference-divergence.json` —
194 registered divergences, 15 of them parent conflicts verified against the 2012
delimitation.

`boundary_version` records the legal delimitation era (`2012-01`), never the source
file. Geometry provenance lives in `geometry_source_id` and `geometry_revision`, so
replacing the coordinates never implies the boundaries changed.

Phase 0 policies, decision rights, registers and approval templates are indexed in [`docs/governance/README.md`](docs/governance/README.md). No demonstration value in the interface is approved production data.

## Ownership model

Kenya Data Atlas is currently an independent public-interest project created and published by a private citizen using publicly available, attributed data. It is not affiliated with or endorsed by the Government of Kenya, KNBS, IEBC, CBK, the United Nations, UNDP or any other source organization. The governance package is designed to scale into an institutional model if the project is later acquired, sponsored or operated by an NGO or public-interest organization.

## GitHub Pages

In the repository settings, choose **Pages → Deploy from a branch**, select the default branch and `/ (root)`. The site has no server-side requirements.

On Windows, `push-to-github.cmd` can push the current checked-out branch to the configured `origin` remote. It must be run from a Git working copy. The separately supplied Phase 1 complete ZIP includes that working-copy metadata; ordinary GitHub source-code ZIP downloads do not.

## Production path

The next data phase should replace demo observations with validated source releases, observation vintages, an API and automated quality checks. Every observation should retain agency, dataset, release, source table/page, reference period, publication date, ingestion date, method and quality status.

The Phase 1 registry can be rebuilt and validated with `npm run geography:build` and `npm test`. An independent geometric audit, written against the published artefacts alone, runs with `npm run geography:audit` (requires `pip install shapely`). It contains 1 country, 47 counties, 290 constituencies and 1,450 wards with deterministic IDs, canonical codes, parents and search aliases. See [`data/geography/README.md`](data/geography/README.md).

Phase 2 adds 12 agencies, 12 publication sources, 16 dataset families, 4 retained/reference releases, 8 source-file records and 40 validated lineage edges. See [`data/catalogue/README.md`](data/catalogue/README.md).

## Accessibility and browser support

The MVP uses semantic landmarks, a skip link, visible focus states, responsive tables and keyboard-accessible controls. Before public launch, run a formal WCAG 2.2 AA audit and test current Chrome, Firefox, Safari and Edge versions.
