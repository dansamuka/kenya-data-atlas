# Phase 0 — Governance and statistical policy

**Status:** Implemented for an independent private-citizen publisher.
**Policy version:** 1.0  
**Effective date:** 26 August 2026  
**Review cycle:** At least annually and before public beta

This package establishes how Kenya Data Atlas makes, reviews and records publication decisions. The Atlas is currently an independent public-interest project created and operated by a private citizen using publicly available, attributed data. It is binding on data promoted to the future production `gold` layer. It does not imply affiliation with or endorsement by the Government of Kenya, the United Nations, UNDP or any source agency.

## Policy hierarchy

1. Applicable Kenyan law, source licences and binding agreements.
2. Privacy, disclosure-control and security requirements.
3. Statistical publication and data-quality policies in this directory.
4. Dataset-specific methodology approved through the publication workflow.
5. Editorial and interface conventions.

If requirements conflict, the stricter requirement applies and publication pauses until the conflict is resolved.

## Documents

| Document | Purpose |
|---|---|
| [Product charter](product-charter.md) | Mission, scope, principles and launch constraints |
| [Governance and decision rights](governance-and-roles.md) | Accountabilities, quorum, escalation and segregation of duties |
| [Statistical publication policy](statistical-publication-policy.md) | Rules for sources, observations, derivations, comparisons and release |
| [Data-quality framework](data-quality-framework.md) | A–E provenance classes, quality dimensions and blocking checks |
| [Corrections and revisions](corrections-and-revisions.md) | Non-destructive vintages, corrections, withdrawals and notices |
| [Privacy and security](privacy-and-security.md) | Prohibited data, disclosure control and minimum safeguards |
| [Editorial style guide](editorial-style-guide.md) | Neutral language, labels, dates, missing data and citations |
| [Source register](source-register.csv) | Initial agency, licence and approval tracker |
| [Publication checklist](templates/publication-checklist.md) | Required release approval record |
| [Source assessment](templates/source-assessment.md) | Reusable intake and licensing assessment |
| [Decision record](templates/decision-record.md) | Auditable governance decisions and exceptions |
| [Data issue record](templates/data-issue-record.md) | Correction and quality-issue lifecycle |
| [Institutional transition plan](institutional-transition-plan.md) | Controlled transfer to a future NGO or institutional owner |

## Mandatory publication gate

Production publication is prohibited unless all of the following are true:

- the source has a completed source assessment and known reuse basis;
- the indicator has an approved definition, unit and aggregation rule;
- the observation identifies geography, period, method and provenance;
- mandatory automated checks pass;
- statistical review is recorded;
- privacy and suppression checks pass;
- the release has separate data-owner and publisher approval;
- the decision and evidence are retained in the audit trail.

Emergency publication is not an exception to source, privacy or statistical-integrity requirements.

## Phase 0 completion record

Completed in the repository:

- product charter and non-negotiable principles;
- independent-publisher operating roles and decision matrix;
- publication, quality, revision, privacy and editorial policies;
- source/licensing register with priority agencies;
- reusable source, release, decision and issue templates;
- explicit prohibition on presenting demo values as official.

Required before publishing any real dataset:

- record the individual owner/operator in the private operating register;
- complete a source assessment and documented public reuse basis for that dataset;
- apply the statistical, privacy and publication checklist;
- maintain a visible independence/non-endorsement notice;
- obtain specialist legal or privacy advice when a source, use or disclosure risk is unclear.

Formal agency agreements, agency review and an external Governance Board are not prerequisites for independently publishing lawfully reusable public data. Public availability alone does not automatically grant redistribution rights, so unclear source terms still block republication or bulk redistribution until resolved.

