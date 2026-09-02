import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const CONTRACT_PATH='data/p23/constituency-turnout-promotion-contract.json';
const CONTRACT=JSON.parse(await readFile(path.join(root,CONTRACT_PATH),'utf8'));
const ARC_ITEM_URL=`https://www.arcgis.com/sharing/rest/content/items/${CONTRACT.source_transcription.item_id}?f=json`;
const ARC_QUERY=`${CONTRACT.source_transcription.feature_layer_url}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=2000&f=json`;
const INGESTED_AT='2026-09-02T15:09:38.000Z';
const ITEM_URL=CONTRACT.source_transcription.item_url;
const IEBC_FORM_PORTAL=CONTRACT.official_form_portal.url;
const IEBC_VOTER_PDF=CONTRACT.official_registered_voter_source.official_document_url;
const VOTER_SOURCE=CONTRACT.official_registered_voter_source.pinned_extraction_url;
const mode=process.argv[2];
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 constituency turnout: ${msg}`);};
assert(['catalogue','indicators'].includes(mode),'usage: build-constituency-turnout.mjs <catalogue|indicators>');
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const uuid=name=>{const h=createHash('sha1').update(`kenya-data-atlas:p23-turnout:${name}`).digest('hex').slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`;};
const csvCell=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;
const unionFields=rows=>[...new Set(rows.flatMap(r=>Object.keys(r)))];
const csv=(rows,fields)=>[fields.join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';
const norm=v=>String(v||'').toUpperCase().replace(/&/g,' AND ').replace(/[’'`./,_()\-]+/g,' ').replace(/\s+/g,' ').trim();
const aliases=new Map(Object.entries(CONTRACT.geography_attachment.explicit_aliases));
const selectedFields=['Constituency','ADM2_EN','ADM2_PCODE','County_Name','Registered__Voters','Raila','Ruto','Mwaure','Wajackoyah','Our_Total__By_adding_up_','IEBC_Total__As_per_Forms_','Rejected_votes','Turnout'];
const get=async url=>{const r=await fetch(url,{headers:{'User-Agent':'Kenya-Data-Atlas-P23'}});assert(r.ok,`fetch failed ${r.status} ${url}`);return r;};
const requireInt=(v,label)=>{assert(v!==null&&v!==undefined&&String(v).trim()!=='',`${label} missing`);const n=Number(v);assert(Number.isInteger(n)&&n>=0,`${label} invalid (${v})`);return n;};

async function fetchSourceRows(){
  const item=await (await get(ARC_ITEM_URL)).json();
  assert(!item.error,`ArcGIS item error ${JSON.stringify(item.error)}`);
  assert(Number(item.modified)===Number(CONTRACT.source_transcription.item_modified_epoch_ms),`ArcGIS item modified timestamp changed (${item.modified})`);
  const arc=await (await get(ARC_QUERY)).json();
  assert(!arc.error,`ArcGIS layer error ${JSON.stringify(arc.error)}`);
  const features=arc.features||[];
  assert(features.length===CONTRACT.publication_gate.required_source_rows,`expected ${CONTRACT.publication_gate.required_source_rows} source rows, found ${features.length}`);
  const normalized=features.map(f=>Object.fromEntries(selectedFields.map(k=>[k,(f.attributes||{})[k]??null]))).sort((a,b)=>String(a.Constituency||'').localeCompare(String(b.Constituency||'')));
  const sha=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  assert(sha===CONTRACT.source_transcription.normalized_rows_sha256,`normalized source hash changed (${sha})`);
  return features.map(f=>f.attributes||{});
}

async function officialVoters(){
  const text=await (await get(VOTER_SOURCE)).text();
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);const header=lines.shift();
  assert(header?.includes('Registered Voters'),'official voter extraction header changed');
  assert(lines.length===CONTRACT.official_registered_voter_source.expected_ward_rows,`official ward-row count changed (${lines.length})`);
  const totals=new Map();
  for(const [i,line] of lines.entries()){
    const c=line.split(',');assert(c.length>=8,`official voter row ${i+2} malformed`);
    const code=Number(c[3]),voters=Number(c[7]);
    assert(Number.isInteger(code)&&code>=1&&code<=290,`official voter code invalid at row ${i+2}`);
    assert(Number.isInteger(voters)&&voters>0,`official voter value invalid at row ${i+2}`);
    totals.set(code,(totals.get(code)||0)+voters);
  }
  assert(totals.size===CONTRACT.official_registered_voter_source.expected_constituencies,`official constituency count changed (${totals.size})`);
  assert([...totals.values()].reduce((a,b)=>a+b,0)===CONTRACT.official_registered_voter_source.expected_national_registered_voters,'official national registered-voter total changed');
  return totals;
}

async function reconcile(){
  const [attrs,geos,voters]=await Promise.all([fetchSourceRows(),readJson('data/geography/registry/geographies.json'),officialVoters()]);
  const cons=geos.filter(g=>g.level==='constituency');assert(cons.length===290,'canonical constituency registry != 290');
  const byName=new Map(cons.map(g=>[norm(g.name),g]));
  const rows=[];
  for(const a of attrs){
    const sourceName=String(a.Constituency||'').trim();
    const sourceKey=norm(sourceName);const canonicalKey=aliases.get(sourceKey)||sourceKey;const geo=byName.get(canonicalKey);
    assert(geo,`unmatched source constituency ${sourceName}`);
    const code=Number(geo.constituency_code);const officialRegistered=voters.get(code);const sourceRegistered=requireInt(a.Registered__Voters,`${code} registered`);
    const raila=requireInt(a.Raila,`${code} Raila`),ruto=requireInt(a.Ruto,`${code} Ruto`),mwaure=requireInt(a.Mwaure,`${code} Mwaure`),wajackoyah=requireInt(a.Wajackoyah,`${code} Wajackoyah`);
    const candidateTotal=raila+ruto+mwaure+wajackoyah;const citizenTotal=requireInt(a.Our_Total__By_adding_up_,`${code} citizen total`);const iebcTotal=requireInt(a.IEBC_Total__As_per_Forms_,`${code} IEBC total`);
    assert(candidateTotal===citizenTotal,`${code} candidate sum ${candidateTotal} != transcription arithmetic ${citizenTotal}`);
    const rejectedMissing=a.Rejected_votes===null||a.Rejected_votes===undefined||String(a.Rejected_votes).trim()==='';
    const rejected=rejectedMissing?null:requireInt(a.Rejected_votes,`${code} rejected`);
    const holdReasons=[];
    if(sourceRegistered!==officialRegistered)holdReasons.push('registered_voter_mismatch');
    if(candidateTotal!==iebcTotal)holdReasons.push('valid_vote_total_mismatch');
    if(rejectedMissing)holdReasons.push('missing_rejected_ballots');
    else if(candidateTotal+rejected>officialRegistered)holdReasons.push('votes_cast_exceeds_official_registered_voters');
    const pcode=String(a.ADM2_PCODE||'');const pm=pcode.match(/(\d{3})$/);const boundaryCode=pm?Number(pm[1]):null;
    rows.push({code,geo,sourceName,source_pcode:pcode,source_boundary_code:boundaryCode,attachment_method:sourceKey===canonicalKey?'exact_name':'explicit_alias',source_registered_voters:sourceRegistered,official_registered_voters:officialRegistered,candidate_valid_votes:candidateTotal,transcribed_iebc_valid_votes:iebcTotal,rejected_ballots:rejected,hold_reasons:holdReasons,turnout_pct:holdReasons.length?null:Number((((candidateTotal+rejected)/officialRegistered)*100).toFixed(2))});
  }
  rows.sort((a,b)=>a.code-b.code);assert(rows.length===290&&new Set(rows.map(r=>r.code)).size===290,'canonical source attachment must cover 290 unique constituencies');
  const holds=rows.filter(r=>r.hold_reasons.length);const publishable=rows.filter(r=>!r.hold_reasons.length);const expectedHolds=CONTRACT.direct_form34b_hold_constituency_codes;
  assert(publishable.length===CONTRACT.publication_gate.required_publishable_rows,`publishable rows ${publishable.length} != contract ${CONTRACT.publication_gate.required_publishable_rows}`);
  assert(holds.length===CONTRACT.publication_gate.required_direct_form34b_holds,`hold rows ${holds.length} != contract ${CONTRACT.publication_gate.required_direct_form34b_holds}`);
  assert(JSON.stringify(holds.map(r=>r.code))===JSON.stringify(expectedHolds),'direct Form 34B hold set diverged from contract');
  return {rows,publishable,holds};
}

if(mode==='catalogue'){
  const dir='data/catalogue/registry';
  const [agencies,sources,datasets,releases]=await Promise.all([readJson(`${dir}/agencies.json`),readJson(`${dir}/sources.json`),readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`)]);
  const agencyCode='MAPSBYSIFA';let agency=agencies.find(a=>a.agency_code===agencyCode);
  if(!agency){agency={agency_id:uuid(`agency:${agencyCode}`),agency_code:agencyCode,name:'MapsBySifa',abbreviation:'MapsBySifa',agency_type:'external_public_data_publisher',official_url:ITEM_URL,jurisdiction:'Kenya',description:'Public ArcGIS publisher of a constituency-level transcription of Kenya 2022 presidential Form 34B results. Not an official electoral authority.',active:true};agencies.push(agency);}
  const sourceCode='MAPSBYSIFA-IEBC-2022-TURNOUT';let source=sources.find(s=>s.source_code===sourceCode);
  if(!source){source={source_id:uuid(`source:${sourceCode}`),source_code:sourceCode,agency_id:agency.agency_id,name:'Kenya 2022 constituency presidential results public transcription',source_type:'feature_service',landing_page_url:ITEM_URL,expected_cadence:'one_off',source_priority:'supplementary',access_method:'arcgis_feature_service',reuse_status:'public_external_transcription',licence_name:null,licence_url:null,attribution_text:'Source transcription: MapsBySifa; official denominator and Form 34B authority: IEBC.',assessment_status:'in_review',assessment_note:'Only rows passing the governed P23 reconciliation contract may publish. Direct official Form 34B evidence supersedes this transcription.',active:true};sources.push(source);}
  const datasetCode='DS-MAPSBYSIFA-IEBC-TURNOUT-CONSTITUENCY-2022-P23';let ds=datasets.find(d=>d.dataset_code===datasetCode);
  if(!ds){ds={dataset_id:uuid(`dataset:${datasetCode}`),dataset_code:datasetCode,source_id:source.source_id,title:'Presidential turnout — 2022 constituency reconciled transcription',description:'Constituency-level 2022 presidential turnout derived only for transcription rows that reconcile to the official IEBC registered-voter schedule, reconcile all four candidate votes to the transcription valid-vote total, and carry an explicit rejected-ballot value.',topic:'Elections',geographic_coverage:['constituency'],frequency:'electoral_cycle',publication_status:'published',methodology_url:CONTRACT_PATH,known_limitations:`External transcription, not direct IEBC extraction. ${CONTRACT.publication_gate.required_direct_form34b_holds} constituencies are deliberately withheld pending direct Form 34B verification. No parent values or fuzzy geography matches are used.`};datasets.push(ds);}
  const releaseCode='REL-MAPSBYSIFA-IEBC-TURNOUT-CONSTITUENCY-2022-P23';
  if(!releases.some(r=>r.release_code===releaseCode))releases.push({release_id:uuid(`release:${releaseCode}`),release_code:releaseCode,dataset_id:ds.dataset_id,title:'2022 presidential constituency turnout — reconciled P23 tranche',reference_period_start:'2022-08-09',reference_period_end:'2022-08-09',published_at:'2022-08-25',discovered_at:INGESTED_AT,ingested_at:INGESTED_AT,release_url:ITEM_URL,release_status:'published',version_label:'P23 reconciled external transcription',release_notes:`Only ${CONTRACT.publication_gate.required_publishable_rows} reconciled constituency rows publish; ${CONTRACT.publication_gate.required_direct_form34b_holds} rows remain direct-Form34B holds. IEBC remains authoritative.` ,supersedes_release_id:''});
  for(const [name,rows] of [['agencies',agencies],['sources',sources],['datasets',datasets],['releases',releases]]){await writeFile(path.join(root,`${dir}/${name}.json`),JSON.stringify(rows,null,2)+'\n');await writeFile(path.join(root,`${dir}/${name}.csv`),csv(rows,unionFields(rows)));}
  console.log(`P23 constituency turnout catalogue prepared publishable=${CONTRACT.publication_gate.required_publishable_rows} holds=${CONTRACT.publication_gate.required_direct_form34b_holds}.`);
}else{
  const {publishable}=await reconcile();
  const dir='data/indicators/registry';
  const [units,indicators,series,observations,datasets,releases,sources]=await Promise.all([readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),readJson('data/catalogue/registry/sources.json')]);
  const ind=indicators.find(i=>i.indicator_code===CONTRACT.indicator_code);assert(ind,'turnout indicator missing');const unit=units.find(u=>u.unit_id===ind.unit_id);assert(unit,'turnout unit missing');
  const ds=datasets.find(d=>d.dataset_code==='DS-MAPSBYSIFA-IEBC-TURNOUT-CONSTITUENCY-2022-P23');const rel=releases.find(r=>r.release_code==='REL-MAPSBYSIFA-IEBC-TURNOUT-CONSTITUENCY-2022-P23');assert(ds&&rel,'turnout catalogue objects missing');const agency=sources.find(s=>s.source_id===ds.source_id)?.agency_id||'';
  const seriesByCode=new Map(series.map(s=>[s.series_code,s]));const obsIds=new Set(observations.map(o=>o.observation_id));
  for(const r of publishable){
    const scode=`KDA-TURNOUT-CON-${String(r.code).padStart(3,'0')}-2022`;let s=seriesByCode.get(scode);
    if(!s){s={series_id:uuid(`series:${scode}`),series_code:scode,indicator_id:ind.indicator_id,geography_id:r.geo.geography_id,geography_taxonomy:r.geo.geography_system||'electoral',boundary_version:'2012-01',frequency:'electoral_cycle',period_type:'point_in_time',unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',geographic_method:'direct',comparability_group:'PRESIDENTIAL-TURNOUT-2022-RECONCILED-EXTERNAL',dataset_id:ds.dataset_id,agency_id:agency,methodology_url:CONTRACT_PATH,start_period:'2022-08-09',end_period:'2022-08-09',latest_observation_id:'',observation_count:1,last_updated_at:INGESTED_AT,next_expected_release:'',status:'active',superseded_by_series_id:''};series.push(s);seriesByCode.set(scode,s);}
    const oid=uuid(`observation:${scode}:2022-08-09`);if(!obsIds.has(oid)){observations.push({observation_id:oid,series_id:s.series_id,geography_id:r.geo.geography_id,boundary_version:'2012-01',period_start:'2022-08-09',period_end:'2022-08-09',period_type:'point_in_time',period_label:'2022 General Election presidential turnout',value:r.turnout_pct,geographic_method:'direct',statistical_status:'provisional',source_class:'external',badge:'E',source_release_id:rel.release_id,source_dataset_id:ds.dataset_id,source_table:'ConstituencyData_Source2 — reconciled external transcription',source_sheet:'',source_page:'',source_row_label:r.sourceName,source_url:ITEM_URL,published_at:'2022-08-25',ingested_at:INGESTED_AT,vintage_id:uuid(`vintage:${scode}:2022-08-09:1`),supersedes_observation_id:'',lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',crosswalk_id:'',notes:`E — External transcription, provisionally published only after P23 reconciliation. Official IEBC registered voters=${r.official_registered_voters}; reconciled candidate valid votes=${r.candidate_valid_votes}; rejected ballots=${r.rejected_ballots}; formula=(valid+rejected)/official registered voters. IEBC Form 34B portal is authoritative. No parent value inherited; no fuzzy geography matching. Source boundary pcode=${r.source_pcode||'n/a'}; attachment=${r.attachment_method}.`});obsIds.add(oid);}s.latest_observation_id=oid;s.observation_count=1;
  }
  await writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n');await writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n');await writeFile(path.join(root,`${dir}/series.csv`),csv(series,unionFields(series)));await writeFile(path.join(root,`${dir}/observations.csv`),csv(observations,unionFields(observations)));
  console.log(`P23 constituency turnout observations promoted: ${publishable.length}; holds=${CONTRACT.publication_gate.required_direct_form34b_holds}.`);
}
