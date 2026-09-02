import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_URL = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const IEBC_URL = 'https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
const HOLDS = new Set([43, 44]); // Mandera East, Lafey
const INGESTED_AT = '2026-09-02T12:30:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"','""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(r => fields.map(f => csvCell(r[f])).join(','))].join('\n') + '\n';
const unionFields = rows => [...new Set(rows.flatMap(r => Object.keys(r)))];
const uuid = name => { const h=createHash('sha1').update(`kenya-data-atlas:p23x:${name}`).digest('hex').slice(0,32); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`; };
const assert = (ok,msg) => { if (!ok) throw new Error(`P23X ward voters: ${msg}`); };

function norm(value) {
  return String(value || '').toUpperCase().normalize('NFKD')
    .replace(/[’‘]/g, "'").replace(/\bCITY\b/g, '').replace(/[^A-Z0-9]+/g, '');
}
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
function firstSchedulePage(code) {
  const hit = [
    [1,20,3671],[21,93,3672],[94,166,3673],[167,239,3674],[240,312,3675],[313,385,3676],
    [386,458,3677],[459,531,3678],[532,604,3679],[605,677,3680],[678,750,3681],[751,823,3682],
    [824,896,3683],[897,969,3684],[970,1042,3685],[1043,1115,3686],[1116,1188,3687],[1189,1261,3688],
    [1262,1334,3689],[1335,1407,3690],[1408,1450,3691]
  ].find(([lo,hi]) => code >= lo && code <= hi);
  return hit ? String(hit[2]) : '';
}
async function fetchRows() {
  const res = await fetch(SOURCE_URL, { headers:{'User-Agent':'Kenya-Data-Atlas-P23X'} });
  assert(res.ok, `pinned extraction fetch failed (${res.status})`);
  const lines=(await res.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/); const header=lines.shift();
  assert(header?.includes('Registered Voters'),'source header changed');
  return lines.filter(Boolean).map((line,i)=>{
    const c=line.split(','); assert(c.length>=8,`source row ${i+2} malformed`);
    return {county_code:Number(c[1]),county_name:c[2].trim(),constituency_code:Number(c[3]),constituency_name:c[4].trim(),ward_code:Number(c[5]),ward_name:c[6].trim(),voters:Number(c[7])};
  });
}
function resolveSafe(sourceRows, canonicalRows) {
  const available = new Map(canonicalRows.map(g => [Number(g.ward_code), g]));
  const mapped = new Map();
  const methods = new Map();
  for (const row of sourceRows) {
    const matches=[...available.values()].filter(g=>norm(g.name)===norm(row.ward_name));
    if (matches.length===1) {
      const ward=matches[0]; mapped.set(row.ward_code,ward);
      methods.set(row.ward_code,Number(ward.ward_code)===row.ward_code?'code_and_name':'name_crosswalk');
      available.delete(Number(ward.ward_code));
    }
  }
  for (const row of sourceRows) {
    if (mapped.has(row.ward_code)) continue;
    const direct=available.get(row.ward_code);
    if (direct) { mapped.set(row.ward_code,direct); methods.set(row.ward_code,'code_label_variant'); available.delete(row.ward_code); }
  }
  const sourceRest=sourceRows.filter(r=>!mapped.has(r.ward_code)).sort((a,b)=>a.ward_code-b.ward_code);
  const canonicalRest=[...available.values()].sort((a,b)=>Number(a.ward_code)-Number(b.ward_code));
  assert(sourceRest.length===canonicalRest.length,`residual crosswalk imbalance in constituency ${sourceRows[0]?.constituency_code}`);
  sourceRest.forEach((row,i)=>{mapped.set(row.ward_code,canonicalRest[i]);methods.set(row.ward_code,'residual_one_to_one');});
  assert(mapped.size===sourceRows.length,`incomplete crosswalk in constituency ${sourceRows[0]?.constituency_code}`);
  return {mapped,methods};
}

const mode=process.argv[2];
assert(['catalogue','indicators'].includes(mode),'usage: build-ward-voters.mjs <catalogue|indicators>');
const rows=await fetchRows();
assert(rows.length===1450,'expected 1,450 IEBC ward rows');
assert(rows.every(r=>Number.isInteger(r.voters)&&r.voters>0),'invalid voter value');
assert(new Set(rows.map(r=>r.ward_code)).size===1450,'source ward codes not unique');
assert(new Set(rows.map(r=>r.constituency_code)).size===290,'source constituency coverage != 290');
assert(rows.reduce((a,r)=>a+r.voters,0)===22102532,'national voter total changed');

if (mode==='catalogue') {
  const dir='data/catalogue/registry';
  const [datasets,releases]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`)]);
  const base=datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS-COUNTY-2022-S1') || datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS');
  assert(base?.source_id,'IEBC voter source dataset missing');
  const code='DS-IEBC-VOTERS-WARD-2022-P23X';
  let ds=datasets.find(d=>d.dataset_code===code);
  if(!ds){
    ds={dataset_id:uuid(`dataset:${code}`),dataset_code:code,source_id:base.source_id,title:'Registered Voters — 2022 County Assembly Ward Gazette Schedule',description:'IEBC 2022 registered voters for 1,450 domestic County Assembly Ward source rows. 1,440 are attached to canonical Atlas ward geometry through the audited Sprint 2 mapping; ten Mandera East/Lafey rows remain held from spatial attribution.',topic:'Elections',geographic_coverage:['ward'],frequency:'electoral_cycle',publication_status:'published',methodology_url:'data/sprint2/README.md',known_limitations:'Ten official Mandera East/Lafey CAW rows remain in higher-level statistical totals but are withheld from canonical ward geometry because the current external boundary layer conflicts with the operative IEBC configuration. 54 published rows require an explicit source-to-canonical ward crosswalk and are badged B.'};
    datasets.push(ds);
  }
  const rcode='REL-IEBC-VOTERS-WARD-2022-P23X';
  if(!releases.some(r=>r.release_code===rcode)) releases.push({release_id:uuid(`release:${rcode}`),release_code:rcode,dataset_id:ds.dataset_id,title:'Kenya Gazette Notice No. 7290 — Registered Voters per County Assembly Ward',reference_period_start:'2022-06-20',reference_period_end:'2022-06-20',published_at:'2022-06-21',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:IEBC_URL,release_status:'published',version_label:'P23X ward materialisation',release_notes:'First Schedule supplies all 1,450 domestic CAW values. 1,440 are safely mapped to canonical ward geography; ten Mandera East/Lafey rows remain explicit spatial holds.',supersedes_release_id:''});
  await writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets,unionFields(datasets)));
  await writeFile(path.join(root,`${dir}/releases.csv`),csv(releases,unionFields(releases)));
  console.log('P23X ward voter catalogue promoted.');
} else {
  const dir='data/indicators/registry';
  const [units,indicators,series,observations,geos,datasets,releases,sources]=await Promise.all([
    readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')
  ]);
  const ind=indicators.find(i=>i.indicator_code==='IND-REGISTERED-VOTERS'); assert(ind,'registered-voters indicator missing');
  const unit=units.find(u=>u.unit_id===ind.unit_id); assert(unit,'registered-voters unit missing');
  const ds=datasets.find(d=>d.dataset_code==='DS-IEBC-VOTERS-WARD-2022-P23X');
  const rel=releases.find(r=>r.release_code==='REL-IEBC-VOTERS-WARD-2022-P23X'); assert(ds&&rel,'P23X ward catalogue objects missing');
  const agency=sources.find(s=>s.source_id===ds.source_id)?.agency_id || '';
  const wards=geos.filter(g=>g.level==='ward'); const cons=geos.filter(g=>g.level==='constituency');
  assert(wards.length===1450&&cons.length===290,'canonical ward/constituency registry incomplete');
  const sourceByCon=groupBy(rows,r=>r.constituency_code); const canonicalByCon=groupBy(wards,g=>Number(g.constituency_code));
  const resolved=[]; const held=[]; const used=new Set(); let crosswalkCount=0;
  for(let code=1;code<=290;code++) {
    const sourceRows=sourceByCon.get(code)||[]; const canonicalRows=canonicalByCon.get(code)||[];
    assert(sourceRows.length&&sourceRows.length===canonicalRows.length,`constituency ${code}: source/canonical ward-count mismatch`);
    if(HOLDS.has(code)){sourceRows.forEach(r=>held.push(r));continue;}
    const {mapped,methods}=resolveSafe(sourceRows,canonicalRows);
    for(const row of sourceRows){
      const ward=mapped.get(row.ward_code); assert(ward&&!used.has(ward.geography_id),`source CAW ${row.ward_code}: non-unique mapping`); used.add(ward.geography_id);
      assert(Number(ward.constituency_code)===row.constituency_code&&Number(ward.county_code)===row.county_code,`source CAW ${row.ward_code}: crosswalk escaped parent geography`);
      const match=methods.get(row.ward_code); const crossed=Number(ward.ward_code)!==row.ward_code||norm(ward.name)!==norm(row.ward_name); if(crossed)crosswalkCount++;
      resolved.push({row,ward,match,crossed});
    }
  }
  assert(resolved.length===1440&&used.size===1440,'expected 1,440 safely mapped wards');
  assert(held.length===10&&held.every(r=>r.county_code===9&&HOLDS.has(r.constituency_code)),'expected only ten Mandera East/Lafey holds');
  assert(crosswalkCount===54,'expected 54 audited source-to-canonical crosswalk rows');
  const seriesByCode=new Map(series.map(s=>[s.series_code,s])); const obsIds=new Set(observations.map(o=>o.observation_id));
  for(const {row,ward,match,crossed} of resolved){
    const scode=`KDA-VOTERS-WARD-${String(ward.ward_code).padStart(4,'0')}-2022`; let s=seriesByCode.get(scode);
    const method=crossed?'aggregated':'direct'; // B denotes official-derived geography crosswalk; value itself is not arithmetically aggregated.
    const crosswalkId=crossed?`P23X-CAW-XW-${String(row.ward_code).padStart(4,'0')}-${String(ward.ward_code).padStart(4,'0')}`:'';
    if(!s){
      s={series_id:uuid(`series:${scode}`),series_code:scode,indicator_id:ind.indicator_id,geography_id:ward.geography_id,geography_taxonomy:ward.geography_system||'electoral',boundary_version:'2012-01',frequency:'electoral_cycle',period_type:'point_in_time',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:method,comparability_group:crossed?'IEBC-REGISTER-2022-WARD-CROSSWALK':'IEBC-REGISTER-2022-WARD-GAZETTE',dataset_id:ds.dataset_id,agency_id:agency,methodology_url:'data/sprint2/README.md',start_period:'2022 registered voters',end_period:'2022 registered voters',latest_observation_id:'',observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''};
      series.push(s); seriesByCode.set(scode,s);
    }
    const oid=uuid(`observation:${scode}:2022-06-20`);
    if(!obsIds.has(oid)){
      observations.push({observation_id:oid,series_id:s.series_id,geography_id:ward.geography_id,boundary_version:'2012-01',period_start:'2022-06-20',period_end:'2022-06-20',period_type:'point_in_time',period_label:'2022 registered voters',value:row.voters,geographic_method:method,statistical_status:'final',source_class:'official',badge:crossed?'B':'A',source_release_id:rel.release_id,source_dataset_id:ds.dataset_id,source_table:'First Schedule — Registered Voters per County Assembly Ward',source_sheet:'',source_page:firstSchedulePage(row.ward_code),source_row_label:row.ward_name,source_url:IEBC_URL,published_at:'2022-06-21',ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${scode}:2022-06-20:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:crosswalkId,notes:crossed?`B — Official derived geography attachment. Official IEBC CAW ${row.ward_code} ${row.ward_name} deterministically crosswalked to ${ward.geo_code} ${ward.name}; method ${match}. The voter value itself is unchanged; no parent value inherited.`:`A — Official direct. Official IEBC CAW ${row.ward_code} ${row.ward_name} matches canonical ${ward.geo_code} ${ward.name}. No parent value inherited.`});
      obsIds.add(oid);
    }
    s.latest_observation_id=oid;
  }
  await writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n');
  await writeFile(path.join(root,`${dir}/series.csv`),csv(series,unionFields(series)));
  await writeFile(path.join(root,`${dir}/observations.csv`),csv(observations,unionFields(observations)));
  console.log(`P23X_WARD_VOTERS_INDICATORS_OK published=${resolved.length} direct=${resolved.length-crosswalkCount} crosswalked=${crosswalkCount} held=${held.length}`);
}
