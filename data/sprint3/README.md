# Data Sprint 3 — Historical Kenya

Data Sprint 3 converts the Atlas from a mostly point-in-time/current-state product into a genuinely historical data product. It backfills selected high-value time series from KNBS, the Central Bank of Kenya (CBK), the Energy and Petroleum Regulatory Authority (EPRA), and the Office of the Controller of Budget (CoB), while preserving the statistical meaning of each source.

## Scope

| Source | Historical series | Geography | Frequency / period type |
|---|---|---|---|
| KNBS / CBK historical table | Headline CPI inflation, year-on-year | Kenya | Monthly |
| CBK | Central Bank Rate | Kenya | MPC decision dates |
| CBK | USD/KES period-average exchange rate | Kenya | Monthly |
| CBK | 91-day Treasury bill monthly average | Kenya | Monthly |
| EPRA | Super Petrol maximum retail price, Nairobi pricing town | Nairobi pricing town | Monthly pricing cycle |
| Controller of Budget | County budget | 47 counties | Fiscal year |
| Controller of Budget | County expenditure | 47 counties | Fiscal year |
| Controller of Budget | Overall budget absorption | 47 counties | Fiscal year |
| Controller of Budget | Development budget absorption | 47 counties | Fiscal year |

The CoB backfill covers FY 2013/14 through FY 2023/24. Together with the existing Sprint 1 FY 2024/25 observations, the native county fiscal series span twelve fiscal years.

## Statistical rules

### CPI

The Atlas stores the published national year-on-year headline inflation rate. Historical observations can cross CPI rebasing regimes. The Atlas does not retrospectively recompute historical year-on-year rates onto one artificial base; the published rates are preserved and the series is labelled accordingly.

### USD/KES

The Sprint 3 exchange-rate history is the **official CBK monthly period average**. It is a separate native series from the Atlas's existing daily USD/KES market-mid reference observation. Monthly averages are not inserted into the daily series.

### 91-day Treasury bill

The Sprint 3 T-bill history is the **monthly average** published in CBK historical tables and Statistical Bulletins. It is separate from the existing weekly/auction-point 91-day Treasury bill series. Monthly averages and auction observations are not mixed.

### EPRA fuel prices

EPRA prices petroleum products by pricing town / pricing zone. The Sprint 3 fuel history therefore represents **Nairobi pricing-town maximum retail Super Petrol prices**. It is not a Nairobi County average and must not be presented as one. No value is allocated to constituencies, wards, or other counties.

### County budgets

Controller of Budget annual report values remain at county level. Sprint 3 does **not** divide, interpolate, model, or allocate a county budget or expenditure figure to constituencies or wards.

Budget and expenditure observations are direct official county values. Published overall and development absorption rates are retained where they can be reliably extracted from the annual report. Where the report exposes the official numerator and denominator but the corresponding rate is not stably machine-extractable, the Atlas stores the deterministic ratio instead. The source snapshot records this explicitly in `rate_method`; this is a statistical transformation of official county values, not a geographic allocation or model estimate.

FY 2013/14 and FY 2014/15 use the reports' consolidated annexes, including explicit handling of the source PDFs' rotated tables. Later years are anchored to the individual county sections of each annual report. Every row retains its official source URL and source page.

## Source snapshots

The immutable acquisition outputs are stored in `data/sprint3/`:

- `knbs-cpi-inflation-monthly.csv`
- `cbk-cbr-history.csv`
- `cbk-usdkes-monthly-average.csv`
- `cbk-tbill91-monthly-average.csv`
- `epra-super-petrol-nairobi-history.csv`
- `cob-county-budget-history.csv`
- `sources.json` — source URLs, hashes and acquisition metadata

`scripts/sprint3/acquire_sources.py`, together with `scripts/sprint3/acquire_cob_history.py`, is the source-acquisition program. The normal deterministic Atlas build does not depend on live government websites; it consumes the committed source snapshots.

## Native registry promotion

`scripts/sprint3/build-native.mjs` promotes the source snapshots into the Atlas catalogue and indicator registries. It:

1. creates explicit Sprint 3 dataset slices and release records;
2. backfills the existing national CPI and CBR series;
3. creates separate monthly-average USD/KES and 91-day T-bill series;
4. extends the existing Nairobi county-linked fuel series with explicitly labelled Nairobi pricing-town historical observations; and
5. extends each existing county budget/expenditure/absorption series backward to FY 2013/14.

Stable identifiers are deterministic. Re-running the build does not create duplicate observations.

## Quality gates

`scripts/indicators/validate-sprint3.mjs` validates raw-source coverage, temporal uniqueness, numerical plausibility, 47-county fiscal-year completeness, registry foreign keys, raw-to-native value agreement, and the prohibition on constituency/ward propagation. It also checks that county expenditure divided by county budget reconciles to the stored overall absorption rate within the release tolerance.

See `VALIDATION.md` for the release audit and final row counts.
