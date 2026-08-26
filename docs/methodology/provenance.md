# Provenance and source lineage

Every Atlas observation must eventually resolve through:

```text
Observation → Series → Release → Dataset → Source → Agency
```

Where practical it also resolves to an archived source file, table, worksheet, page, row and transformation version.

## Distinct entities

- **Agency:** the organization responsible for publication.
- **Source:** a publication portal, report series, API, legal instrument or other channel.
- **Dataset:** a coherent statistical or geographic collection.
- **Release:** a dated/versioned publication of a dataset.
- **Source file:** an exact file or response used in processing.

These entities are not interchangeable. A new quarterly report is a release, not a new agency or dataset.

## Source files

Where reuse and storage permit, the Atlas retains the original filename, URL, retrieval time, media type, byte size and SHA-256 fingerprint. A source that is referenced but not archived says so explicitly.

## Assessments

`not_assessed`, `in_review`, `approved`, `approved_with_conditions`, `evaluation_only` and `rejected` describe source assessment. They are separate from whether an individual dataset or release is published.

## Community data

Community transcriptions and open-source extracts may support discovery and cross-checking. They retain their original licence and are never relabelled as an official release. Conflicts with controlling legal or agency sources are recorded as quality findings.

