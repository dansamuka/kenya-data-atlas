import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode))throw new Error('Usage: build-constituency-mps.mjs <catalogue|indicators>');
const SNAP='data/p23/source/constituency-mps-13th-parliament.json';
const CONTRACT='data/p23/constituency-mp-roster-contract.json';
const SOURCE_URL='https://www.parliament.go.ke/the-national-assembly/mps';
const INGESTED_AT='2026-09-02T05:45:00.000Z';
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 MP build: ${msg}`);};
const uuid=name=>{const b=createHash('sha1').update(`kenya-data-atlas:p23-mp:${name}`).digest();b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const unionFields=rows=>[...new Set(rows.flatMap(r=>Object.keys(r)))];
const csv=rows=>{const f=unionFields(rows);return [f.join(','),...rows.map(r=>f.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';};

const snapshot=await readJson(SNAP);
assert(snapshot.coverage?.constituencies===290&&snapshot.rows?.length===290,'frozen source snapshot must cover 290 constituencies');
assert(new Set(snapshot.rows.map(r=>r.geo_code)).size===290,'frozen source has duplicate geo codes');

const AGENCY_CODE='PARLIAMENT-KE';
const SOURCE_CODE='PARLIAMENT-NA-MEMBERS';
const DATASET_CODE='DS-PARLIAMENT-CONSTITUENCY-MPS-13TH-P23';
const RELEASE_CODE='REL-PARLIAMENT-CONSTITUENCY-MPS-2026-08-12-P23';

if(mode==='catalogue'){
  const dir='data/catalogue/registry';
  const [agencies,sources,datasets,releases]=await Promise.all(['agencies','sources','datasets','releases'].map(x=>readJson(`${dir}/${x}.json`)));
  let agency=agencies.find(a=>a.agency_code===AGENCY_CODE);
  if(!agency){agency={agency_id:uuid(`agency:${AGENCY_CODE}`),agency_code:AGENCY_CODE,name:'Parliament of Kenya',abbreviation:'Parliament',agency_type:'legislature',official_url:'https://www.parliament.go.ke/',jurisdiction:'Kenya',description:'Official Parliament of Kenya publisher for National Assembly membership and proceedings.',active:true};agencies.push(agency);}
  let source=sources.find(s=>s.source_code===SOURCE_CODE);
  if(!source){source={source_id:uuid(`source:${SOURCE_CODE}`),source_code:SOURCE_CODE,agency_id:agency.agency_id,name:'National Assembly Members roster',source_type:'official_registry',landing_page_url:SOURCE_URL,expected_cadence:'irregular',source_priority:'critical',access_method:'web_registry',reuse_status:'public_official_registry',licence_name:null,licence_url:null,attribution_text:'Source: Parliament of Kenya — National Assembly',assessment_status:'approved_with_conditions',assessment_note:'Use only constituency-elected member rows that reconcile one-to-one to the canonical constituency registry; preserve roster as-of date.',active:true};sources.push(source);}
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){dataset={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:source.source_id,title:'13th Parliament — constituency-elected National Assembly members',description:'Official National Assembly roster mapped one-to-one to Kenya’s 290 current constituencies, retaining member name and party.',topic:'Representation',geographic_coverage:['constituency'],frequency:'irregular',publication_status:'published',methodology_url:CONTRACT,known_limitations:'Roster is a point-in-time representation snapshot. Party/member changes after the stated source as-of date require a new release; nominated members and county women representatives are excluded from constituency MP identity.'};datasets.push(dataset);}
  if(!releases.some(r=>r.release_code===RELEASE_CODE))releases.push({release_id:uuid(`release:${RELEASE_CODE}`),release_code:RELEASE_CODE,dataset_id:dataset.dataset_id,title:'National Assembly members — 13th Parliament, source roster as at 12 Aug 2026',reference_period_start:'2026-08-12',reference_period_end:'2026-08-12',published_at:'2026-08-12',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:SOURCE_URL,release_status:'published',version_label:'P23 constituency MP roster',release_notes:'Official Parliament roster reconciled exactly 290/290 to the canonical constituency registry. Member name and party remain categorical text; no inferred party or parent-geography identity.',supersedes_release_id:''});
  for(const [name,rows] of [['agencies',agencies],['sources',sources],['datasets',datasets],['releases',releases]]){await writeFile(path.join(root,`${dir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows));}
  console.log('P23_MP_CATALOGUE_OK agency=1 source=1 dataset=1 release=1');
}else{
  const idir='data/indicators/registry',cdir='data/catalogue/registry';
  let [units,indicators,series,observations,geos,datasets,releases,sources]=await Promise.all([
    readJson(`${idir}/units.json`),readJson(`${idir}/indicators.json`),readJson(`${idir}/series.json`),readJson(`${idir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson(`${cdir}/datasets.json`),readJson(`${cdir}/releases.json`),readJson(`${cdir}/sources.json`)
  ]);
  const indicator=indicators.find(i=>i.indicator_code==='IND-MP-IDENTITY');
  const unit=units.find(u=>u.code==='category');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE),release=releases.find(r=>r.release_code===RELEASE_CODE);
  const source=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  assert(indicator&&unit&&dataset&&release&&source,'required indicator/unit/catalogue records missing; run catalogue mode first');
  const cons=geos.filter(g=>g.level==='constituency');assert(cons.length===290,'canonical constituency count != 290');
  const geoByCode=new Map(cons.map(g=>[g.geo_code,g]));
  for(const row of snapshot.rows){const g=geoByCode.get(row.geo_code);assert(g,`unknown canonical geo ${row.geo_code}`);assert(Number(g.constituency_code)===Number(row.constituency_code),`code mismatch ${row.geo_code}`);}
  const prefix='KDA-P23-MP-';
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(prefix)).map(s=>s.series_id));
  series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));
  for(const row of snapshot.rows){
    const geo=geoByCode.get(row.geo_code),scode=`${prefix}${String(row.constituency_code).padStart(3,'0')}`;
    const sid=uuid(`series:${scode}`),oid=uuid(`observation:${scode}:2026-08-12`);
    series.push({series_id:sid,series_code:scode,indicator_id:indicator.indicator_id,geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'irregular',period_type:'point_in_time',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'13TH-PARLIAMENT-CONSTITUENCY-MP-2026-08-12',dataset_id:dataset.dataset_id,agency_id:source.agency_id,methodology_url:CONTRACT,start_period:'2026-08-12',end_period:'2026-08-12',latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
    observations.push({observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',period_start:'2026-08-12',period_end:'2026-08-12',period_type:'point_in_time',period_label:'13th Parliament roster as at 12 Aug 2026',value:null,text_value:`${row.member_name} — ${row.party}`,geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:'Members of National Assembly',source_sheet:'',source_page:'',source_row_label:`${row.published_constituency}: ${row.member_name}`,source_url:row.source_page||SOURCE_URL,published_at:'2026-08-12',ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${scode}:2026-08-12:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:`Direct official Parliament roster. Published constituency: ${row.published_constituency}; party: ${row.party}; status: ${row.status}. No county inheritance or inferred identity.`});
  }
  Object.assign(indicator,{name:'Member of Parliament (name, party)',short_name:'Member of Parliament',description:'Current constituency-elected National Assembly member and published party from the official Parliament roster.',unit_id:unit.unit_id,lifecycle_status:'active',active:true,comparable:false,ranking_allowed:false,methodology_url:CONTRACT,expected_source:'Parliament of Kenya — National Assembly Members roster',expected_source_url:SOURCE_URL,expected_availability_note:'Direct official constituency roster; point-in-time identity, not a numeric performance measure.'});
  for(const [name,rows] of [['indicators',indicators],['series',series],['observations',observations]]){await writeFile(path.join(root,`${idir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${idir}/${name}.csv`),csv(rows));}
  console.log('P23_MP_INDICATORS_OK observations=290 direct=290');
}
