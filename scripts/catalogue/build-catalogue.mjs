import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seedDir = path.join(root, 'data/catalogue/seed');
const outputDir = path.join(root, 'data/catalogue/registry');
const NAMESPACE = '31fba565-7aad-4a61-8617-67db0156145d';
const readJson = async file => JSON.parse(await readFile(path.join(seedDir, file), 'utf8'));
const uuid = name => {
  const ns = Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0,16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const sha256 = async file => createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
const csvCell = value => `"${(Array.isArray(value) ? value.join('|') : String(value ?? '')).replaceAll('"','""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(f => csvCell(row[f])).join(','))].join('\n') + '\n';

const agencySeed = await readJson('agencies.json');
const sourceSeed = await readJson('sources.json');
const datasetSeed = await readJson('datasets.json');
const agencies = agencySeed.map(a => ({ agency_id: uuid(`agency:${a.code}`), agency_code: a.code, name: a.name, abbreviation: a.abbreviation, agency_type: a.agency_type, official_url: a.official_url, jurisdiction: a.jurisdiction, description: a.description, active: true }));
const agencyByCode = new Map(agencies.map(a => [a.agency_code,a]));
const sources = sourceSeed.map(s => ({ source_id: uuid(`source:${s.code}`), source_code: s.code, agency_id: agencyByCode.get(s.agency_code)?.agency_id, ...Object.fromEntries(Object.entries(s).filter(([k]) => !['code','agency_code'].includes(k))), active: true }));
const sourceByCode = new Map(sources.map(s => [s.source_code,s]));
const datasets = datasetSeed.map(d => ({ dataset_id: uuid(`dataset:${d.code}`), dataset_code: d.code, source_id: sourceByCode.get(d.source_code)?.source_id, ...Object.fromEntries(Object.entries(d).filter(([k]) => !['code','source_code'].includes(k))) }));
const datasetByCode = new Map(datasets.map(d => [d.dataset_code,d]));

const releaseSeed = [
  { code:'REL-KENYA-LAW-LN14-CURRENT', dataset:'DS-KENYA-LAW-LN14', title:'Legal Notice 14 of 2012 — current Kenya Law version', discovered_at:'2026-08-26T00:00:00Z', url:'https://new.kenyalaw.org/akn/ke/act/ln/2012/14/eng@2022-12-31', status:'approved', version:'eng@2022-12-31', notes:'Controlling legal reference. Original document linked, not redistributed in this repository.' },
  { code:'REL-LN14-TRANSCRIPTION-PKIAGE', dataset:'DS-COMMUNITY-GEO', title:'CSV transcription of counties, constituencies and wards', discovered_at:'2026-08-26T00:00:00Z', url:'https://github.com/pkiage/data-Kenya-Counties-Constituencies-Wards/blob/main/csv-Kenya-Counties-Constituencies-Wards.csv', status:'evaluation', version:'git-blob-7d0a741', notes:'Canonical Phase 1 seed; 1,450 ward rows; spellings remain provisional.' },
  { code:'REL-TIGAWANNA-GEO-32580EB', dataset:'DS-COMMUNITY-GEO', title:'HDX-derived geography extract', discovered_at:'2026-08-26T00:00:00Z', url:'https://github.com/tigawanna/kenya_wards_geojson_data/tree/32580eb19fba05bb6421257331e63ef3f8a5dc8e', status:'evaluation', version:'32580eb19fba05bb6421257331e63ef3f8a5dc8e', notes:'Rejected as canonical ward seed: contains 1,439 tabular ward rows.' },
  { code:'REL-OSM-KENYA-2DD4D71', dataset:'DS-COMMUNITY-GEO', title:'OSM Kenya Boundaries package', discovered_at:'2026-08-26T00:00:00Z', url:'https://github.com/its-kios09/osm-kenya-boundaries/tree/2dd4d71038b52d824cba304561b86ba79cf4315e', status:'evaluation', version:'2dd4d71038b52d824cba304561b86ba79cf4315e', notes:'Rejected as canonical ward seed: contains 1,448 ward rows.' }
];
const releases = releaseSeed.map(r => ({ release_id:uuid(`release:${r.code}`), release_code:r.code, dataset_id:datasetByCode.get(r.dataset).dataset_id, title:r.title, reference_period_start:'', reference_period_end:'', published_at:'', discovered_at:r.discovered_at, ingested_at:r.status === 'evaluation' ? '2026-08-26T00:00:00Z' : '', release_url:r.url, release_status:r.status, version_label:r.version, release_notes:r.notes, supersedes_release_id:'' }));
const releaseByCode = new Map(releases.map(r => [r.release_code,r]));
const fileSeed = [
  {release:'REL-KENYA-LAW-LN14-CURRENT',url:'https://new.kenyalaw.org/akn/ke/act/ln/2012/14/eng@2022-12-31',name:'Legal Notice 14 of 2012',path:'',mime:'text/html',git:'',licence:'Public legal reference',status:'referenced_not_archived',notes:'Use the Kenya Law landing page and PDF as controlling evidence.'},
  {release:'REL-LN14-TRANSCRIPTION-PKIAGE',url:'https://github.com/pkiage/data-Kenya-Counties-Constituencies-Wards/blob/main/csv-Kenya-Counties-Constituencies-Wards.csv',name:'geographies.csv',path:'data/geography/source/legal-order-transcription/geographies.csv',mime:'text/csv',git:'7d0a741b702efe85a88881a9b14a2976ac9dbde2',licence:'Public-data transcription; attribution retained',status:'validated_for_registry_seed',notes:'Exactly 1,450 ward rows.'},
  ...['counties.json','constituencies.json','wards.json'].map((name,i)=>({release:'REL-TIGAWANNA-GEO-32580EB',url:`https://github.com/tigawanna/kenya_wards_geojson_data/blob/32580eb19fba05bb6421257331e63ef3f8a5dc8e/src/data/${i===0?'counties':i===1?'constituencies':'wards'}/${name}`,name,path:`data/geography/source/community-extract/${name}`,mime:'application/json',git:['93b61845cd57dbc9b130fcfe1a9aa4bdd1b226c2','83c73a9b2e2778efd2878c0537c81ae5a5728d02','86b6d057d987f6e04f46ffa64797c699c5bb0cf1'][i],licence:'MIT',status:'retained_for_cross_check',notes:i===2?'Contains 1,439 wards; rejected as canonical seed.':''})),
  ...['counties.ts','constituencies.ts','wards.ts'].map((name,i)=>({release:'REL-OSM-KENYA-2DD4D71',url:`https://github.com/its-kios09/osm-kenya-boundaries/blob/2dd4d71038b52d824cba304561b86ba79cf4315e/src/data/${name}`,name,path:`data/geography/source/osm-package/${name}`,mime:'text/typescript',git:['52713cdb31b713504a7d6b794eb78e2d5adb4fe0','f31168da86fc0f0b886703db9ff8da57cc85015e','fa9a1d5b443a257847e3d0595a3b8a9478e98f28'][i],licence:'MIT',status:'retained_for_cross_check',notes:i===2?'Contains 1,448 wards; rejected as canonical seed.':''}))
];
const sourceFiles=[];
for (const f of fileSeed) {
  let bytes='', hash='';
  if (f.path) { bytes=(await stat(path.join(root,f.path))).size; hash=await sha256(f.path); }
  sourceFiles.push({ source_file_id:uuid(`source-file:${f.release}:${f.name}`), release_id:releaseByCode.get(f.release).release_id, original_url:f.url, original_filename:f.name, archived_path:f.path, retrieved_at:f.path?'2026-08-26T00:00:00Z':'', mime_type:f.mime, byte_size:bytes, sha256:hash, git_blob_sha:f.git, licence_name:f.licence, extraction_status:f.status, source_table:'', source_sheet:'', source_page:'', notes:f.notes });
}
const edges=[];
const addEdge=(fromType,fromId,toType,toId,relationship)=>edges.push({lineage_edge_id:uuid(`edge:${fromType}:${fromId}:${toType}:${toId}:${relationship}`),from_entity_type:fromType,from_entity_id:fromId,to_entity_type:toType,to_entity_id:toId,relationship,transformation_version:'',notes:''});
for(const source of sources)addEdge('agency',source.agency_id,'source',source.source_id,'publishes');
for(const dataset of datasets)addEdge('source',dataset.source_id,'dataset',dataset.dataset_id,'contains');
for(const release of releases)addEdge('dataset',release.dataset_id,'release',release.release_id,'released_as');
for(const file of sourceFiles)addEdge('release',file.release_id,'source_file',file.source_file_id,'represented_by');

