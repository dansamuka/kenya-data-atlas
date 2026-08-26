# Phase 2 acceptance — source, dataset and provenance registry

## Requirement-by-requirement status

| Requirement | Implementation | Status |
|---|---|---|
| Agency registry | 12 immutable agency records including the ten priority public bodies, Kenya Law and external community maintainers | Complete |
| Official name and abbreviation | Required and validated fields | Complete |
| Official website | Required and validated for every agency | Complete |
| Publication source registry | 12 distinct portals, report series, systems and legal/community channels | Complete |
| Expected cadence | Stored per source | Complete |
| Source priority | Critical, high, medium or cross-check classification | Complete |
| Access method | Web download, PDF, application, legal document or pinned Git commit | Complete |
| Reuse/licence status | Explicit per source; unknown conditions remain pending rather than assumed | Complete |
| Attribution | Required source-level attribution text | Complete |
| Source assessment state | Controlled states from `not_assessed` to `rejected` | Complete |
| Dataset registry | 16 initial dataset families with stable IDs | Complete |
| Dataset description/topic | Required and validated | Complete |
| Geographic coverage | Explicit array; administrative/price/market geography is not relabelled as electoral | Complete |
| Frequency and limitations | Stored per dataset | Complete |
| Publication status | `blocked`, `evaluation` or `approved` stored independently of source assessment | Complete |
| Release registry | Four real referenced or retained geography releases | Complete |
| Release URL/version/discovery | Required and validated | Complete |
| Source-file archive metadata | Eight source-file records; locally retained files have byte size and SHA-256 | Complete |
| Exact source location fields | Table, sheet and page fields exist in schema and registry | Complete; populated when applicable |
| Immutable raw files | Pinned files retained under `data/geography/source` | Complete for current evaluation releases |
| Lineage model | 40 Agency → Source → Dataset → Release → File edges | Complete |
| Referential validation | Automated orphan, duplicate, metadata and fingerprint checks | Complete |
| Postgres production schema | Agency, Source, Dataset, Release, SourceFile and LineageEdge tables | Complete |
| Public methodology | Provenance methodology explains entities, files, assessments and community data | Complete |
| Production statistical releases | No statistical data release has yet passed dataset assessment | Intentionally not claimed |

## Test result

```text
PASS: 12 agencies, 12 sources, 16 datasets, 4 releases,
8 source files and 40 lineage edges; all required metadata
and relationships valid.
```

## Decision

**Phase 2 registry implementation:** Complete.

**Source approval:** Dataset-by-dataset. Registry inclusion never means permission to republish.

**Phase 1 dependency:** Hierarchy is complete, but authoritative machine-readable geometry remains an open Phase 1B item and stays visibly `pending`.

