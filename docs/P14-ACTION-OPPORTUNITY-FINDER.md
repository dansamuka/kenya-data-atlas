# P14 — Action & Opportunity Finder Beta

P14 adds a deliberately conservative action layer to CountyIQ. It connects existing P07 county gaps to verified public programmes without turning programme marketing pages into unverified recommendations.

## Release status

**v1.1 Beta.** P14 is useful only if programme freshness is maintained. It is therefore governed separately from the v1.0 statistical core and must never weaken P17 release gates.

## Canonical files

- `data/opportunities/programmes.seed.json` — manually verified programme facts and primary-source claims.
- `scripts/p14/build-opportunities.mjs` — deterministic registry builder.
- `data/opportunities/opportunity-registry.json` — generated public registry.
- `scripts/p14/validate-p14.mjs` — freshness, provenance, trigger and UI validator.
- `assets/opportunity-finder.js` / `.css` — lazy CountyIQ Beta surface.

## Freshness policy

A record may be labelled **live** only when an official primary source currently exposes an application, registration or active product surface. Every live record requires:

- a primary official URL;
- an application/source URL;
- `verified_at`;
- `next_review_at`;
- application-window semantics;
- beneficiary and geography eligibility;
- an application method;
- explicit source-claim tags.

The default review interval is monthly. When `next_review_at` has passed, the browser downgrades the record to **Review due** and stops presenting it as currently verified live. `paused`, `closed`, `expired` and `unknown` records are never presented as live.

Amounts, rates, fees and deadlines are shown only when a primary source supports them. Where official pages conflict, P14 withholds the headline number and tells the user to confirm current terms. KIE industrial credit is the first deliberate example of this rule.

## Matching policy — P14-match-v1

P14 does not invent a county need score.

For each selected county:

1. read the canonical `data/countyiq/county-summary.json` record;
2. take only P07 `gaps.items` where `favourable_to_county === false`;
3. compare the gap's `indicator_code` to a programme's published `relevance.trigger_indicators`;
4. if a trigger matches, show the exact P07 gap as the match rationale, including county value, benchmark, period and the existing P07 source URL;
5. programmes marked `contextual` may be shown as nationwide context, but are explicitly not described as a response to a measured county gap.

This makes every match reproducible from the programme registry plus the already-published P07 gap object.

## Eligibility guardrail

**County relevance does not establish personal eligibility.** The Atlas does not know whether a visitor meets age, ownership, group-registration, collateral, credit, sector or other programme-specific rules. The UI therefore sends users back to the primary official source before action.

## Initial verified programme set — 30 August 2026

The Beta seed covers a bounded set of national programmes with official, currently accessible product/application surfaces:

- Uwezo Fund — Wezesha Loan;
- Uwezo Fund — Endeleza Loan;
- Women Enterprise Fund — Tuinuke Chama Loan;
- Youth Enterprise Development Fund — Group Loans;
- Youth Enterprise Development Fund — Asset Finance Loan;
- Youth Enterprise Development Fund — VIBE Blue Economy Loan;
- Kenya Industrial Estates — Industrial Credit;
- Access to Government Procurement Opportunities (AGPO);
- Hustler Fund — Group Loan.

This is intentionally **not** a claim to be a complete Kenyan opportunity database. A smaller high-integrity registry is preferable to a broad stale list.

## Acceptance gates

P14 is complete only when:

- every live record has primary URL, verification and next-review metadata;
- stale/non-live states cannot render as live;
- every amount or deadline claim is traceable to the programme's primary source;
- every gap match is reconstructible from P07 gap data and declarative programme triggers;
- all trigger indicator codes exist in the canonical CountyIQ mart;
- the Beta produces meaningful matches across multiple counties;
- CountyIQ remains usable when the P14 registry is unavailable;
- the UI loads lazily and does not add P14 data to first paint;
- `npm run opportunities:validate`, `npm test`, P16 browser audit and the normal data workflow remain green.

## Maintenance protocol

At each review cycle:

1. open each programme's `primary_url` and `application_url`;
2. verify that the product/application surface is still current;
3. confirm amount, rate, fee, deadline and eligibility claims that P14 displays;
4. change the state immediately if a product is paused, closed, expired or unclear;
5. update `verified_at` and `next_review_at` only after verification;
6. rebuild and run `npm run opportunities:validate`;
7. retain any uncertainty rather than inferring a live state.
