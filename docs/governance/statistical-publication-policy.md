# Statistical publication policy

## 1. Source selection

Use sources in this order unless a documented assessment justifies otherwise:

1. authoritative Kenyan official source;
2. another Kenyan public body with a clear mandate;
3. official international organization reproducing or harmonizing Kenyan data;
4. credible external source with published methodology;
5. a transparent Atlas derivation or model, only under the rules below.

The same concept from different sources is not silently merged. Source conflicts are retained, investigated and explained.

## 2. Required source status

Before ingestion beyond a restricted evaluation environment, record:

- publisher and dataset;
- official URL or delivery route;
- reuse basis and restrictions;
- expected cadence;
- geographic and temporal coverage;
- methodology availability;
- known quality limitations;
- contact or escalation path;
- completed assessment and owner.

Unknown reuse rights block public redistribution and bulk download.

## 3. Observation methods

Every observation uses exactly one method:

- `direct_official` — published directly for the represented geography by an authoritative source;
- `direct_nonofficial` — published directly by a credible external source;
- `derived_official` — transparent calculation using official inputs without spatial transformation;
- `spatially_derived` — transformation between geographic systems or boundaries;
- `modelled_estimate` — statistical estimation beyond direct aggregation.

The method is stored in data and displayed in the interface. Source authority and observation method are separate concepts.

## 4. Derivations

An official-derived value requires:

- retained input observations;
- documented formula;
- unit and rounding rules;
- indicator-specific aggregation method;
- reproducible code;
- validation against known totals where possible;
- approval by the Statistical Lead.

Percentages and rates must use valid numerator/denominator aggregation. Arithmetic means of percentages are prohibited unless the indicator definition explicitly permits them.

## 5. Spatially derived data

Spatial derivation must record source geography, target geography, boundary versions, transformation method, weights, reference population or surface, uncertainty and limitations. It must never be labelled “official ward data” merely because official inputs were used.

## 6. Modelled estimates

Modelled data is excluded from the first production release by default. An exception requires Owner/Publisher approval plus qualified independent methodological review and:

- a documented need that direct data cannot meet;
- reproducible method and code;
- training/input-data lineage;
- validation and sensitivity analysis;
- uncertainty intervals where meaningful;
- clear model/version identifier;
- prominent `D — Modelled` presentation;
- scheduled review and retirement conditions.

## 7. Missing, suppressed and unavailable data

Missing values are never replaced silently. Use a reason code:

- `not_published`;
- `unavailable_at_geo_level`;
- `not_applicable`;
- `suppressed`;
- `source_unavailable`;
- `pending_ingestion`;
- `failed_quality_review`;
- `discontinued`.

Suppressed values remain suppressed. The Atlas must not derive them from totals or surrounding cells.

## 8. Periods and dates

Store and distinguish:

- reference period;
- source publication date;
- Atlas ingestion date;
- Atlas publication/update date;
- revision date;
- next expected release where known.

The interface must not present publication date as reference period.

## 9. Comparisons and rankings

Comparison or ranking is allowed only when observations have:

- the same indicator definition;
- identical or approved-convertible units;
- the same geographic level;
- identical reference period or an explicitly approved equivalent;
- compatible collection and observation methods;
- no unresolved methodological break;
- acceptable missingness and quality status.

Ties, suppression and uncertainty are retained. “Higher is better” is nullable and must not imply performance for descriptive measures such as population.

## 10. Provisional and revised values

Provisional values display a visible label. Revisions create new observation vintages and never destroy the earlier published state. See the corrections and revisions policy.

## 11. Release approval

A release must have a completed publication checklist, machine validation report, statistical review, privacy check and independent publication approval. The exact source files, transformation version and approved output are retained.

## 12. Demo content

Prototype values use `demo` status, are excluded from the production API and cannot be promoted by changing a label alone. They must be replaced through the full source-to-publication workflow.

