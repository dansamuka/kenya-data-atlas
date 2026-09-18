// P31 -- records the source investigation for the three maize indicators (Maize area, Maize
// production, Maize yield) on the canonical indicator registry.
//
// These three indicators previously carried an empty expected_source / expected_source_url,
// unlike most of the registry -- they are published only at county level today, sourced from
// KNBS's National Agriculture Production Report (methodology_url already set), with no record
// of what was checked for a finer geography. P31 investigated the 2023-2025 National Agriculture
// Production Report editions, KilimoSTAT (the Ministry of Agriculture and Livestock
// Development's own open-data platform), opendata.go.ke, HarvestStat Africa (the largest
// open-access harmonized subnational crop-statistics compilation for Sub-Saharan Africa), a
// peer-reviewed sub-county maize-yield study (Simbolon et al., Scientific Reports 2024,
// PMC11190209) and the still-pilot-stage 2025/26 Kenya Census of Agriculture as candidate
// constituency-level sources; none publish these three indicators below county today (see the
// P31 evidence-state entries in data/completeness/local-54-agriculture-evidence-states.json for
// the full, cited investigation). This script records that finding directly on the registry so
// expected_source is never blank for an active, published indicator, matching the convention set
// by scripts/p23/build-constituency-mps.mjs and scripts/p31/apply-education-admin-source-metadata.mjs.
//
// Run as part of `npm run indicators:build`, after build-registry.mjs regenerates
// data/indicators/registry/indicators.json from its seed, so the patch survives every rebuild.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const idir = 'data/indicators/registry';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"', '""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(r => Object.keys(r)))];
const csv = rows => { const f = unionFields(rows); return [f.join(','), ...rows.map(r => f.map(k => csvCell(r[k])).join(','))].join('\n') + '\n'; };

const KNBS_URL = 'https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf';
const EXPECTED_SOURCE = "Kenya National Bureau of Statistics, National Agriculture Production Report (2023 edition, Annex 1: '2023 Maize by County'), the same source already cited at county level for this indicator; investigated but not found published below county in the 2023-2025 report editions, KilimoSTAT, opendata.go.ke, HarvestStat Africa or the (still pilot-stage) 2025/26 Kenya Census of Agriculture -- see data/completeness/local-54-agriculture-evidence-states.json (contract_id prefix P31-AGRICULTURE-MAIZE-CONSTITUENCY-CLOSURE-2026-09-18) for the full cited investigation.";
const AVAILABILITY_NOTE = "County-level only (2023 Annex 1 of the KNBS National Agriculture Production Report). P31 (2026-09-18) checked the 2023, 2024 and 2025 report editions (county is the finest tier in each), KilimoSTAT (HTTPS unreachable -- expired TLS certificate; its own 2024 publications list, retrieved via the Internet Archive, carries no maize sub-county dataset), opendata.go.ke (its ArcGIS Hub catalogue returns 'SB_0006: Subscription is canceled, the item is not accessible'; a previously indexed 'Kisumu County Crop Statistics' sub-county dataset is now a dead link everywhere checked), and HarvestStat Africa (Nature Scientific Data 2025), which covers Kenya only at Admin-1/county -- unlike 15 other African countries it covers at Admin-2. A peer-reviewed study (Simbolon et al., Scientific Reports 2024, PMC11190209) confirms MoALD holds genuine sub-county administrative maize-yield records for Trans Nzoia and Uasin Gishu Counties (2017-2021), obtained privately for model validation and never published. Kenya's first-ever Census of Agriculture (2025/26) intends to eventually disaggregate below county but has released only a 2024/25 pilot report to date.";

const codes = ['IND-MAIZE-AREA', 'IND-MAIZE-PRODUCTION', 'IND-MAIZE-YIELD'];

const indicators = await readJson(`${idir}/indicators.json`);
const byCode = new Map(indicators.map(i => [i.indicator_code, i]));

let patched = 0;
for (const code of codes) {
  const indicator = byCode.get(code);
  if (!indicator) throw new Error(`P31 maize metadata: unknown indicator_code ${code}`);
  Object.assign(indicator, {
    expected_source: EXPECTED_SOURCE,
    expected_source_url: KNBS_URL,
    expected_availability_note: AVAILABILITY_NOTE,
    methodology_url: indicator.methodology_url || KNBS_URL
  });
  patched += 1;
}

await writeFile(path.join(root, `${idir}/indicators.json`), JSON.stringify(indicators, null, 2) + '\n');
await writeFile(path.join(root, `${idir}/indicators.csv`), csv(indicators));

console.log(`P31_MAIZE_METADATA_OK patched=${patched}`);
