# P13 — County Evidence & Knowledge Hub

**Status: complete.**

P13 turns the Atlas county profile into an evidence doorway for official planning, budget and accountability documents. It is intentionally a document-discovery layer, not another analytical score.

## Release scope

The first release targets 47/47 third-generation County Integrated Development Plans (CIDP 2023–2027), Controller of Budget implementation evidence, Auditor-General county-government audit collections, CFSP and CBROP discovery, and richer ADP/CFSP/CBROP/approved-budget source hubs where official county pages were separately verified.

`scripts/evidence/build-registry.mjs` is the deterministic source definition and generates `data/evidence/county-documents.json` via `npm run evidence:build`.

## Evidence-state model

P13 deliberately distinguishes:

- `verified_document` — exact official document/file or repository item is pinned;
- `verified_source_page` — an official page identifies the document or family, but the Atlas does not assert an exact file unless separately pinned;
- `verified_source_collection` — an official repository/collection is a verified discovery doorway, not a pinned county file;
- `not_published` — evidence indicates the document was not published for the stated period;
- `not_found` — a reasonable official-source search did not locate it, which is not proof it was never published;
- `inaccessible` — a known source existed but could not be accessed or verified at the last check.

Unavailable states may never carry a fabricated document URL and must include an explicit reason.

## CIDP baseline

The core CIDP baseline uses the Council of Governors’ Maarifa Centre third-generation CIDP collection wherever a county record is available. Counties absent from that common collection are filled only from official county-government sources. This creates a reproducible 47-county baseline without treating mirrors or search results as authoritative evidence.

## Shared accountability evidence

The Office of the Controller of Budget FY2024/25 consolidated County Governments Budget Implementation Review Report is modelled as a national report with county-specific sections. It is not mislabelled as a stand-alone county budget.

The Office of the Auditor-General 2023/24 county-government audit collection is modelled as `verified_source_collection` until an exact county report is separately pinned. KIPPRA’s Public Policy Repository is used the same way for CFSP and CBROP discovery: it is a government evidence doorway, not an assertion of an exact county file.

## County-source enrichment

The initial release also includes richer official source hubs for Kajiado, Nyeri, Elgeyo Marakwet, Migori and Makueni, covering combinations of ADP, CFSP, CBROP and approved-budget material. Later evidence refreshes can promote a source-page/collection record to `verified_document` without changing the UI contract.

## UI

The Evidence Hub is loaded only with CountyIQ and does not alter P09–P12 analytical calculations. It provides full-text evidence search, document-family filtering, counts by verification type, explicit status chips, verification dates, evidence scope and official source/document links.

## Validation

`npm run evidence:validate` checks exactly 47 canonical counties, 47/47 CIDP coverage, at least three additional document families, common budget-implementation/audit/CFSP/CBROP evidence doorways, approved official-source hostnames, no fragment/placeholder links, unavailable-state reasons, and Evidence Hub build/UI wiring.

P13 is complete only when the full Atlas test suite and independent geometry audit remain green.
