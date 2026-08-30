# Kenya Data Atlas

Kenya Data Atlas is an independent, source-auditable public data product for exploring Kenya from **country → county → constituency → ward**, comparing counties, following historical series, inspecting county rankings and fiscal delivery, and tracing published results back to source evidence.

**Live site:** https://dansamuka.github.io/kenya-data-atlas/

## Current release state

The repository is no longer the early static MVP described by older releases. P00–P13 are complete, P15 is the current data-distribution release, P16 is the next v1.0 hardening phase, and the high-maintenance Opportunity Finder has been deliberately deferred to a v1.1 Beta rather than made a v1.0 blocker.

Current canonical registry coverage:

- **1,788 geographies** — 1 country, 47 counties, 290 constituencies, 1,450 wards;
- **98 indicators**;
- **3,370 series**;
- **6,864 observations**;
- **50 datasets** and governed source/release lineage;
- **47 CountyIQ county profiles**;
- **14 complete 47-county indicator leaderboards** (658 ranked county records);
- **47 current development snapshots**;
- **46 complete FY2024/25 fiscal-delivery scores** — Narok remains explicitly unscored where a required source input is absent;
- **47 administration-period scorecards** and six reproducible recognition categories;
- **247 county evidence records** across seven official-document families.

## Public product

### Explore

Browse the canonical Kenya geography hierarchy and published indicators. Lower-level values are shown only where a real series exists; national or county values are never silently inherited downward.

### Compare

Compare counties directly or use **My Life Elsewhere** for matched-period, genuinely comparable county observations. Missing values and incompatible periods remain visible rather than being filled in.

### Series

Inspect historical statistical series with period, source, unit, provenance and observation history.

### Rankings & Insights

The dedicated results surface publishes the analytical outputs of CountyIQ rather than backend implementation detail:

- national indicator leaderboards and peer position;
- current development snapshot and robustness range;
- FY2024/25 fiscal-delivery ranking;
- county strengths, gaps and observed change;
- administration-period scorecards;
- reproducible CountyIQ Recognition;
- links back to official county evidence.

### CountyIQ

CountyIQ brings together fiscal history, health and living standards, education, economy, agriculture, connectivity, peer context, trends and official county evidence. It does not assign personal governor causal scores.

## Data distribution

P15 adds a stable developer entry point at:

- `data/distribution/manifest.json`
- `data/distribution/checksums.sha256`
- `data/distribution/schemas/`
- `data/distribution/ndjson/`
- `data/distribution/subsets/counties/`
- `data/distribution/subsets/indicators/`

The canonical JSON and CSV registries remain the same products used by the website. P15 additionally publishes NDJSON streams, record-level JSON Schemas, flattened county-results/evidence CSVs, 47 query-sized county bundles and 98 query-sized indicator bundles.

See **[`docs/DEVELOPER.md`](docs/DEVELOPER.md)** for data contracts, version pinning and example queries.

### Core canonical files

- `data/indicators/registry/indicators.json` / `.csv`
- `data/indicators/registry/series.json` / `.csv`
- `data/indicators/registry/observations.json` / `.csv`
- `data/geography/registry/geographies.json` / `.csv`
- `data/catalogue/registry/datasets.json` / `.csv`
- `data/results/county-results.json`
- `data/evidence/county-documents.json`
- `data/policy/indicator-policy.json`

## Quality and methodological controls

The Atlas deliberately distinguishes between what the data can support and what would merely make the product look more complete.

- Survey outcomes requiring sampling uncertainty are not forced into unsafe league tables.
- The current County Development Snapshot is published as a cross-sectional result; a longitudinal composite remains withheld because the historical evidence does not pass the stated stability gate.
- Missing fiscal inputs are not imputed simply to complete a ranking.
- Parent-geography values are never copied to child geographies.
- Cross-level comparison is limited to series whose units and transformations support it.
- County administration scorecards describe observed administration-period records; they do not claim personal causal attribution.

## Build and validation

The public site is static, while the data pipeline is deterministic and release-blocking.

```bash
npm ci
npm run build:data
npm test
npm run geography:audit
```

`npm run build:data` rebuilds geography, catalogue, indicators, CountyIQ, evidence, results and the P15 distribution surface. CI fails if generated outputs drift from committed products. The independent geometry audit uses Python/Shapely.

Useful focused commands:

```bash
npm run results:validate
npm run distribution:validate
npm run countyiq:validate
npm run indicators:validate
npm run evidence:validate
```

## Versioning

Three versions are intentionally distinct:

1. **Application/data release version** — the repository/package release, currently `0.18.0` after P15.
2. **Data contract version** — currently `1.0.0`; changes only when the public distribution contract breaks.
3. **Methodology versions** — e.g. the canonical indicator policy and analytical result schemas, which can evolve independently of raw data refreshes.

For reproducible analysis, pin a Git commit or release tag rather than consuming `main` indefinitely.

## Licensing, source rights and citation

Software code in this repository is licensed under the **MIT License**; see [`LICENSE`](LICENSE).

The MIT license does **not** relicense third-party source data. Source-specific rights, terms and attribution requirements continue to govern underlying datasets. See [`DATA-NOTICE.md`](DATA-NOTICE.md) and the catalogue/source metadata before redistribution.

Citation metadata is provided in [`CITATION.cff`](CITATION.cff).

## Governance and roadmap

- [`ROADMAP.md`](ROADMAP.md) — concise phase status
- [`data/project-roadmap.json`](data/project-roadmap.json) — machine-readable completion ledger
- [`docs/REPO-COMPLETION-PLAN.md`](docs/REPO-COMPLETION-PLAN.md) — phase acceptance criteria
- [`docs/USER-FACING-RESULTS.md`](docs/USER-FACING-RESULTS.md) — public analytical-output boundary
- [`docs/governance/`](docs/governance/) — statistical publication and governance controls
- [`docs/methodology/`](docs/methodology/) — published methodologies

The remaining v1.0 path is **P16 real-browser/accessibility/SEO/performance hardening → P17 final reproducibility/governance/release**. P14 Opportunity Finder is intentionally targeted to v1.1 Beta because programme freshness requires ongoing maintenance.

## Independence notice

Kenya Data Atlas is an independent public-interest project using publicly available, attributed data. It is not affiliated with or endorsed by the Government of Kenya, KNBS, IEBC, CBK, the United Nations, UNDP or any other source organisation.
