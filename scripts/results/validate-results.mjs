#!/usr/bin/env node
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const out=read('data/results/county-results.json');
const assert=(ok,msg)=>{if(!ok)throw new Error(`Results validation: ${msg}`);};
assert(out.schema_version==='kda.public-results.v1','unexpected schema version');
assert(out.coverage?.counties===47,'expected 47 counties');
assert(out.coverage?.evidence_profiles===47,'expected evidence for all 47 counties');
assert(out.coverage?.fiscal_scores===46,'expected 46 complete fiscal-delivery scores');
assert(Array.isArray(out.development_snapshot)&&out.development_snapshot.length===47,'development snapshot must cover 47 counties');
assert(Array.isArray(out.fiscal_delivery)&&out.fiscal_delivery.length===47,'fiscal delivery table must include all counties including withheld score');
assert(Array.isArray(out.indicator_rankings)&&out.indicator_rankings.length>0,'no indicator ranking tables generated');
for(const g of out.indicator_rankings){assert(g.rows.length===47,`${g.indicator_code}: ranked table must contain 47 counties`);const ranks=g.rows.map(x=>x.ranking?.rank).filter(Number.isFinite);assert(ranks.length===47,`${g.indicator_code}: missing ranks`);}
assert(Array.isArray(out.recognition)&&out.recognition.length===6,'expected six recognition categories');
for(const c of out.counties){assert(c.geo_code&&c.name,`county identity incomplete`);assert(c.evidence?.count>0,`${c.name}: no evidence records`);assert(c.development_snapshot,`${c.name}: no development snapshot`);}
const narok=out.fiscal_delivery.find(x=>x.geo_code==='KEN-C033');assert(narok&&narok.score===null,'Narok fiscal score should remain withheld');
console.log(`PUBLIC_RESULTS_VALID counties=${out.coverage.counties} ranked_indicators=${out.coverage.ranked_indicators} fiscal_scores=${out.coverage.fiscal_scores} recognition=${out.recognition.length}`);
