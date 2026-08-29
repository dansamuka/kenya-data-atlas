# CountyIQ data layer

This directory defines the analytical layer that CountyIQ consumes from the canonical Kenya Data Atlas registries.

## Files

- `roadmap.json` — machine-readable product target state, domain readiness, workstreams, release stages and guardrails.
- `target-schema.json` — contract for the generated `county-summary.json` analytical mart.
- `county-summary.json` — generated P02 analytical mart containing exactly 47 canonical county objects. Do not edit it by hand.

The mart is rebuilt by `npm run countyiq:build` using `scripts/countyiq/build-mart.mjs` and is checked by `scripts/countyiq/validate-mart.mjs`.

## Data flow

CountyIQ is not a second source of truth. The production flow is:

```text
Atlas source packages
  -> catalogue/geography/indicator registries
      -> scripts/countyiq/build-mart.mjs
          -> data/countyiq/county-summary.json
              -> assets/countyiq-view.js
                  -> CountyIQ routed view
```

The public CountyIQ runtime reads the mart through the shared Atlas loader. It does not join Sprint CSV files directly.

## P02 mart contract

For each of the 47 counties, the mart currently exposes only active, published, canonical county series. Each surfaced metric carries:

- canonical geography and indicator identifiers;
- latest observation plus non-superseded history;
- period and canonical unit identifier;
- statistical status, geographic method and transformation metadata;
- A–E provenance badge and source drill-through;
- dataset/release/agency lineage where available;
- recorded uncertainty fields where available in the canonical observation;
- conservative ranking eligibility metadata;
- descriptive trend eligibility/history metadata;
- domain and coverage summaries.

P02 deliberately does **not** publish composite indices, peer groups, administration/governor scores, development-gap outputs, opportunities or recognition. Those remain gated by later phases.

## Publication discipline

1. Never inherit national WDI values to a county.
2. Never fill missing counties with an average or demo value.
3. Do not rank survey measures when the indicator registry prohibits ranking or required uncertainty metadata is absent.
4. Do not publish the County Development & Performance Index until the composite-index gates in `docs/countyiq/GATES.md` pass.
5. Do not publish a governor score that treats broad county outcomes as personal causation.
6. Do not publish a live opportunity countdown without a verified primary source, status and deadline.
7. Every future recognition must be reproducible from a machine-readable rule.
8. `county-summary.json` is generated from canonical registries and must reproduce byte-for-byte from the same inputs.

See `docs/countyiq/PLAN.md` for the full depth tree and `docs/countyiq/GATES.md` for observable acceptance gates.
