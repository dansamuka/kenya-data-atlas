import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 constituency turnout readiness: ${msg}`);};

const contract=json('data/p23/constituency-turnout-readiness-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const summary=json('data/completeness/summary.json');
const sourceIndex=json('data/p23/form34b-source-index-contract.json');
const extraction=json('data/p23/form34b-extraction-contract.json');

assert(contract.schema_version==='kda.p23.constituency-turnout-readiness.v1','unexpected contract schema');
assert(contract.indicator_code==='IND-TURNOUT-HISTORY','indicator must remain IND-TURNOUT-HISTORY');
assert(contract.level==='constituency','target level must remain constituency');
const constituencies=geographies.filter(g=>g.level==='constituency');
assert(constituencies.length===290,`expected 290 canonical constituencies, got ${constituencies.length}`);
const byGeoCode=new Map(constituencies.map(g=>[g.geo_code,g]));
assert(byGeoCode.size===290,'canonical constituency geo_codes must be unique');
assert(contract.expected_geographies===290,'contract geography count must remain 290');
assert(contract.election?.date==='2022-08-09','election date must remain pinned to the 2022 General Election');
assert(contract.election?.source_form==='Form 34B','source form must remain Form 34B');
assert(new URL(contract.election?.portal_url).hostname==='forms.iebc.or.ke','primary source must remain the official IEBC forms portal');
assert(contract.measure?.formula==='100 * (total_valid_votes + rejected_ballots) / registered_voters','turnout formula changed');
assert(contract.reconciliation?.range_rule==='0 <= turnout_pct <= 100','range rule changed');

const aliases=contract.source_name_reconciliation?.aliases||[];
assert(aliases.length===3,'expected exactly three governed IEBC source-name aliases');
const expectedAliases=new Map([
  ['CHUKA/IGAMBANG\'OMBE','KEN-C013-CON061'],
  ['SUBA NORTH','KEN-C043-CON251'],
  ['SUBA SOUTH','KEN-C043-CON252']
]);
for(const alias of aliases){
  assert(expectedAliases.get(alias.portal_name)===alias.geo_code,`unexpected source-name alias ${alias.portal_name} -> ${alias.geo_code}`);
  const geo=byGeoCode.get(alias.geo_code);
  assert(geo,`source-name alias target ${alias.geo_code} is not a canonical constituency`);
  assert(Number(geo.constituency_code)===Number(alias.constituency_code),`${alias.portal_name}: constituency code diverged from canonical registry`);
  assert(geo.name===alias.canonical_name,`${alias.portal_name}: canonical display name diverged from registry`);
}
const excluded=contract.source_name_reconciliation?.excluded_portal_rows||[];
assert(excluded.length===1&&excluded[0].portal_name==='DIASPORA','diaspora must remain the sole governed non-canonical Form 34B portal row');
assert(String(excluded[0].reason||'').toLowerCase().includes('290'),'diaspora exclusion reason must preserve the 290-territorial-constituency distinction');

assert(contract.extraction?.source_manifest_script==='scripts/p23/discover-iebc-form34b-manifest.py','source manifest script contract changed');
assert(contract.extraction?.source_index_contract==='data/p23/form34b-source-index-contract.json','source-index contract link changed');
assert(contract.extraction?.download_transport_probe==='scripts/p23/probe-iebc-form34b-download.sh','download transport probe contract changed');
assert(contract.extraction?.ocr_feasibility_contract==='data/p23/form34b-ocr-feasibility-contract.json','OCR feasibility contract link changed');
assert(contract.extraction?.field_extraction_contract==='data/p23/form34b-extraction-contract.json','field extraction contract link changed');
assert(contract.extraction?.field_extraction_validator==='scripts/p23/validate-form34b-extraction-contract.mjs','field extraction validator link changed');
assert(contract.extraction?.status==='official_source_index_verified_numeric_extraction_pending','readiness must acknowledge verified source index while keeping numeric extraction pending');
assert(sourceIndex.source_index_relation?.verified_rows===290,'verified Form 34B source-index coverage changed');
assert(extraction.expected_geographies===290&&extraction.promotion_policy?.denominator_invariant===20115,'field extraction contract invariants changed');
assert(Number(summary.by_completion_phase?.P23)===290,`expected turnout-only P23 remainder of 290, got ${summary.by_completion_phase?.P23}`);
assert((contract.acceptance||[]).some(x=>x.includes('20,115-slot')),'governed denominator invariant missing');
assert((contract.authority_notes||[]).some(x=>x.toLowerCase().includes('citizen')),'non-canonical QA-source rule missing');
assert((contract.acceptance||[]).some(x=>x.toLowerCase().includes('diaspora')),'diaspora exclusion acceptance rule missing');

console.log(`P23_TURNOUT_READINESS_OK constituencies=${constituencies.length} aliases=${aliases.length} excluded_portal=${excluded.length} source_index=${sourceIndex.source_index_relation.verified_rows}/290 p23_remaining=${summary.by_completion_phase.P23} status=${contract.extraction.status}`);
