# Source and dataset catalogue

Phase 2 implements the Atlas provenance chain:

```text
Agency → Source → Dataset → Release → Source file
```

The registry contains initial priority agencies and dataset families, but it does not pretend that an unassessed public webpage is licensed or publication-ready. `blocked`, `evaluation` and `approved` statuses are explicit.

## Build and validate

```sh
npm run catalogue:build
npm run catalogue:validate
```

Archived evaluation files receive byte size and SHA-256 fingerprints during the build. Lineage edges are generated for every relationship and validated for referential integrity.

## Outputs

- `registry/agencies.*`
- `registry/sources.*`
- `registry/datasets.*`
- `registry/releases.*`
- `registry/source-files.*`
- `registry/lineage.json`

## Publication rule

Registry inclusion is not publication approval. Every real release still requires a completed source assessment, documented reuse basis, archived original where permitted, release-level review and Phase 0 publication checklist.

