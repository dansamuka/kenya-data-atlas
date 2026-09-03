import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 constituency turnout readiness: ${msg}`);};

const contract=json('data/p23/constituency-turnout-readiness-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const summary=json('data/completeness/summary.json');

assert(contract.schema_version==='kda.p23.constituency-turnout-readiness.v1','unexpected contract schema');
assert(contract.indicator_code==='IND-TURNOUT-HISTORY','indicator must remain IND-TURNOUT-HISTORY');
assert(contract.level==='constituency','target level must remain constituency');
const constituencies=geographies.filter(g=>g.level==='constituency');
assert(constituencies.length===290,`expected 290 canonical constituencies, got ${constituencies.length}`);
assert(new Set(constituencies.map(g=>g.geo_code)).size===290,'canonical constituency geo_codes must be unique');
assert(contract.expected_geographies===290,'contract geography count must remain 290');
assert(contract.election?.date==='2022-08-09','election date must remain pinned to the 2022 General Election');
assert(contract.election?.source_form==='Form 34B','source form must remain Form 34B');
assert(new URL(contract.election?.portal_url).hostname==='forms.iebc.or.ke','primary source must remain the official IEBC forms portal');
assert(contract.measure?.formula==='100 * (total_valid_votes + rejected_ballots) / registered_voters','turnout formula changed');
assert(contract.reconciliation?.range_rule==='0 <= turnout_pct <= 100','range rule changed');
assert(contract.extraction?.status==='official_portal_confirmed_extraction_pending','readiness must not claim materialization before a validated 290-row artifact exists');
assert(Number(summary.by_completion_phase?.P23)===290,`expected turnout-only P23 remainder of 290, got ${summary.by_completion_phase?.P23}`);
assert((contract.acceptance||[]).some(x=>x.includes('20,115-slot')),'governed denominator invariant missing');
assert((contract.authority_notes||[]).some(x=>x.toLowerCase().includes('citizen')),'non-canonical QA-source rule missing');

console.log(`P23_TURNOUT_READINESS_OK constituencies=${constituencies.length} p23_remaining=${summary.by_completion_phase.P23} status=${contract.extraction.status}`);
