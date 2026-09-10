import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const fail=m=>{throw new Error(`P24 ward MCA validate: ${m}`);};

const [snap,geos,inds,series,obs,datasets,releases,evidence,summary]=await Promise.all([
  read('data/p24/source/ward-mca-gazette-9956-2022.json'),
  read('data/geography/registry/geographies.json'),
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/catalogue/registry/datasets.json'),
  read('data/catalogue/registry/releases.json'),
  read('data/completeness/evidence-states.json'),
  read('data/completeness/summary.json'),
]);

const wards=geos.filter(g=>g.level==='ward');
if(wards.length!==1450)fail(`canonical wards=${wards.length}`);
if(snap.coverage?.total_wards!==1450)fail('source snapshot must declare coverage over all 1,450 wards');
if(snap.rows.length!==snap.coverage.resolved_direct_official)fail('resolved row count does not match declared coverage');
if(snap.held_rows.length!==snap.coverage.governed_unavailable_boundary_conflict+snap.coverage.governed_unavailable_election_postponed)fail('held row count does not match declared coverage');
if(snap.rows.length+snap.held_rows.length!==1450)fail('resolved + held rows must total 1,450');
if(new Set([...snap.rows,...snap.held_rows].map(r=>r.geo_code)).size!==1450)fail('snapshot does not cover every canonical ward exactly once');

// The 10 Mandera East / Lafey wards must be held, matching the P23X ward-voter precedent (constituencies 43, 44).
const heldConstituencies=new Set(snap.held_constituency_codes||[]);
if(heldConstituencies.size!==2||!heldConstituencies.has(43)||!heldConstituencies.has(44))fail('expected exactly Mandera East (43) and Lafey (44) held constituencies');
const boundaryHeld=snap.held_rows.filter(r=>heldConstituencies.has(r.constituency_code));
if(boundaryHeld.length!==10)fail(`expected 10 Mandera East/Lafey held wards, got ${boundaryHeld.length}`);
const postponedHeld=snap.held_rows.filter(r=>!heldConstituencies.has(r.constituency_code));
if(postponedHeld.length!==7)fail(`expected 7 election-postponed held wards, got ${postponedHeld.length}`);
if(!postponedHeld.every(r=>r.votes_note==='election_postponed'))fail('every non-boundary held row must be an explicit election-postponed case');

const ind=inds.find(i=>i.indicator_code==='IND-MCA-IDENTITY');
if(!ind||ind.lifecycle_status!=='active')fail('MCA indicator not active');

const geoByCode=new Map(wards.map(g=>[g.geo_code,g]));
const ss=series.filter(s=>s.indicator_id===ind.indicator_id&&wards.some(g=>g.geography_id===s.geography_id));
if(ss.length!==snap.rows.length)fail(`canonical MCA series=${ss.length}, expected ${snap.rows.length}`);
if(new Set(ss.map(s=>s.geography_id)).size!==ss.length)fail('duplicate/missing MCA geography mapping');

const ids=new Set(ss.map(s=>s.series_id));
const oo=obs.filter(o=>ids.has(o.series_id));
if(oo.length!==snap.rows.length)fail(`canonical MCA observations=${oo.length}, expected ${snap.rows.length}`);
if(oo.some(o=>!['A','B'].includes(o.badge)||!o.text_value||Number.isFinite(o.value)))fail('MCA observations must be A/B-badge categorical text with no numeric score');
if(oo.some(o=>!o.source_url||!o.published_at))fail('MCA observations must carry source_url and published_at provenance');

// zero county/constituency -> ward inheritance: every observation's text must trace to this ward's own row.
const rowByGeo=new Map(snap.rows.map(r=>[r.geo_code,r]));
for(const s of ss){
  const geo=wards.find(g=>g.geography_id===s.geography_id);
  const row=rowByGeo.get(geo.geo_code);
  if(!row)fail(`series present for ${geo.geo_code} without a matching snapshot row`);
  const o=oo.find(x=>x.series_id===s.series_id);
  if(!o.text_value.includes(row.member_name.split(' ')[0]))fail(`observation text for ${geo.geo_code} does not trace to its own snapshot row`);
}

if(!datasets.some(d=>d.dataset_code==='DS-IEBC-GAZETTE-WARD-MCA-2022-P24'))fail('P24 MCA dataset missing');
if(!releases.some(r=>r.release_code==='REL-IEBC-GAZETTE-9956-WARD-MCA-2022-P24'))fail('P24 MCA release missing');

const mcaStates=(evidence.states||[]).filter(s=>s.level==='ward'&&s.indicator_code==='IND-MCA-IDENTITY');
if(mcaStates.length!==2)fail(`expected 2 governed evidence-state entries for IND-MCA-IDENTITY|ward, got ${mcaStates.length}`);
const stateCoverage=new Set(mcaStates.flatMap(s=>s.geo_codes||[]));
if(stateCoverage.size!==17)fail(`expected 17 governed ward geo_codes across MCA evidence states, got ${stateCoverage.size}`);
for(const s of mcaStates){
  if(s.status!=='official_unavailable')fail('MCA evidence states must be official_unavailable');
  if(!s.reason||s.reason.length<40)fail('MCA evidence state reason must be substantive');
  if(!s.source_url)fail('MCA evidence state must carry source_url');
}

if(summary.total_slots!==20115)fail(`governed denominator changed unexpectedly: ${summary.total_slots}`);
if(summary.unknown_missing!==0)fail(`unknown_missing=${summary.unknown_missing}`);

console.log(`P24_WARD_MCA_PROMOTION_OK resolved=${snap.rows.length} boundary_held=${boundaryHeld.length} postponed_held=${postponedHeld.length} series=${ss.length} observations=${oo.length}`);
