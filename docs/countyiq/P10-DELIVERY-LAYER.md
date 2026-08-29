# P10 — County Fiscal Delivery & Accountability

## Publication status: published

P10 is now a complete, narrow fiscal-delivery product rather than a two-indicator preview. It intentionally answers a smaller question than the County Development Snapshot:

> How does the county government's current public-finance record compare on measures that are directly linked to budget execution, revenue mobilisation and arrears management?

Broad outcomes such as poverty, health status, school attainment and economic structure do **not** enter this score.

## Common reference period

All scored inputs use **FY2024/25** so the published score does not mix unrelated reporting periods.

The per-county fiscal/accountability source fixture is:

`data/countyiq/source/p10-fiscal-accountability-2024-25.json`

Primary sources recorded there are:

- National Treasury, **2025 Budget Review and Outlook Paper** (using Controller of Budget data) for OSR target attainment, pending bills and the wage-ceiling compliance statement;
- Office of the Auditor-General, **Summary Report on County Governments 2023/2024** for audit context;
- Public Finance Management (County Governments) Regulations, 2015, Regulation 25(1)(b), for the 35% personnel-emoluments ceiling.

## Three scored pillars

The 0–100 score gives equal one-third weight to:

### 1. Execution

Mean of normalized:

- overall budget absorption;
- development budget absorption.

Keeping both inside one pillar prevents execution from receiving two-thirds of the overall score simply because two execution measures are available.

### 2. Revenue mobilisation

Own-source-revenue target attainment.

The published raw value remains visible. For scoring only, attainment is **capped at 100%**. This avoids mechanically rewarding a county for exceeding a potentially conservative/self-set target once complete attainment has already been achieved.

### 3. Arrears control

Pending bills as a percentage of the approved FY2024/25 budget, direction-reversed so lower burden is better.

## Normalisation and missing data

Each scored input uses winsorized min-max scaling at the 5th/95th county percentiles. No missing value is imputed.

The final pending-bills table records no submitted value for Narok. Consequently:

- 46 counties receive a complete P10 score and rank;
- Narok retains its available execution, OSR, wage and audit evidence;
- Narok's overall P10 score/rank is withheld rather than estimated.

## Accountability signals shown but not scored

### Wage ceiling

The statutory ceiling is 35% of total county revenue. The final FY2024/25 BROP states that eight counties complied. Compliance is displayed as a legal/accountability signal.

It is **not** converted into arbitrary numeric points. Exact ratios are shown only where the final published text states them explicitly.

### Auditor-General opinion

The FY2023/24 OAG summary states that no County Executive received an unqualified opinion. That fact is displayed for every county. An exact `Qualified` label is shown only for counties whose class is explicitly available in the indexed Appendix 1(a) extract; other modified-opinion classes remain `null` rather than guessed.

Audit classes are **not** assigned arbitrary cardinal distances and do not enter the P10 score.

## Attribution guardrail

P10 is a **county-government fiscal record for a stated period**, not a personal governor score. Even directly government-linked fiscal outcomes reflect the county assembly, accounting officers, inherited obligations, national transfers and other institutional constraints. The UI and data model state this explicitly.

## Files

- `data/countyiq/source/p10-fiscal-accountability-2024-25.json` — traceable per-county source fixture.
- `scripts/p10/delivery-layer.mjs` — P10-v2 three-pillar construction and accountability signals.
- `scripts/countyiq/validate-p10.mjs` — verifies 46 complete scores, Narok's explicit missing-data treatment, OSR cap, no imputation, and non-scoring of wage/audit signals.
