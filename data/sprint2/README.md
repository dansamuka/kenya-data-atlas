# Data Sprint 2 — Local Kenya

Implemented 26–27 August 2026.

Data Sprint 2 turns the Kenya → County → Constituency → Ward geography skeleton into the Atlas's first genuinely populated local statistical drill-down using the IEBC certified 2022 registered-voter schedule.

## Final acceptance state

Sprint 2 is release-ready when all of these conditions pass CI:

- **47/47 counties** reconcile to the audited Sprint 1 IEBC county schedule;
- **290/290 constituencies** have registered-voter totals derived from their published IEBC ward rows;
- **1,450/1,450 domestic IEBC ward rows** are ingested and retained in statistical totals;
- **1,440/1,450 ward rows** are safely attached to the current Atlas ward geometry;
- **10/1,450 ward rows** — all in Mandera East and Lafey — are explicitly held from spatial attribution pending boundary-source reconciliation;
- the 1,450 IEBC ward rows sum exactly to **22,102,532**;
- every reconstructed county sum equals the official Gazette Third Schedule value already used in Sprint 1;
- constituency values are **B — Official derived**, exact sums of all source ward rows, including held rows;
- spatially published ward values are direct IEBC observations and never inherited from a county or constituency;
- the interface visibly discloses the 1,440 mapped / 10 held split instead of implying false precision;
- automated validation fails if any of these guarantees changes.

The ten-row hold is intentional data-quality behaviour, not missing source data.

## Primary statistical source

**Independent Electoral and Boundaries Commission / Kenya Gazette, 21 June 2022, Gazette Notice No. 7290.**

Official publication:

<https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf>

The notice contains:

1. **First Schedule** — Registered Voters per County Assembly Ward;
2. **Second Schedule** — Registered Voters per Constituency;
3. **Third Schedule** — Registered Voters per County.

The Gazette is the statistical authority for the voter counts.

## Machine-readable extraction and independent check

For deterministic ingestion the Atlas uses a commit-pinned coded transcription:

<https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv>

Pinned commit: `29b269a6562262a77faf6d22ba5837f46d35df75`  
Git blob: `2bd2861bb9378b3f0b5274d8db3c41912911077f`

This is an extraction/transport artifact, not the statistical authority.

CI also compares it constituency-by-constituency with a second independently maintained transcription:

<https://raw.githubusercontent.com/AllanGachomo/Kenya-Voters-Registration-Analysis-and-Prediction/03eeb949416ef7e28e6a4a4725a0de3a756fa7f5/Data/Clean/Registered%20Voters%20per%20CAW%202022.csv>

Pinned commit: `03eeb949416ef7e28e6a4a4725a0de3a756fa7f5`.

## Statistical treatment

### Ward source rows

All **1,450** domestic IEBC CAW rows are ingested. Every row contributes to its constituency, county and the national total.

For the **1,440 safely reconciled rows**, the observation is attached to the canonical Atlas ward and can be mapped. Source/canonical name or ordering differences are resolved only inside the same constituency through deterministic one-to-one crosswalks. No aggregate value is pushed downward.

### Constituency

All **290 constituency values** are **B — Official derived**: exact sums of their IEBC child ward rows. The derived values therefore remain complete even where ward geometry is held.

### County

Sprint 1 already publishes the direct official county schedule. Sprint 2 independently reconstructs every county from all 1,450 ward rows and requires exact equality with the Sprint 1 official county value.

## Mandera East / Lafey spatial hold

The validation sprint exposed a real boundary-version conflict rather than a missing voter record.

The IEBC 2022 schedule places:

- **Mandera East (043):** Arabia, Township, Neboi, Khalalio, Libehia;
- **Lafey (044):** Sala, Fino, Lafey, Waranqara, Alango Gof.

The current external ward geometry underlying the Atlas instead contains the configuration associated with 2012 High Court orders: Mandera East includes **Bulla Mpya**, while **Libehia** appears under Lafey and **Sala** is absent there.

The Court of Appeal subsequently **allowed the appeal and set aside those High Court orders** on 5 July 2013 in *Hassan & 2 others v Attorney General & 3 others [2013] KECA 496 (KLR), Civil Appeal 281 of 2012*:

<https://new.kenyalaw.org/akn/ke/judgment/keca/2013/496>

The 2022 IEBC schedule is consistent with the operative post-appeal configuration. The current Atlas external ward polygons are therefore not a defensible basis for assigning these ten voter values.

Sprint 2 consequently applies this rule:

> **Keep the official statistics; withhold the uncertain geometry.**

The ten rows remain in constituency, county and national totals but are not attached to ward polygons. This prevents a visually plausible but geographically false map.

The boundary exception is machine-documented in `data/sprint2/sources.json` as `S2-MANDERA-BOUNDARY-HOLD-001`.

## Locked validation anchors

Examples checked on every CI run include:

- Changamwe Constituency — **93,561**;
- Jomvu Constituency — **75,085**;
- Kisauni Constituency — **135,276**;
- Ol Kalou Constituency — **72,997**;
- Mathare Constituency — **123,163**.

Ol Kalou's five ward rows are also locked:

| Ward | IEBC ward code | Registered voters |
|---|---:|---:|
| Karau | 0453 | 13,594 |
| Kanjuiri Range | 0454 | 15,596 |
| Mirangine | 0455 | 14,695 |
| Kaimbaga | 0456 | 13,540 |
| Rurii | 0457 | 15,572 |

Their exact sum is **72,997**.

## User experience

A normal fully reconciled path now works with real local data, for example:

```text
Kenya
  → Nyandarua County
      → Ol Kalou Constituency
          → Kaimbaga Ward
```

At Kenya level the 47 counties are shaded with county observations. At county level all 290 constituencies have official-derived totals. At constituency level the **1,440 safely mapped wards** display direct IEBC observations.

For Mandera East and Lafey, the constituency totals remain visible but the ward layer explicitly reports a **boundary hold** instead of displaying guessed values.

## Runtime architecture

`assets/sprint2-data.js` wraps the Sprint 1 data overlay and adds **1,730 published local series and 1,730 observations**:

- 290 constituency series/observations;
- 1,440 spatially safe ward series/observations.

The ten held IEBC ward rows remain inside the source ingestion, reconciliation and validation pipeline but do not become geometry-linked ward series until the boundary layer is corrected.

`assets/sprint2-ui.js` adds level-aware coverage and the boundary-hold disclosure.

## Automated validation

Run:

```bash
npm test
```

or:

```bash
npm run sprint2:validate
```

The Sprint 2 validator checks:

- 47/290/1,450 source coverage;
- national total **22,102,532**;
- all 47 county reconciliations;
- independent transcription agreement;
- Gazette anchors;
- 1,440 one-to-one safe ward mappings;
- exactly 10 held Mandera East/Lafey rows;
- the documented Court of Appeal boundary exception;
- script load order, UI disclosure and anti-inheritance guards.

## Next geography repair

A future geography remediation should replace or independently verify the Mandera East/Lafey ward polygons against an authoritative post-appeal boundary source. Once the ten geometries are defensibly resolved, the hold can be removed and ward spatial coverage can move from **1,440/1,450 to 1,450/1,450** without changing the voter totals.

Sprint 1 and Sprint 2 still publish through additive static registry overlays for the GitHub Pages MVP. Moving those overlays into the native seed/build pipeline remains an architectural migration item, not a missing Local Kenya statistic.
