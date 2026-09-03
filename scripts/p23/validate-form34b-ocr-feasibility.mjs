import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 Form34B OCR feasibility: ${msg}`);};

const c=json('data/p23/form34b-ocr-feasibility-contract.json');
const source=json('data/p23/form34b-source-index-contract.json');
const turnout=json('data/p23/constituency-turnout-readiness-contract.json');
const geos=json('data/geography/registry/geographies.json');
const summary=json('data/completeness/summary.json');

assert(c.schema_version==='kda.p23.form34b-ocr-feasibility.v1','unexpected contract schema');
assert(c.sample?.constituency_code===1&&c.sample?.geo_code==='KEN-C001-CON001','sample constituency changed');
assert(c.sample?.form_id===277629,'sample form id changed');
assert(c.sample?.expected_pages===3,'sample page count contract changed');
assert(c.sample?.canonical_registered_voters===93561,'sample registered-voter anchor changed');
assert(source.source_index_relation?.first_form_id===277629,'source-index first form id diverged');
assert(turnout.indicator_code==='IND-TURNOUT-HISTORY','turnout target changed');
assert(geos.filter(g=>g.level==='constituency').length===290,'canonical constituency count changed');
assert(Number(summary.by_completion_phase?.P23)===290,'sample OCR gate must not resolve P23 slots');
assert((c.prohibited||[]).some(x=>x.includes('bulk OCR')),'bulk-promotion prohibition missing');
assert(String(c.promotion_rule||'').includes('every promoted constituency'),'source-level verification rule missing');
console.log(`P23_FORM34B_OCR_CONTRACT_OK sample=${c.sample.constituency_name} form_id=${c.sample.form_id} p23_remaining=${summary.by_completion_phase.P23}`);
