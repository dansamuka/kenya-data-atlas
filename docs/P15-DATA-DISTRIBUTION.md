# P15 — Data Distribution & Developer Surface

**Status: complete after release validation**

P15 packages the Atlas's canonical geography, catalogue, indicator, CountyIQ and evidence products into a stable static developer interface without introducing a server merely for appearance.

## Release boundary

The website and developer surface continue to consume the same canonical registries. P15 adds generated distribution products rather than creating a parallel source of truth.

### Published developer entry point

`data/distribution/manifest.json`

The manifest records:

- application/data release version;
- independent data-contract version;
- current record counts;
- methodology/result schema versions;
- format availability;
- product paths, byte sizes and SHA-256 checksums;
- county and indicator subset patterns;
- explicit licensing/source-rights guidance.

### Formats

P15 publishes:

- canonical **JSON** arrays;
- canonical and analytical **CSV** files;
- streaming-friendly **NDJSON** for core products;
- 47 county JSON subsets;
- 98 indicator JSON subsets;
- Draft 2020-12 JSON Schemas for the main public record types.

Parquet is intentionally not committed. It remains a reproducible consumer-side conversion from the canonical CSV/NDJSON so the core deterministic build does not acquire a heavy binary-format dependency solely to duplicate the same information.

## Versioning

P15 separates:

1. application/data release version;
2. data-contract version;
3. methodology/result schema versions.

Breaking public-contract changes must increment `data_contract_version`; an ordinary source-data refresh does not automatically require a contract change.

## Integrity

`data/distribution/checksums.sha256` covers canonical distributable files, schemas, generated NDJSON/CSV and every subset product.

The P15 validator verifies source counts, file existence, manifest hashes, checksum integrity, 47 county subset isolation, 98 indicator subset isolation, schema publication, documentation wiring and the roadmap handoff.

## Licensing and citation

P15 adds:

- `LICENSE` — MIT software license;
- `DATA-NOTICE.md` — explicit statement that third-party source data are not relicensed by the software license;
- `CITATION.cff` — citation metadata;
- `docs/DEVELOPER.md` — reproducible consumer examples and version-pinning guidance.

## Roadmap decision

P14 Opportunity Finder is explicitly deferred to a **v1.1 Beta** because programme freshness creates an ongoing maintenance obligation and is not necessary to make the core Atlas a defensible v1.0.

P16 becomes the next v1.0 phase: real-browser accessibility, SEO, link-integrity and performance hardening.
