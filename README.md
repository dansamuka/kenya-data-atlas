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
index.html          Main GitHub Pages entry point
assets/styles.css   Visual system and responsive layout
assets/app.js       Demo data and interactions
docs/governance/    Phase 0 governance and statistical publication system
README.md           Project and data-status documentation
```

## Project status

- **Static product prototype:** Complete
- **Phase 0 — Governance and statistical policy:** Implemented as a repository policy package
- **Phase 1 — Canonical geography foundation:** Implemented (complete hierarchy; record-level status provisional pending final official spelling comparison; geometry validation pending)
- **Phase 2 — Source, dataset and provenance registry:** Implemented and validated

Phase 0 policies, decision rights, registers and approval templates are indexed in [`docs/governance/README.md`](docs/governance/README.md). No demonstration value in the interface is approved production data.

## Ownership model

Kenya Data Atlas is currently an independent public-interest project created and published by a private citizen using publicly available, attributed data. It is not affiliated with or endorsed by the Government of Kenya, KNBS, IEBC, CBK, the United Nations, UNDP or any other source organization. The governance package is designed to scale into an institutional model if the project is later acquired, sponsored or operated by an NGO or public-interest organization.

## GitHub Pages

In the repository settings, choose **Pages → Deploy from a branch**, select the default branch and `/ (root)`. The site has no server-side requirements.

## Production path

The next phase should replace demo content with validated source releases, a canonical geography registry, versioned boundaries, observation vintages, an API, and automated quality checks. Every observation should retain agency, dataset, release, source table/page, reference period, publication date, ingestion date, method and quality status.

The Phase 1 registry can be rebuilt and validated with `npm run geography:build` and `npm test`. It contains 1 country, 47 counties, 290 constituencies and 1,450 wards with deterministic IDs, canonical codes, parents and search aliases. See [`data/geography/README.md`](data/geography/README.md).

Phase 2 adds 12 agencies, 12 publication sources, 16 dataset families, 4 retained/reference releases, 8 source-file records and 40 validated lineage edges. See [`data/catalogue/README.md`](data/catalogue/README.md).

## Accessibility and browser support

The MVP uses semantic landmarks, a skip link, visible focus states, responsive tables and keyboard-accessible controls. Before public launch, run a formal WCAG 2.2 AA audit and test current Chrome, Firefox, Safari and Edge versions.

