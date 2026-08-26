# Corrections and revisions policy

## Definitions

- **Revision:** a source agency or approved method updates a previously valid statistic.
- **Correction:** the Atlas fixes an ingestion, mapping, transcription, calculation or presentation error.
- **Withdrawal:** an observation or release is removed from normal public use because it is unsafe, unlawful or materially unreliable.
- **Vintage:** a reconstructable snapshot of what was published at a point in time.

## Non-destructive rule

Published observations are immutable. A replacement creates a new observation and vintage linked with `supersedes_observation_id`. The prior record remains available for audit and vintage reconstruction, subject to privacy or legal restrictions.

## Workflow

```text
Reported or detected
→ triaged and assigned
→ source and lineage checked
→ impact assessed
→ correction/revision prepared
→ independently reviewed
→ approved
→ published or withdrawn
→ reporter and affected users notified where appropriate
→ record closed with evidence
```

## Materiality

A change is material when it could alter a reasonable user’s conclusion, ranking, comparison or quoted result; changes geography or unit; affects many observations; or concerns privacy/legal compliance.

Material changes require:

- a public revision or correction notice;
- before/after values or an explanation if values cannot be repeated;
- affected series, periods and geographies;
- reason and source;
- publication timestamp;
- API/download version change where applicable.

Minor typographic corrections that do not alter meaning remain in the audit log but need not receive a prominent public notice.

## Emergency withdrawal

Critical privacy, legal or severe integrity risk permits immediate containment by the Owner/Publisher or a delegated Privacy & Security Lead. The action and reason must be logged immediately and, where material, independently reviewed as soon as practicable.

Withdrawn content returns an explicit unavailable response; it must not silently fall back to an older or lower-geography value.

## Source revisions

When an agency revises data:

- archive the new release separately;
- compare it with the prior release;
- identify every added, removed and changed observation;
- retain both source files and vintages;
- publish the current approved value by default;
- allow historical-vintage retrieval through the future API;
- reproduce the agency’s revision reason where available.

## User reports

Every dataset page will provide “Report a data issue.” Reports receive an identifier and status. The outcome is documented as corrected, source-confirmed, duplicate, not reproducible or rejected with reason.

## Service targets

- Critical: contain immediately.
- High: acknowledge within 1 business day and publish a status within 5.
- Medium: acknowledge within 5 business days.
- Low: include in routine backlog review.

Final resolution time may depend on source clarification or specialist review and must not be fabricated. Source-agency confirmation is sought where useful but is not presumed to be available.