await mkdir(outputDir,{recursive:true});
const collections={agencies,sources,datasets,releases,'source-files':sourceFiles,lineage:edges};
for(const [name,rows] of Object.entries(collections)) await writeFile(path.join(outputDir,`${name}.json`),JSON.stringify(rows,null,2)+'\n');
await writeFile(path.join(outputDir,'agencies.csv'),csv(agencies,['agency_id','agency_code','name','abbreviation','agency_type','official_url','jurisdiction','active']));
await writeFile(path.join(outputDir,'sources.csv'),csv(sources,['source_id','source_code','agency_id','name','source_type','landing_page_url','expected_cadence','source_priority','reuse_status','assessment_status','assessment_note','active']));
await writeFile(path.join(outputDir,'datasets.csv'),csv(datasets,['dataset_id','dataset_code','source_id','title','topic','geographic_coverage','frequency','publication_status','known_limitations']));
await writeFile(path.join(outputDir,'releases.csv'),csv(releases,['release_id','release_code','dataset_id','title','discovered_at','ingested_at','release_url','release_status','version_label','release_notes']));
await writeFile(path.join(outputDir,'source-files.csv'),csv(sourceFiles,['source_file_id','release_id','original_url','original_filename','archived_path','retrieved_at','mime_type','byte_size','sha256','git_blob_sha','licence_name','extraction_status','notes']));
console.log(JSON.stringify({agencies:agencies.length,sources:sources.length,datasets:datasets.length,releases:releases.length,source_files:sourceFiles.length,lineage_edges:edges.length},null,2));

