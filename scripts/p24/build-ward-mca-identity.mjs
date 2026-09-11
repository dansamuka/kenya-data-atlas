import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if(!['catalogue','indicators'].includes(mode))throw new Error('Usage: build-ward-mca-identity.mjs <catalogue|indicators>');
const SNAP='data/p24/source/ward-mca-gazette-9956-2022.json';
const CONTRACT='docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md';
const IEBC_SOURCE_ID='41674c61-8d5e-5122-8e0d-ee116dd9b0c3'; // existing IEBC-ELECTORAL catalogue source
const INGESTED_AT='2026-09-09T00:00:00.000Z';
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P24 ward MCA build: ${msg}`);};
const uuid=name=>{const b=createHash('sha1').update(`kenya-data-atlas:p24-mca:${name}`).digest();b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const unionFields=rows=>[...new Set(rows.flatMap(r=>Object.keys(r)))];
const csv=rows=>{const f=unionFields(rows);return [f.join(','),...rows.map(r=>f.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';};

const snapshot=await readJson(SNAP);
assert(snapshot.coverage?.total_wards===1450,'frozen source snapshot must cover all 1,450 wards (resolved + governed_unavailable)');
assert(snapshot.rows?.length===snapshot.coverage.resolved_direct_official,'resolved row count must match declared coverage');
assert(new Set(snapshot.rows.map(r=>r.geo_code)).size===snapshot.rows.length,'frozen source snapshot has duplicate geo codes');

const DATASET_CODE='DS-IEBC-GAZETTE-WARD-MCA-2022-P24';
const RELEASE_CODE='REL-IEBC-GAZETTE-9956-WARD-MCA-2022-P24';
const SOURCE_URL=snapshot.source_url;

if(mode==='catalogue'){
  const dir='data/catalogue/registry';
  const [datasets,releases,sources]=await Promise.all(['datasets','releases','sources'].map(x=>readJson(`${dir}/${x}.json`)));
  const source=sources.find(s=>s.source_id===IEBC_SOURCE_ID);
  assert(source,'expected existing IEBC-ELECTORAL catalogue source record');
  let dataset=datasets.find(d=>d.dataset_code===DATASET_CODE);
  if(!dataset){
    dataset={dataset_id:uuid(`dataset:${DATASET_CODE}`),dataset_code:DATASET_CODE,source_id:source.source_id,title:'2022 County Assembly Ward Representative (MCA) declared results — Gazette Notice No. 9956',description:'IEBC declaration of persons elected as Members of the various County Assemblies (Ward Representatives) in the 9 August 2022 general election, published as Gazette Notice No. 9956 in Kenya Gazette Special Issue Vol. CXXIV No. 170 (24 August 2022). Covers all 1,450 County Assembly Wards nationally with surname, other names, party/independent name and abbreviation, and votes garnered.',topic:'Representation',geographic_coverage:['ward'],frequency:'electoral_cycle',publication_status:'published',methodology_url:CONTRACT,known_limitations:'Ten Mandera East/Lafey wards are withheld: the Gazette schedule for that constituency pair does not reconcile one-to-one with the canonical 2012-vintage ward roster (same conflict already held for IND-REGISTERED-VOTERS). Seven further wards had their 9 August 2022 poll postponed and carry no declared winner in this notice. Point-in-time roster; subsequent by-elections or vacancies are not reflected unless separately ingested.'};
    datasets.push(dataset);
  }
  const rcode=RELEASE_CODE;
  if(!releases.some(r=>r.release_code===rcode))releases.push({release_id:uuid(`release:${rcode}`),release_code:rcode,dataset_id:dataset.dataset_id,title:'Gazette Notice No. 9956 — Declaration of Persons Elected as Members of the County Assemblies',reference_period_start:snapshot.election_date,reference_period_end:snapshot.gazette_declaration_date,published_at:snapshot.gazette_publication_date,discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:SOURCE_URL,release_status:'published',version_label:'P24 ward MCA identity',release_notes:`Official IEBC declaration, ${snapshot.gazette_volume}, ${snapshot.gazette_publication_date}. 1,433/1,450 wards resolved as direct official identity; 10 held for a known Mandera East/Lafey ward-roster conflict; 7 held because the ward poll was postponed with no winner declared in this notice.`,supersedes_release_id:''});
  for(const [name,rows] of [['datasets',datasets],['releases',releases]]){await writeFile(path.join(root,`${dir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows));}
  console.log(`P24_MCA_CATALOGUE_OK dataset=1 release=1`);
}else{
  const idir='data/indicators/registry',cdir='data/catalogue/registry';
  let [units,indicators,series,observations,geos,datasets,releases,sources]=await Promise.all([
    readJson(`${idir}/units.json`),readJson(`${idir}/indicators.json`),readJson(`${idir}/series.json`),readJson(`${idir}/observations.json`),readJson('data/geography/registry/geographies.json'),readJson(`${cdir}/datasets.json`),readJson(`${cdir}/releases.json`),readJson(`${cdir}/sources.json`)
  ]);
  const indicator=indicators.find(i=>i.indicator_code==='IND-MCA-IDENTITY');
  const unit=units.find(u=>u.code==='category');
  const dataset=datasets.find(d=>d.dataset_code===DATASET_CODE),release=releases.find(r=>r.release_code===RELEASE_CODE);
  const source=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
  assert(indicator&&unit&&dataset&&release&&source,'required indicator/unit/catalogue records missing; run catalogue mode first');
  const wards=geos.filter(g=>g.level==='ward');assert(wards.length===1450,'canonical ward count != 1450');
  const geoByCode=new Map(wards.map(g=>[g.geo_code,g]));
  for(const row of snapshot.rows){const g=geoByCode.get(row.geo_code);assert(g,`unknown canonical geo ${row.geo_code}`);assert(Number(g.ward_code)===Number(row.ward_code),`ward code mismatch ${row.geo_code}`);}

  const prefix='KDA-P24-MCA-';
  const oldIds=new Set(series.filter(s=>String(s.series_code).startsWith(prefix)).map(s=>s.series_id));
  series=series.filter(s=>!oldIds.has(s.series_id));observations=observations.filter(o=>!oldIds.has(o.series_id));

  for(const row of snapshot.rows){
    const geo=geoByCode.get(row.geo_code),scode=`${prefix}${String(row.ward_code).padStart(4,'0')}`;
    const sid=uuid(`series:${scode}`),oid=uuid(`observation:${scode}:${snapshot.gazette_declaration_date}`);
    const crossed=row.crosswalk_method!=='name_and_code';
    const partyLabel=row.party_abbrev||row.party_name;
    const unopposedNote=row.votes_note==='no_contest_unopposed'?' (elected unopposed — no contest)':'';
    const textValue=`${row.member_name} — ${partyLabel}${unopposedNote}`;
    series.push({series_id:sid,series_code:scode,indicator_id:indicator.indicator_id,geography_id:geo.geography_id,geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'irregular',period_type:'point_in_time',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:crossed?'aggregated':'direct',comparability_group:crossed?'IEBC-GAZETTE-9956-WARD-MCA-CROSSWALK':'IEBC-GAZETTE-9956-WARD-MCA-2022',dataset_id:dataset.dataset_id,agency_id:source.agency_id,methodology_url:CONTRACT,start_period:snapshot.gazette_declaration_date,end_period:snapshot.gazette_declaration_date,latest_observation_id:oid,observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''});
    observations.push({observation_id:oid,series_id:sid,geography_id:geo.geography_id,boundary_version:'2012-01',period_start:snapshot.gazette_declaration_date,period_end:snapshot.gazette_declaration_date,period_type:'point_in_time',period_label:`2022 general election, declared ${snapshot.gazette_declaration_date}`,value:null,text_value:textValue,geographic_method:crossed?'aggregated':'direct',statistical_status:'final',source_class:'official',badge:crossed?'B':'A',source_release_id:release.release_id,source_dataset_id:dataset.dataset_id,source_table:'Schedule — Declaration of Persons Elected as Members of the County Assemblies',source_sheet:'',source_page:String(row.source_page_pdf_index),source_row_label:`${row.source_ward_name} (CAW ${row.source_caw_code}): ${row.member_name}`,source_url:SOURCE_URL,published_at:snapshot.gazette_publication_date,ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${scode}:${snapshot.gazette_declaration_date}:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:crossed?`P24-CAW-XW-${row.source_caw_code}-${String(row.ward_code).padStart(4,'0')}`:'',notes:crossed?`B — Official derived geography crosswalk. Gazette CAW ${row.source_caw_code} "${row.source_ward_name}" matched to canonical ${geo.geo_code} "${row.ward_name}" by ${row.crosswalk_method}. Votes garnered (official, not published as a ranking measure): ${row.votes_raw}. No county/constituency inheritance.`:`A — Official direct. Gazette CAW ${row.source_caw_code} "${row.source_ward_name}" matches canonical ${geo.geo_code} "${row.ward_name}". Votes garnered (official, not published as a ranking measure): ${row.votes_raw}. No county/constituency inheritance.`});
  }
  Object.assign(indicator,{name:'Member of County Assembly (name, party)',short_name:'Member of County Assembly (name, party)',description:'Current ward MCA (Ward Representative) identity and published party from the official IEBC Gazette Notice No. 9956 declaration of the 2022 general election.',unit_id:unit.unit_id,lifecycle_status:'active',active:true,comparable:false,ranking_allowed:false,methodology_url:CONTRACT,expected_source:'Independent Electoral and Boundaries Commission — Gazette Notice No. 9956',expected_source_url:SOURCE_URL,expected_availability_note:'Direct official ward-level declaration; point-in-time identity, not a numeric performance measure.'});
  for(const [name,rows] of [['indicators',indicators],['series',series],['observations',observations]]){await writeFile(path.join(root,`${idir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${idir}/${name}.csv`),csv(rows));}
  const direct=snapshot.rows.filter(r=>r.crosswalk_method==='name_and_code').length,crossed=snapshot.rows.length-direct;
  console.log(`P24_MCA_INDICATORS_OK observations=${snapshot.rows.length} direct=${direct} crosswalked=${crossed}`);
}
