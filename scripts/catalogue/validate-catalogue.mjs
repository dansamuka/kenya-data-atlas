import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=async name=>JSON.parse(await readFile(path.join(root,'data/catalogue/registry',`${name}.json`),'utf8'));
const agencies=await read('agencies'),sources=await read('sources'),datasets=await read('datasets'),releases=await read('releases'),files=await read('source-files'),edges=await read('lineage');
const errors=[];
const unique=(rows,key,label)=>{const values=rows.map(x=>x[key]);if(new Set(values).size!==values.length)errors.push(`duplicate ${label}`);return new Set(values)};
const agencyIds=unique(agencies,'agency_id','agency id'),sourceIds=unique(sources,'source_id','source id'),datasetIds=unique(datasets,'dataset_id','dataset id'),releaseIds=unique(releases,'release_id','release id'),fileIds=unique(files,'source_file_id','source file id');
unique(agencies,'agency_code','agency code');unique(sources,'source_code','source code');unique(datasets,'dataset_code','dataset code');unique(releases,'release_code','release code');
for(const a of agencies)if(!a.name||!a.official_url||!a.agency_type)errors.push(`${a.agency_code}: incomplete agency`);
for(const s of sources){if(!agencyIds.has(s.agency_id))errors.push(`${s.source_code}: orphan agency`);if(!s.landing_page_url||!s.reuse_status||!s.assessment_status)errors.push(`${s.source_code}: incomplete assessment`)}
for(const d of datasets){if(!sourceIds.has(d.source_id))errors.push(`${d.dataset_code}: orphan source`);if(!d.description||!d.topic||!d.geographic_coverage.length||!d.publication_status)errors.push(`${d.dataset_code}: incomplete metadata`)}
for(const r of releases){if(!datasetIds.has(r.dataset_id))errors.push(`${r.release_code}: orphan dataset`);if(!r.release_url||!r.discovered_at||!r.release_status)errors.push(`${r.release_code}: incomplete release`)}
for(const f of files){if(!releaseIds.has(f.release_id))errors.push(`${f.original_filename}: orphan release`);if(f.archived_path&&(!f.sha256||!/^[0-9a-f]{64}$/.test(f.sha256)||!f.byte_size))errors.push(`${f.original_filename}: invalid archive fingerprint`)}
const allIds=new Set([...agencyIds,...sourceIds,...datasetIds,...releaseIds,...fileIds]);for(const e of edges)if(!allIds.has(e.from_entity_id)||!allIds.has(e.to_entity_id))errors.push(`${e.lineage_edge_id}: broken lineage`);
if(!datasets.some(d=>d.dataset_code==='DS-IEBC-GEOGRAPHY'))errors.push('electoral geography dataset missing');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`PASS: ${agencies.length} agencies, ${sources.length} sources, ${datasets.length} datasets, ${releases.length} releases, ${files.length} source files and ${edges.length} lineage edges; all required metadata and relationships valid.`);

