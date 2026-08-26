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
- **Phase 1 — Canonical geography foundation:** Not started

Phase 0 policies, decision rights, registers and approval templates are indexed in [`docs/governance/README.md`](docs/governance/README.md). No demonstration value in the interface is approved production data.

## GitHub Pages

In the repository settings, choose **Pages → Deploy from a branch**, select the default branch and `/ (root)`. The site has no server-side requirements.

## Production path

The next phase should replace demo content with validated source releases, a canonical geography registry, versioned boundaries, observation vintages, an API, and automated quality checks. Every observation should retain agency, dataset, release, source table/page, reference period, publication date, ingestion date, method and quality status.

## Accessibility and browser support

The MVP uses semantic landmarks, a skip link, visible focus states, responsive tables and keyboard-accessible controls. Before public launch, run a formal WCAG 2.2 AA audit and test current Chrome, Firefox, Safari and Edge versions.

