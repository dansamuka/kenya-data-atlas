# Kenya Data Atlas — static MVP

A polished, responsive static prototype implementing the central product ideas in the **Kenya Data Atlas Product & Technical Specification v1.0**.

## View it

Open `index.html` directly, or serve this folder from any static host. The published application has no server-side dependency and is ready for GitHub Pages from the root of the default branch.

## Included in the prototype

- Universal search across places and indicators
- Kenya → County → Constituency → Ward hierarchy
- Kenya Pulse with source, period, change and quality labels
- Real D3 geographic explorer with one authoritative ranking panel
- Dedicated **Compare** workspace with **Direct Compare** and **My Life Elsewhere** modes
- County profiles with source-backed County Core statistics
- Explicit lower-level missing-data treatment
- IEBC registered-voter drill-down to constituency and ward where spatial attribution is safe
- Time-series explorer concept and metadata
- Native downloadable JSON/CSV data and catalogue registries
- Data catalogue and provenance/quality badges
- Responsive layout, keyboard focus, semantic markup and mobile navigation

The earlier standalone Rankings prototype remains retired: the Geo Explorer is the single user-facing ranking surface. Compare is now deliberately separate from ranking. Its Direct mode puts all available county metrics side by side; its My Life Elsewhere mode translates only common-period, genuinely comparable county observations into plain-language differences. Missing data, mismatched periods and geography limitations are shown rather than filled in, and national World Bank values are never inherited to counties.

## Data status

Kenya Data Atlas is an **independent demonstration/public-interest data project**, not an official statistical publication. Real source-backed observations are explicitly traceable; remaining illustrative UI figures are labelled as demo content.

Quality labels use the Atlas provenance system:

- **A** — official direct
- **B** — official derived/transformed
- **C** — spatially derived
- **D** — modelled
- **E** — external
- **Demo** — illustrative prototype content; not for factual use

The Atlas deliberately shows unavailable values as `—` and never copies county values down to constituency or ward level.

## Structure

```text
index.html                    Main GitHub Pages entry point
assets/styles.css             Visual system and responsive layout
assets/app.js                 Base UI interactions
assets/compare.js             Dedicated two-mode county comparison engine
assets/compare.css            Compare workspace visual/responsive system
assets/geo-explorer.js        Canonical geographic map/ranking explorer
assets/sprint1-ui.js          County Core profile/coverage presentation
data/geography/registry/      Canonical registry, aliases, boundary versions, corrections
data/geography/geometry/      Published geometry (wards canonical, parents dissolved)
data/geography/reference/     Independently sourced layers retained as cross-checks
data/geography/source/        Immutable source files, hashes and manifest
data/catalogue/registry/      Native agencies, sources, datasets, releases and lineage outputs
data/indicators/registry/     Native machine-readable units, indicators, series and observations
data/sprint1/                 Audited County Core source package
data/sprint2/                 Local Kenya source/provenance package
db/schema/                    PostgreSQL + PostGIS schema
scripts/geography/            Build, ingest, dissolve, validate, audit
scripts/indicators/           Build and release-validation pipeline
scripts/sprint1/              County Core native-registry promoter
docs/governance/              Governance and statistical publication system
docs/methodology/             Published methodology
CHANGELOG.md                  Release history
```

## Native machine-readable data

As of v0.8.0, the committed registry files are the same County Core data products used by the live site. Sprint 1 is no longer added only inside the browser.

The principal downloadable files are:

- `data/indicators/registry/indicators.json` / `.csv`
- `data/indicators/registry/series.json` / `.csv`
- `data/indicators/registry/observations.json` / `.csv`
- `data/catalogue/registry/datasets.json` / `.csv`
- `data/catalogue/registry/releases.json` / `.csv`

`npm run build:data` regenerates these products from their source/seed inputs. `npm run native-api:validate` checks that Sprint 1's complete county coverage is actually present in the committed registry rather than only in a frontend overlay.

## Toolchain

The published site itself is static. The **data pipeline** uses Node with `polygon-clipping` for dissolve, geometry validity repair and containment measurement. The independent geometry audit uses Python with `shapely`.

Useful commands:

```bash
npm run build:data
npm test
npm run geography:audit
```

`npm test` also runs `node --check assets/compare.js`, so syntax regressions in the dedicated comparison engine are release-blocking.

## Project status

- **Static product prototype:** Complete
- **Phase 0 — Governance and statistical policy:** Implemented
- **Phase 1 — Canonical geography foundation:** Operationally complete for the independent MVP (1/47/290/1,450 hierarchy plus externally sourced, hashed and validated WGS84 geometry; explicitly not IEBC-issued)
- **Phase 2 — Source, dataset and provenance registry:** Implemented and validated
- **Data Sprint 1 — County Core:** Native-registry publication complete
- **Data Sprint 2 — Local Kenya:** IEBC 47/290/1,450 statistical hierarchy ingested; unsafe spatial assignments explicitly held
- **Compare workspace:** Dedicated county comparison surface implemented; Direct mode auto-discovers published county metrics and My Life Elsewhere uses matched-period observations only

### Geometry integrity

County, constituency and country polygons are **derived by dissolving the canonical ward layer**, so the hierarchy nests by construction rather than by coincidence. All 1,450 wards sit at least 99% inside their constituency, all 290 constituencies at least 99% inside their county, and ward-union coverage of every constituency is 1.000 with zero spill. Every polygon is valid OGC geometry.

The independently sourced 2018 county and constituency layers are retained under `data/geography/reference/` as cross-checks. Where they disagree with the registry, the registry governs and the divergence is published rather than hidden.

`boundary_version` records the legal delimitation era (`2012-01`), never the source file. Geometry provenance lives in `geometry_source_id` and `geometry_revision`, so replacing coordinates does not imply that the legal boundary changed.

## CI and reproducibility

GitHub Actions now does more than validate whatever happens to be committed. On every PR to `main` and every push to `main`, CI:

1. installs the Node and Shapely dependencies;
2. runs `npm run build:data`;
3. fails if deterministic generated registries/geometry differ from the committed outputs;
4. runs the UI syntax gate plus the full geography, catalogue, indicator, Sprint 1, native-API and Sprint 2 validators; and
5. runs the independent Shapely geometry audit.

This makes seed/output drift, comparison-script syntax errors and geometry-audit regressions release-blocking rather than dependent on someone remembering a manual step.

## Ownership model

Kenya Data Atlas is currently an independent public-interest project created and published by a private citizen using publicly available, attributed data. It is not affiliated with or endorsed by the Government of Kenya, KNBS, IEBC, CBK, the United Nations, UNDP or any other source organization. The governance package is designed to scale into an institutional model if the project is later acquired, sponsored or operated by an NGO or public-interest organization.

## GitHub Pages

In the repository settings, choose **Pages → Deploy from a branch**, select the default branch and `/ (root)`. The site has no server-side requirements.

## Accessibility and browser support

The MVP uses semantic landmarks, a skip link, visible focus states, responsive tables and keyboard-accessible controls. Before a formal public launch, run a WCAG 2.2 AA audit and test current Chrome, Firefox, Safari and Edge versions.
