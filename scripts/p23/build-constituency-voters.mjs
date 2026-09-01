import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_URL = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const IEBC_URL = 'https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
const INGESTED_AT = '2026-09-01T13:00:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"','""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(r => fields.map(f => csvCell(r[f])).join(','))].join('\n') + '\n';
const unionFields = rows => [...new Set(rows.flatMap(r => Object.keys(r)))];
const uuid = name => { const h=createHash('sha1').update(`kenya-data-atlas:p23:${name}`).digest('hex').slice(0,32); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`; };
const assert = (ok,msg) => { if (!ok) throw new Error(`P23 constituency voters: ${msg}`); };

async function fetchRows() {
  const res = await fetch(SOURCE_URL, { headers:{'User-Agent':'Kenya-Data-Atlas-P23'} });
  assert(res.ok, `pinned extraction fetch failed (${res.status})`);
  const lines=(await res.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/); const header=lines.shift();
  assert(header?.includes('Registered Voters'),'source header changed');
  return lines.filter(Boolean).map((line,i)=>{ const c=line.split(','); assert(c.length>=8,`source row ${i+2} malformed`); return {county_code:Number(c[1]),constituency_code:Number(c[3]),voters:Number(c[7])}; });
}

const mode=process.argv[2];
assert(['catalogue','indicators'].includes(mode),'usage: build-constituency-voters.mjs <catalogue|indicators>');
const rows=await fetchRows();
assert(rows.length===1450,'expected 1,450 IEBC ward rows');
assert(rows.every(r=>Number.isInteger(r.voters)&&r.voters>0),'invalid voter value');
const totals=new Map(); for(const r of rows) totals.set(r.constituency_code,(totals.get(r.constituency_code)||0)+r.voters);
assert(totals.size===290,'expected 290 constituency aggregates');
assert([...totals.values()].reduce((a,b)=>a+b,0)===22102532,'national voter total changed');
assert(totals.get(1)===93561 && totals.get(91)===72997 && totals.get(290)===123163,'locked constituency anchors changed');

if(mode==='catalogue') {
  const dir='data/catalogue/registry';
  const [datasets,releases,sources]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`),readJson(`${dir}/sources.json`)]);
  const base=datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS-COUNTY-2022-S1') || datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS');
  assert(base?.source_id,'IEBC voter source dataset missing');
  const code='DS-IEBC-VOTERS-CONSTITUENCY-2022-P23';
  let ds=datasets.find(d=>d.dataset_code===code);
  if(!ds){ ds={dataset_id:uuid(`dataset:${code}`),dataset_code:code,source_id:base.source_id,title:'Registered Voters — 2022 Constituency Gazette Schedule',description:'IEBC 2022 registered voters for all 290 constituencies, deterministically aggregated from the official ward schedule and reconciled to the Gazette constituency/county schedules.',topic:'Elections',geographic_coverage:['constituency'],frequency:'electoral_cycle',publication_status:'published',methodology_url:'data/p23/constituency-voter-promotion-contract.json',known_limitations:'2022 election-register vintage. No county value is inherited. Mandera East/Lafey ward geometry hold does not affect constituency statistical totals.'}; datasets.push(ds); }
  const rcode='REL-IEBC-VOTERS-CONSTITUENCY-2022-P23';
  if(!releases.some(r=>r.release_code===rcode)) releases.push({release_id:uuid(`release:${rcode}`),release_code:rcode,dataset_id:ds.dataset_id,title:'Kenya Gazette Notice No. 7290 — Registered Voters per Constituency',reference_period_start:'2022-06-20',reference_period_end:'2022-06-20',published_at:'2022-06-21',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:IEBC_URL,release_status:'published',version_label:'P23 constituency promotion',release_notes:'Second Schedule cross-check; published values use the audited Sprint 2 B — Official derived treatment from exact official child-ward sums.',supersedes_release_id:''});
  await writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets,unionFields(datasets)));
  await writeFile(path.join(root,`${dir}/releases.csv`),csv(releases,unionFields(releases)));
  console.log('P23 constituency voter catalogue promoted.');
} else {
  const dir='data/indicators/registry';
  const [units,indicators,series,observations,geos,datasets,releases,sources]=await Promise.all([readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const ind=indicators.find(i=>i.indicator_code==='IND-REGISTERED-VOTERS'); assert(ind,'registered-voters indicator missing');
  const unit=units.find(u=>u.unit_id===ind.unit_id); assert(unit,'registered-voters unit missing');
  const ds=datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS-CONSTITUENCY-2022-P23'); const rel=releases.find(r=>r.release_code==='REL-IEBC-VOTERS-CONSTITUENCY-2022-P23'); assert(ds&&rel,'P23 catalogue objects missing');
  const agency=sources.find(s=>s.source_id===ds.source_id)?.agency_id || '';
  const cons=geos.filter(g=>g.level==='constituency'); assert(cons.length===290,'canonical constituency registry != 290');
  const byCode=new Map(cons.map(g=>[Number(g.constituency_code),g])); const seriesByCode=new Map(series.map(s=>[s.series_code,s])); const obsIds=new Set(observations.map(o=>o.observation_id));
  for(let code=1;code<=290;code++) { const geo=byCode.get(code); assert(geo,`canonical constituency ${code} missing`); const value=totals.get(code); assert(Number.isInteger(value),`voter total ${code} missing`); const scode=`KDA-VOTERS-CON-${String(code).padStart(3,'0')}-2022`; let s=seriesByCode.get(scode); if(!s){s={series_id:uuid(`series:${scode}`),series_code:scode,indicator_id:ind.indicator_id,geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'electoral_cycle',period_type:'point_in_time',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'aggregated',comparability_group:'IEBC-REGISTERED-VOTERS-2022',dataset_id:ds.dataset_id,agency_id:agency,methodology_url:'data/p23/constituency-voter-promotion-contract.json',start_period:'2022 registered voters',end_period:'2022 registered voters',latest_observation_id:'',observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''}; series.push(s);seriesByCode.set(scode,s);} const oid=uuid(`observation:${scode}:2022-06-20`); if(!obsIds.has(oid)){observations.push({observation_id:oid,series_id:s.series_id,geography_id:geo.geography_id,boundary_version:'2012-01',period_start:'2022-06-20',period_end:'2022-06-20',period_type:'point_in_time',period_label:'2022 registered voters',value,geographic_method:'aggregated',statistical_status:'final',source_class:'official',badge:'B',source_release_id:rel.release_id,source_dataset_id:ds.dataset_id,source_table:'First Schedule — Registered Voters per County Assembly Ward (exact child-row sum; Second Schedule reconciled)',source_sheet:'',source_page:'',source_row_label:geo.name,source_url:IEBC_URL,published_at:'2022-06-21',ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${scode}:2022-06-20:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:'B — Official derived. Exact sum of official IEBC child ward rows. No county value inherited. Mandera East/Lafey spatial hold affects ward geometry only, not constituency statistical totals.'});obsIds.add(oid);} s.latest_observation_id=oid; }
  await writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'); await writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'); await writeFile(path.join(root,`${dir}/series.csv`),csv(series,unionFields(series))); await writeFile(path.join(root,`${dir}/observations.csv`),csv(observations,unionFields(observations)));
  console.log('P23 constituency voter observations promoted: 290.');
}
