# P23A — Constituency national-pipeline accelerator

P23A is an execution accelerator inside governed phase P23. It does not create a new completeness denominator or alter the formal P18–P26 closure order.

## Tranche 1 — 2022 registered voters by constituency

**Indicator:** `IND-REGISTERED-VOTERS`  
**Coverage:** all 290 canonical constituencies  
**Reference date:** 20 June 2022  
**Source authority:** Independent Electoral and Boundaries Commission (IEBC), Kenya Gazette Notice No. 7290, 21 June 2022  
**Statistical source schedule:** First Schedule — Registered Voters per County Assembly Ward  
**Published constituency context:** Second Schedule — Registered Voters per Constituency

The Atlas preserves the already-audited Sprint 2 treatment:

- constituency values are **B — Official derived**;
- each value is the exact sum of all official IEBC child-ward rows for that constituency;
- no county value is allocated or inherited downward;
- all 1,450 domestic ward source rows remain in statistical totals;
- the ten Mandera East/Lafey rows withheld from current ward polygons remain included in their constituency totals;
- the ward geometry hold therefore does not reduce 290/290 constituency statistical coverage.

The pinned Sprint 2 extraction artifact is retained only as a reproducible transcription of the official Gazette schedule. P23A stores a deterministic 290-row constituency aggregate snapshot locally so normal Atlas builds do not depend on a live remote CSV.

## Native migration contract

P23A tranche 1 moves the already-validated constituency electorate out of the lazy browser supplement and into the canonical catalogue/series/observation registries.

The browser supplement remains only for the 1,440 safely mapped ward values and the 10 explicit ward holds until P24 resolves or governs the ward layer.

## Acceptance

- 290 unique canonical constituency series and 290 observations;
- national constituency sum = **22,102,532**;
- every observation retains badge **B**, `geographic_method=aggregated`, official source class and 20 June 2022 reference date;
- exact source-snapshot reconciliation for every constituency;
- no canonical county/ward rows created by this tranche;
- overall governed denominator remains **20,115**;
- `unknown_missing = 0`;
- P21 remains **329** unresolved rows;
- P23 unresolved rows fall only by the 290 migrated slots, from **3,190 to 2,900** on this branch baseline;
- full Atlas build, validators, independent geometry audit and P16 release gates pass before merge.
