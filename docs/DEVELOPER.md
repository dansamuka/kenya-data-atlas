# Kenya Data Atlas — Developer Guide

P15 turns the existing canonical registries into a documented static data interface. No application server is required: the same files used by the public website can be consumed directly from GitHub Pages, raw GitHub, a pinned commit, or a future release tag.

## Start here

The machine-readable entry point is:

`data/distribution/manifest.json`

It reports the application/data release version, the independent data-contract version, record counts, methodology versions, file sizes, SHA-256 checksums, format availability and subset patterns.

For reproducible research, **pin a Git commit or release tag** rather than consuming `main` indefinitely.

## Published formats

### JSON

Canonical arrays remain the authoritative registry products:

- `data/indicators/registry/indicators.json`
- `data/indicators/registry/series.json`
- `data/indicators/registry/observations.json`
- `data/geography/registry/geographies.json`
- `data/catalogue/registry/datasets.json`
- `data/results/county-results.json`
- `data/evidence/county-documents.json`

### CSV

Core registries already have canonical CSV counterparts. P15 also publishes flattened analytical/evidence extracts:

- `data/distribution/csv/county-results.csv`
- `data/distribution/csv/evidence-records.csv`

### NDJSON

Streaming-friendly one-record-per-line files live under:

`data/distribution/ndjson/`

This is useful when a consumer does not want to parse the full observations array in memory.

### Parquet

Parquet is **not committed in P15**. Adding a binary Parquet writer to the deterministic static build would materially increase the build dependency surface for a format that can be reproduced from the published CSV/NDJSON.

A local conversion is straightforward, for example:

```python
import pandas as pd

observations = pd.read_csv("data/indicators/registry/observations.csv")
observations.to_parquet("observations.parquet", index=False)
```

This deliberately keeps Parquet a consumer-side representation rather than a second canonical data store.

## Query-sized subsets

### County bundle

Every county has one self-contained JSON bundle. Example:

`data/distribution/subsets/counties/KEN-C032.json`

A county bundle contains:

- the canonical geography record;
- the public CountyIQ result;
- all series whose geography is that county;
- all observations belonging to those series;
- all indexed P13 evidence records for the county.

The complete county index is:

`data/distribution/subsets/counties/index.json`

### Indicator bundle

Every canonical indicator has one bundle. Example:

`data/distribution/subsets/indicators/IND-POPULATION.json`

It contains the indicator definition, unit, all concrete series for that indicator and all corresponding observations, with convenience join fields such as `geo_code`, `series_code`, `unit_code` and `dataset_code` added to the subset representation.

The complete indicator index is:

`data/distribution/subsets/indicators/index.json`

## JSON Schemas

Record-level Draft 2020-12 schemas are published under:

`data/distribution/schemas/`

P15 includes schemas for:

- indicators;
- series;
- observations;
- geographies;
- datasets;
- public county results;
- county evidence records.

The first public data-contract version is `1.0.0`. Schemas permit additional properties so additive fields can be introduced without automatically breaking consumers.

## Version model

Kenya Data Atlas separates three concepts that should not be conflated:

| Version | Meaning |
| --- | --- |
| Application/data release | Repository/package release containing a particular dataset state. |
| Data contract | Shape/semantic contract for the public developer surface. Breaking changes increment this version. |
| Methodology | Analytical/policy version, e.g. the P12 indicator policy or CountyIQ public-results schema. |

A data refresh does not necessarily break the contract. A new analytical method does not necessarily change raw observations.

## Integrity checks

`data/distribution/checksums.sha256` contains SHA-256 checksums for the distributable canonical files, generated NDJSON/CSV, schemas and every county/indicator subset.

The P15 validator recomputes these checksums in CI and checks that:

- source counts equal manifest counts;
- every NDJSON row count matches its canonical JSON source;
- all 47 county subsets are internally scoped;
- all 98 indicator subsets are internally scoped;
- schemas and public paths exist;
- the manifest file metadata has not drifted.

## JavaScript example

```js
const base = 'https://raw.githubusercontent.com/dansamuka/kenya-data-atlas/main';

const manifest = await fetch(`${base}/data/distribution/manifest.json`).then(r => r.json());
console.log(manifest.counts);

const nakuru = await fetch(`${base}/data/distribution/subsets/counties/KEN-C032.json`).then(r => r.json());
console.log(nakuru.county_result.fiscal_delivery);
```

For a reproducible application, replace `main` with a release tag or commit SHA.

## Python example

```python
import json
from urllib.request import urlopen

base = "https://raw.githubusercontent.com/dansamuka/kenya-data-atlas/main"
url = f"{base}/data/distribution/subsets/indicators/IND-POPULATION.json"

with urlopen(url) as response:
    population = json.load(response)

for series in population["series"][:5]:
    print(series["geo_code"], series["geography_name"], series["series_code"])
```

## Shell example

```bash
curl -L \
  https://raw.githubusercontent.com/dansamuka/kenya-data-atlas/main/data/distribution/manifest.json \
  -o manifest.json

sha256sum -c data/distribution/checksums.sha256
```

## Join model

Canonical UUIDs remain the referential keys:

- `indicator_id` joins indicators → series;
- `series_id` joins series → observations;
- `geography_id` joins series/observations → geographies;
- `unit_id` joins indicators/series → units;
- `dataset_id` / `source_dataset_id` joins series/observations → catalogue datasets.

Human-readable stable codes (`IND-*`, `KEN-*`, `series_code`, `dataset_code`) are included where appropriate and are especially convenient in the P15 subset products.

## Missing data and geography rules

Do not infer a lower-level observation from a parent value. A Kenya value is not a county value; a county value is not a constituency or ward value.

Similarly, absence from a ranking is not automatically a data error. Ranking and trend gates depend on coverage, common periods, uncertainty and comparability rules. Public analytical results should be consumed from `data/results/county-results.json` rather than recreated from an arbitrary sort of all observations.

## Source rights

The repository's MIT license covers software code. It does not relicense third-party source data. Before redistributing a source dataset, inspect `DATA-NOTICE.md`, the catalogue metadata and the originating agency's terms.
