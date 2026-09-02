import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const fail=m=>{throw new Error(`P23 MP validate: ${m}`);};
const [snap,geos,inds,series,obs,datasets,releases,summary]=await Promise.all([
  read('data/p23/source/constituency-mps-13th-parliament.json'),read('data/geography/registry/geographies.json'),read('data/indicators/registry/indicators.json'),read('data/indicators/registry/series.json'),read('data/indicators/registry/observations.json'),read('data/catalogue/registry/datasets.json'),read('data/catalogue/registry/releases.json'),read('data/completeness/summary.json')
]);
const cons=geos.filter(g=>g.level==='constituency');if(cons.length!==290)fail(`canonical constituencies=${cons.length}`);
if(snap.rows?.length!==290||snap.coverage?.constituencies!==290)fail('source snapshot does not cover 290');
const ind=inds.find(i=>i.indicator_code==='IND-MP-IDENTITY');if(!ind||ind.lifecycle_status!=='active')fail('MP indicator not active');
const ss=series.filter(s=>s.indicator_id===ind.indicator_id&&cons.some(g=>g.geography_id===s.geography_id));
if(ss.length!==290)fail(`canonical MP series=${ss.length}`);
const ids=new Set(ss.map(s=>s.series_id));const oo=obs.filter(o=>ids.has(o.series_id));if(oo.length!==290)fail(`canonical MP observations=${oo.length}`);
if(oo.some(o=>o.badge!=='A'||o.geographic_method!=='direct'||!o.text_value||Number.isFinite(o.value)))fail('MP observations must be direct A-badge categorical text with no numeric score');
if(new Set(ss.map(s=>s.geography_id)).size!==290)fail('duplicate/missing MP geography mapping');
if(!datasets.some(d=>d.dataset_code==='DS-PARLIAMENT-CONSTITUENCY-MPS-13TH-P23'))fail('P23 MP dataset missing');
if(!releases.some(r=>r.release_code==='REL-PARLIAMENT-CONSTITUENCY-MPS-2026-08-12-P23'))fail('P23 MP release missing');
if(summary.total_slots!==20115)fail(`governed denominator changed: ${summary.total_slots}`);
if(summary.resolved_slots!==5034||summary.unresolved_slots!==15081)fail(`unexpected completeness after MP promotion: ${summary.resolved_slots}/${summary.unresolved_slots}`);
if(summary.by_completion_phase?.P23!==2030)fail(`expected P23 remaining=2030, got ${summary.by_completion_phase?.P23}`);
if(summary.unknown_missing!==0)fail(`unknown_missing=${summary.unknown_missing}`);
console.log('P23_MP_PROMOTION_OK source=290 series=290 observations=290 resolved=5034 p23_remaining=2030 unknown=0');
