# World Bank indicators — Kenya Data Atlas methodology

## Scope

World Development Indicators (WDI) are integrated **only at Kenya national level**. World Bank observations must never be inherited, copied or allocated to a county, constituency or ward.

The World Bank is treated as a secondary, harmonising compiler rather than a Kenyan primary statistical agency. This is useful for internationally comparable and more frequently refreshed indicators, but it does not make a WDI value interchangeable with a KNBS, CBK, IEBC or other Kenyan primary-source value that uses a different method or reference period.

## Quality badges

World Bank observations may render only as:

- **B — Official derived:** a harmonised statistic based on an underlying official series.
- **D — Modelled:** a modelled, projected or composite series.

World Bank observations must never receive badge A (Official direct). The build pipeline enforces this by mapping configured B observations to `geographic_method=aggregated` and configured D observations to `geographic_method=modelled`; the normal registry badge derivation then produces B/D rather than trusting a stored label.

Composite indicators such as the Human Capital Index carry a visible disclosure that they are compiled indices rather than raw statistics.

## Independent comparable series

Where a WDI series and an Atlas-native Kenyan series describe a genuinely comparable concept, both remain independent first-class series. Each retains its own observations, provenance, lifecycle, methodology and quality status.

A pair may be connected with `comparable_alternate_series_id`. This relationship is metadata only. The registry validator requires it to be symmetric: A→B implies B→A. A link may not cross into a `planned` or `sourced` indicator with no published series.

For headline display, the default policy is:

1. Prefer the observation with the later `period_end` when the reference-date gap is real.
2. When both observations fall in the same year, prefer the Kenyan primary-source series.
3. Never change either indicator's lifecycle because its alternate is fresher.
4. Always leave the alternate visible and one interaction away from its full Series Explorer provenance.

## Explicit reconciliation cases

### Population

`IND-POPULATION` is the KNBS census enumeration. `IND-POPULATION-WB` is a World Bank/UN population estimate or projection. They are linked but never merged.

On county/place profiles, the census remains authoritative. On the National Pulse, a newer World Bank/UN population estimate may lead because that surface is explicitly intended as a current rolling national snapshot; the census alternate remains visible beside it.

### Inflation

The monthly KNBS `IND-CPI-INFLATION` series remains the headline. The annual WDI inflation series is background context only, even if it has a later annual reference label. Annual international harmonisation must not displace a more granular current KNBS monthly statistic.

### Electricity access

The WDI series may be linked to `IND-ELECTRICITY-ACCESS` only after the Kenyan alternate has an active national series. Until then the World Bank series stands alone. The build does not create a link across the lifecycle boundary.

### Poverty

The World Bank $3.00/day international poverty-line series is not the same measurement as Kenya's domestic monetary-poverty line. `IND-POVERTY-RATE-INTL` therefore remains a separate indicator and is explicitly prohibited from being alternate-linked to `IND-POVERTY-RATE`.

### Remittances

The World Bank remittances-as-%-of-GDP indicator is catalogued but held at `sourced` with no published series. CBK publishes the underlying remittance inflow statistics directly; a Kenyan-primary-source treatment should be designed before the Atlas promotes a remittance headline.

### Government debt-to-GDP

The configured World Bank debt-to-GDP code is deliberately excluded when no Kenya observation is available at source. Missing source data is recorded as a limitation, never converted to zero or fabricated.

## Extraction

`scripts/indicators/fetch-worldbank.mjs` calls the public World Bank API for Kenya (`KEN`), requesting observations from 2010–2026. For each configured active indicator it selects the most recent **non-null** observation. Nulls are skipped rather than interpreted as zero.

The extractor writes a seed fragment under `data/indicators/seed/derived/worldbank-latest.json`. It does not write directly to the published registry. The normal catalogue publication gate, indicator build, lifecycle pass and validators continue to apply.

If an API re-run returns the same reference period and value as the previous snapshot, the stored retrieval timestamp is retained. This avoids creating the appearance of a statistical update merely because the pipeline ran again.

## Cross-level comparison

The cross-level comparison indicator list is generated from the current registry rather than a hardcoded frontend array. An indicator is eligible in principle when:

- `unit.dimension` is `ratio`, `rate` or `index`; or
- its actual series uses a `rate`, `share` or `per_capita` transformation; or
- it is `IND-LAND-AREA`, the explicit physical-area exception.

The UI then applies a second test: the selected county/constituency/ward must each actually have an observation for that indicator. Raw population, registered-voter and currency totals remain same-level-only.

Charts use a common linear scale from zero. They do not normalize each row or silently switch to a logarithmic scale to make smaller geographies appear visually closer to larger ones.

## Update cadence

WDI is suitable for a quarterly scheduled refresh because individual indicators update irregularly and often with substantial lags. A refresh should publish a new registry state only when the source observation itself changes.
