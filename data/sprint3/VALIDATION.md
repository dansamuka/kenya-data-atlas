# Data Sprint 3 — Historical Kenya validation

Release target: **Kenya Data Atlas v0.9.0**

This file records the acceptance results for the frozen Sprint 3 source package and its native Atlas promotion. The release was independently rebuilt and validated together with the existing World Bank national integration, Sprint 1 County Core, and Sprint 2 Local Kenya data.

## Raw source package

| Dataset | Validated rows | Coverage |
| --- | ---: | --- |
| KNBS CPI inflation | 259 | Jan 2005–Jul 2026, monthly |
| CBK Central Bank Rate | 122 | Historical decisions through Aug 2026 |
| CBK USD/KES monthly average | 403 | Continuous monthly history through Jul 2026 |
| CBK 91-day Treasury bill monthly average | 405 | Monthly historical series |
| EPRA Super Petrol — Nairobi pricing town | 6 | Published pricing cycles; **not a Nairobi County average** |
| Controller of Budget county fiscal history | 517 | 47 counties × 11 fiscal years, FY2013/14–FY2023/24 |

## Native Atlas promotion

Sprint 3 validation passed with:

- 259 CPI observations;
- 122 CBR observations;
- 403 monthly FX observations;
- 405 monthly 91-day T-bill observations;
- 188 county fiscal series across 12 fiscal years once Sprint 1 FY2024/25 is included;
- all 47 counties present for every historical Controller of Budget fiscal year;
- no Controller of Budget values published below county level;
- monthly FX kept separate from the daily FX series;
- monthly T-bill averages kept separate from auction observations;
- EPRA historical Nairobi values explicitly treated as pricing-town observations rather than county averages.

## Combined release validation

The combined World Bank + Sprint 3 deterministic build passed the full Atlas validation suite with:

- **79 indicators**;
- **2,242 series**;
- **5,736 observations**;
- geography registry validation PASS;
- catalogue validation PASS;
- indicator/provenance validation PASS;
- World Bank integration validation PASS;
- Sprint 1 validation PASS;
- native API validation PASS;
- Sprint 2 validation PASS;
- Sprint 3 validation PASS.

The successful release-validation workflow also regenerated and committed the combined native catalogue and indicator registries.

## Geographic-method note: EPRA pricing-town proxy

EPRA publishes maximum retail prices for named pricing towns. A Nairobi pricing-town value is therefore not represented as an official Nairobi County average. When a pricing-town observation is surfaced through a county-linked Atlas series, `geographic_method = proxy` is used and derives a **Class C / spatially derived** badge with an explicit limitation note. It is never inherited to constituencies or wards.

## Publication rule

The frozen CSV snapshots in this directory are the audit inputs. The machine-readable public API surface remains the generated files under `data/catalogue/registry/` and `data/indicators/registry/`. A release is publishable only when `npm run build:data` is deterministic and `npm test` passes against the committed outputs.
