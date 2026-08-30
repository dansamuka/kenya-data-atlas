# P12 — Canonical Convergence & Governance

**Status: complete.**

P12 consolidates the Atlas's static indicator semantics into one versioned executable policy layer so that CountyIQ, the indicator registry, cross-level comparison, downstream analytical phases and CI cannot silently apply different meanings to the same indicator.

## Canonical policy

The authoritative executable policy is:

`scripts/policy/indicator-policy.mjs`

Policy version: `P12-policy-v1`.

It owns the static decisions for:

- analytical domain;
- higher/lower-is-better direction, or explicitly no quality direction;
- composite eligibility;
- ranking mode (`directional` or `positional_only`);
- sampling-uncertainty requirement;
- trend permission;
- parent-to-child inheritance prohibition;
- publication state;
- series-level cross-geography normalisation eligibility.

Dynamic evidence checks remain deliberately outside the static policy. A consumer must still verify actual coverage, common periods, provenance class, numeric history and required uncertainty before publishing a rank or trend.

## Public policy registry

`npm run policy:build` generates:

`data/policy/indicator-policy.json`

The generated registry exposes policy for all 98 indicators and the cross-level comparison decision for all 3,370 published series with observations. It is stamped with the policy version and generated from the canonical indicator/unit/series registries.

## Converged consumers

P12 removes or redirects duplicated policy logic in the main analytical paths:

- `scripts/p06/direction-rules.mjs` is now a compatibility re-export of the canonical policy module;
- `scripts/p06/peer-intelligence.mjs` consumes canonical direction and trend permission while retaining independent dynamic ranking/trend calculations;
- `scripts/indicators/build-cross-level-eligibility.mjs` consumes the canonical series-normalisation rule while preserving the existing `2.0.0` output schema contract;
- `scripts/countyiq/build-mart.mjs` consumes canonical domain, direction, composite, uncertainty, trend, inheritance and publication semantics and stamps the mart with `indicator_policy_version`;
- `countyiq:build` always materialises the policy registry before the mart.

## Important corrections locked in

The canonical domain layer explicitly protects previously ambiguous cases:

- Gross County Product → `economic`;
- rent burden → `living`;
- school attendance → `education`;
- labour-force participation → `economic`;
- registered voters → `governance`.

Population remains positional-only rather than being described as intrinsically better or worse. Parent geography values remain prohibited from being copied into child geographies.

## Validation gate

`scripts/policy/validate-policy.mjs` mechanically checks that:

- the generated policy registry matches the executable canonical policy;
- every CountyIQ metric mirrors the canonical static policy;
- every series-level cross-geography decision mirrors the canonical rule;
- the old local CountyIQ domain classifier is absent;
- the cross-level builder no longer carries a duplicate normalisation policy;
- P06 direction imports route through the canonical layer;
- policy generation and validation are wired into supported build/test paths.

Release evidence on the exact P12 candidate:

- 98 indicator policies validated;
- 3,370 series-level cross-geography policies validated;
- 47 CountyIQ county records validated against canonical policy;
- P03–P11 validators remained green;
- full Atlas `npm test` passed;
- independent Shapely geometry audit passed.

## Release boundary

P12 is an architecture/governance phase, not a new end-user feature. Existing P09–P11 published outputs and numerical methodology are preserved. The phase reduces the probability that later work produces contradictory classifications, direction labels, rank eligibility or inheritance behaviour across surfaces.

The next phase is P13 — County Evidence & Knowledge Hub.

## User-facing Methods & Comparability surface

The canonical policy is now exposed in a dedicated `#/methods` website section. It provides three public views without redefining any analytical rule in browser code:

- all 98 indicator policy records;
- all CountyIQ P06 ranking/trend outputs by county, including withholding reasons;
- all 3,370 observed-series cross-level decisions and their rule basis.

This resolves the earlier product gap where the policy was public as machine-readable JSON but not discoverable as a first-class website surface.


## Public product boundary
P12 is an architecture and governance layer, not a primary user-facing feature. Its policy registry remains public and machine-readable for auditability, but the main website presents the analytical results produced from that governed data under **Rankings & Insights**. Technical policy fields, build terminology and drift-validation details stay in repository documentation rather than the primary UI.
