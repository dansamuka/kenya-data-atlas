# Kenya Data Atlas — Initial-load performance budget

Phase: **P01 — Initial-load performance + shared registry loader**

This document defines the static-site loading contract introduced in P01. It is an architectural guardrail, not a claim about measured end-user transfer time. Repository byte sizes below are uncompressed file sizes; actual browser transfer depends on GitHub Pages/CDN compression and caching.

## Why P01 was needed

Before P01, several independent frontend modules could each request the same canonical registries. The largest committed products are approximately:

- `data/indicators/registry/observations.json` — about **8 MB**;
- `data/indicators/registry/series.json` — about **3 MB**;
- `data/geography/registry/geographies.json` — about **0.9 MB**;
- county geometry — about **8 MB**;
- constituency geometry — about **22 MB**;
- ward geometry — about **44 MB**.

The previous page also loaded D3 statically and loaded a Sprint 2 browser overlay that reconstructed data already present in the canonical native registry. A single page visit could therefore begin expensive work that was unnecessary for the headline shell and could repeat identical registry downloads across modules.

## P01 loading contract

### First paint

The initial shell may load:

- the ordinary HTML/CSS/critical JavaScript;
- `data/ui/initial-pulse.json` — a compact generated six-card national display product;
- three small frozen County Core CSVs for the basic county profile:
  - `data/sprint1/gcp-2020-2024.csv`;
  - `data/sprint1/county-budget-fy2024-25.csv`;
  - `data/sprint1/voters-2022.csv`.

The compact display product is generated from committed source/seed data during `npm run build:data`. It is not a second statistical source of truth.

### Deferred

The following are outside the initial-data path:

- master `series.json`;
- master `observations.json`;
- D3;
- county/constituency/ward geometry;
- the full Compare analytical engine data;
- World Bank/cross-level integration data.

Compare and Geo Explorer request the master registries only when their sections approach the viewport or the user explicitly invokes them. All consumers use the same `window.KDAData` promise cache, so the same canonical JSON resource is downloaded at most once per page lifecycle.

Geometry is level-on-demand. Opening the Kenya view requests county geometry; a county drill-down requests constituency geometry; ward geometry is not requested until constituency/ward exploration actually needs it.

D3 is map-only and dynamically loaded through `KDAData.ensureD3()`. If D3 cannot load, the map shows a local unavailable state while the rest of the Atlas remains interactive.

## Retired runtime overlays

`index.html` no longer loads:

- `assets/sprint2-data.js`;
- `assets/sprint1-ui.js`;
- `assets/sprint2-ui.js`.

Sprint 1 and Sprint 2 are already promoted into the committed canonical registries. The Sprint 2 Mandera East/Lafey spatial hold remains disclosed in the Geo Explorer instead of requiring a runtime data mutation layer.

`assets/unit-system.js` and `assets/worldbank-integration.js` remain part of the product but load through `assets/lazy-integrations.js` rather than first paint.

## Enforced budgets

`scripts/performance/validate-p01.mjs` enforces these uncompressed repository-byte ceilings:

| Budget | Ceiling |
| --- | ---: |
| Direct local JavaScript listed by `index.html` | 130 KiB |
| First-paint data (`initial-pulse` + 3 County Core CSVs) | 24 KiB |
| `initial-pulse.json` alone | 12 KiB |

The validator also fails if D3 or the retired runtime overlays are reintroduced as direct scripts, if the shell directly references the master observations/series registries, or if Compare/Geo stop using the shared lazy loader.

These ceilings are deliberately architectural. A later public-launch performance phase should add real browser/network measurements, compression-aware transfer sizes, Core Web Vitals and slow-network testing.

## Failure behaviour

P01 treats optional heavy surfaces as enhancements rather than prerequisites for the shell:

- headline data failure does not remove navigation/search structure;
- Compare failure is contained within Compare;
- D3 or map-registry failure is contained within Geo Explorer;
- optional World Bank/unit integration failure does not break the base page;
- CountyIQ retains its separate production → bundled-sample → unavailable resilience path from P00.

## Validation

The release gate is:

```bash
npm run build:data
npm run performance:validate
npm test
npm run geography:audit
```

CI also rebuilds generated data and fails if `data/ui/initial-pulse.json` drifts from its deterministic builder output.
