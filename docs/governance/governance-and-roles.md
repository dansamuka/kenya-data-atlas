# Governance and decision rights

Names are intentionally unassigned until the legal publisher formally appoints role holders. One person may cover multiple roles in a small team, but a person who prepares a release must not be its sole final approver.

## Roles

| Role | Accountability |
|---|---|
| Accountable Publisher | Legal and institutional accountability; final launch and emergency-withdrawal authority |
| Product Owner | Product scope, public utility, prioritization and acceptance |
| Statistical Lead | Indicator definitions, methods, comparability and statistical approval |
| Data Steward | Dataset ownership, source records, quality issues and release readiness |
| Geography Steward | Canonical geography, aliases, boundaries, crosswalks and geographic methods |
| Privacy & Security Lead | Disclosure control, access, security risk and incident response |
| Engineering Lead | Platform integrity, pipelines, environments, backups and technical releases |
| Editorial Lead | Neutral language, citations, methodology and public notices |
| Governance Board | Policy, disputes, exceptions, high-risk modelled data and public-beta approval |

Each role must have a named primary, alternate, appointment date and contact recorded in the private operating register before production access is granted.

## Decision matrix

| Decision | Recommends | Must approve | Must be consulted |
|---|---|---|---|
| Add a source | Data Steward | Statistical Lead | Legal/licensing reviewer |
| Add or change an indicator | Statistical Lead | Statistical Lead + Product Owner | Data Steward |
| Publish a routine validated release | Data Steward | Statistical Lead + independent Publisher | Engineering Lead |
| Publish spatially derived data | Geography Steward | Statistical Lead + Governance Board delegate | Editorial Lead |
| Publish modelled data | Statistical Lead | Governance Board | Privacy Lead, Geography Steward |
| Change a canonical boundary | Geography Steward | Statistical Lead | Data Steward, Engineering Lead |
| Correct a material published error | Data Steward | Statistical Lead + Publisher | Editorial Lead |
| Withdraw data urgently | Any lead | Accountable Publisher or Statistical Lead | Privacy/Security Lead where relevant |
| Change a core policy | Policy owner | Governance Board | All affected leads |
| Public-beta launch | Product Owner | Accountable Publisher + Governance Board | All leads |

## Meeting and quorum

- Governance Board meets at least monthly during build and quarterly after launch.
- Quorum requires the Accountable Publisher or delegate, Statistical Lead, Product Owner and one independent functional lead.
- A conflicted member declares the conflict and does not approve the relevant decision.
- Decisions record alternatives, evidence, risks, dissent, conditions, owner and review date.

## Escalation

Publication pauses when there is unresolved disagreement about:

- legal reuse rights;
- privacy or suppression;
- geographic validity;
- methodological comparability;
- a material unexplained source discrepancy;
- whether a value could mislead users.

The issue goes to the Governance Board. Privacy, security and legal blockers cannot be overruled merely to meet a launch date.

## Segregation of duties

At minimum:

1. a preparer runs or reviews ingestion;
2. a statistical reviewer verifies definition, method and checks;
3. a publisher authorizes promotion to production.

The system must preserve each identity and timestamp. Automated checks support but never impersonate human approval.

## Exceptions

Exceptions require a decision record specifying scope, justification, residual risk, compensating controls, expiry and review owner. There are no exceptions to privacy law, binding licences or the ban on fabricated data.

