# Privacy and security policy

This is the Phase 0 minimum policy, not a substitute for legal advice or a production security assessment.

## Public-data boundary

The public Atlas publishes aggregate statistics, documented geographies and public institutional metadata. It must not ingest into the public platform:

- names, identity numbers, telephone numbers, email addresses or precise household addresses;
- row-level household or individual microdata;
- authentication secrets or private agency credentials;
- protected health, education, financial or electoral records;
- small-cell data that a source has suppressed;
- data whose licence prohibits public redistribution.

Restricted research microdata, if ever used, must remain in a separately approved environment. Only disclosure-reviewed aggregates may leave it.

## Data minimization

Collect only fields needed for an approved Atlas purpose. Each non-public field requires an owner, purpose, access class and retention period. Do not collect user accounts or analytics identifiers during MVP development unless separately approved.

## Disclosure control

- Preserve all source suppression markers.
- Do not subtract surrounding cells or totals to reconstruct suppressed values.
- Review small counts, rare attributes and fine geographies for re-identification risk.
- Apply dataset-specific minimum-cell and rounding rules from the authoritative source.
- Where no rule exists, pause publication and obtain Privacy Lead approval.

## Access classes

| Class | Examples | Access |
|---|---|---|
| Public | Approved gold observations and public metadata | Anonymous read |
| Internal | Validation reports and routine pipeline logs | Authorized project staff |
| Restricted | Unpublished extracts, agreements, contact details | Named role-based access |
| Secret | Credentials, tokens and encryption keys | Managed secrets service only |

## Minimum production controls

- separate public read, ingestion and administration identities;
- least-privilege role-based access;
- MFA for administrators;
- managed secrets, never repository secrets;
- encrypted transport and storage where supported;
- secure headers and content security policy;
- API validation and rate limiting;
- dependency and vulnerability scanning;
- logged administrative and publication actions;
- backups, point-in-time recovery and tested restoration;
- incident response and credential-rotation procedures;
- separate development, staging and production environments.

## Security incidents

Suspected exposure, unauthorized change or integrity compromise is immediately escalated to the Privacy & Security Lead and Accountable Publisher. Preserve evidence, contain access, assess affected data, document decisions and make legally required notifications.

## Retention

Official source releases, approved transformations, observation vintages and audit logs are retained as long-term statistical records unless law or licence requires removal. Temporary extracts and personal contact data use defined, minimal retention periods.

## Required reviews before public beta

- legal/privacy impact assessment;
- threat model;
- access-control review;
- dependency and secret scan;
- penetration test;
- backup restoration test;
- incident-response exercise.

