#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const json = p => JSON.parse(read(p));
const exists = p => fs.existsSync(path.join(root,p));
const assert = (condition, message) => { if (!condition) throw new Error(`P15 distribution validation: ${message}`); };
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const ndjsonCount = p => read(p).trim() ? read(p).trimEnd().split('\n').length : 0;

try {
  const pkg=json('package.json');
  const manifest=json('data/distribution/manifest.json');
  const indicators=json('data/indicators/registry/indicators.json');
  const series=json('data/indicators/registry/series.json');
  const observations=json('data/indicators/registry/observations.json');
  const geographies=json('data/geography/registry/geographies.json');
  const datasets=json('data/catalogue/registry/datasets.json');
  const results=json('data/results/county-results.json');
  const evidence=json('data/evidence/county-documents.json');
  const evidenceRows=(evidence.counties||[]).flatMap(c=>c.documents||[]);

  assert(manifest.schema_version==='kda.distribution-manifest.v1','unexpected manifest schema');
  assert(manifest.application_version===pkg.version,'manifest application version must match package');
  assert(manifest.data_contract_version==='1.0.0','P15 contract version must be 1.0.0');
  assert(manifest.counts.indicators===indicators.length,'indicator count mismatch');
  assert(manifest.counts.series===series.length,'series count mismatch');
  assert(manifest.counts.observations===observations.length,'observation count mismatch');
  assert(manifest.counts.geographies===geographies.length,'geography count mismatch');
  assert(manifest.counts.datasets===datasets.length,'dataset count mismatch');
  assert(manifest.counts.public_county_results===(results.counties||[]).length,'county results count mismatch');
  assert(manifest.counts.evidence_records===evidenceRows.length,'evidence count mismatch');
  assert(manifest.counts.counties===47,'county distribution must cover 47 counties');

  const expectedNdjson={
    units:json('data/indicators/registry/units.json').length,
    indicators:indicators.length,series:series.length,observations:observations.length,geographies:geographies.length,
    agencies:json('data/catalogue/registry/agencies.json').length,sources:json('data/catalogue/registry/sources.json').length,
    datasets:datasets.length,releases:json('data/catalogue/registry/releases.json').length,
    'county-results':(results.counties||[]).length,'evidence-records':evidenceRows.length
  };
  for(const [name,count] of Object.entries(expectedNdjson)){
    const p=`data/distribution/ndjson/${name}.ndjson`;
    assert(exists(p),`missing ${p}`);
    assert(ndjsonCount(p)===count,`${name} NDJSON row count ${ndjsonCount(p)} != ${count}`);
  }
  console.log(`P15_NDJSON_OK products=${Object.keys(expectedNdjson).length}`);

  const schemaNames=['indicator','series','observation','geography','dataset','county-result','evidence-record'];
  for(const name of schemaNames){
    const p=`data/distribution/schemas/${name}.schema.json`;
    assert(exists(p),`missing schema ${p}`);
    const schema=json(p);
    assert(schema.$schema==='https://json-schema.org/draft/2020-12/schema',`${name} schema must use draft 2020-12`);
    assert(schema['x-kda-contract-version']==='1.0.0',`${name} schema contract version mismatch`);
    assert(Array.isArray(schema.required)&&schema.required.length>=4,`${name} schema requires a meaningful required set`);
  }
  console.log(`P15_JSON_SCHEMAS_OK count=${schemaNames.length}`);

  const countyIndex=json('data/distribution/subsets/counties/index.json');
  assert(countyIndex.length===47,`county subset index must contain 47 records, found ${countyIndex.length}`);
  assert(new Set(countyIndex.map(x=>x.geo_code)).size===47,'county subset geo_codes must be unique');
  for(const row of countyIndex){
    assert(exists(row.path),`missing county subset ${row.path}`);
    const payload=json(row.path);
    assert(payload.schema_version==='kda.county-subset.v1',`${row.geo_code} county subset schema mismatch`);
    assert(payload.geography?.geo_code===row.geo_code,`${row.geo_code} geography mismatch`);
    assert(payload.county_result?.geo_code===row.geo_code,`${row.geo_code} missing public county result`);
    assert(payload.series.every(s=>s.geo_code===row.geo_code),`${row.geo_code} subset contains foreign series`);
    assert(payload.observations.every(o=>o.geo_code===row.geo_code),`${row.geo_code} subset contains foreign observations`);
    assert(payload.evidence.every(e=>e.geo_code===row.geo_code),`${row.geo_code} subset contains foreign evidence`);
  }
  console.log('P15_COUNTY_SUBSETS_OK count=47');

  const indicatorIndex=json('data/distribution/subsets/indicators/index.json');
  assert(indicatorIndex.length===indicators.length,`indicator subset index must contain ${indicators.length} records`);
  assert(new Set(indicatorIndex.map(x=>x.indicator_code)).size===indicators.length,'indicator subset codes must be unique');
  for(const row of indicatorIndex){
    assert(exists(row.path),`missing indicator subset ${row.path}`);
    const payload=json(row.path);
    assert(payload.schema_version==='kda.indicator-subset.v1',`${row.indicator_code} subset schema mismatch`);
    assert(payload.indicator?.indicator_code===row.indicator_code,`${row.indicator_code} payload mismatch`);
    assert(payload.series.every(s=>s.indicator_code===row.indicator_code),`${row.indicator_code} subset contains foreign series`);
    assert(payload.observations.every(o=>o.indicator_code===row.indicator_code),`${row.indicator_code} subset contains foreign observations`);
  }
  console.log(`P15_INDICATOR_SUBSETS_OK count=${indicatorIndex.length}`);

  for(const product of manifest.products||[]){
    for(const format of Object.values(product.formats||{})){
      assert(exists(format.path),`manifest path missing ${format.path}`);
      assert(fs.statSync(path.join(root,format.path)).size===format.bytes,`byte count drift for ${format.path}`);
      assert(sha(format.path)===format.sha256,`manifest checksum drift for ${format.path}`);
    }
    if(product.schema)assert(exists(product.schema),`product schema missing ${product.schema}`);
  }
  const checksumLines=read('data/distribution/checksums.sha256').trim().split('\n').filter(Boolean);
  assert(checksumLines.length>=manifest.products.length+47+indicators.length,'checksum file is unexpectedly small');
  for(const line of checksumLines){
    const match=line.match(/^([a-f0-9]{64})  (.+)$/);
    assert(match,`invalid checksum line ${line}`);
    assert(exists(match[2]),`checksum target missing ${match[2]}`);
    assert(sha(match[2])===match[1],`checksum mismatch ${match[2]}`);
  }
  console.log(`P15_CHECKSUMS_OK files=${checksumLines.length}`);

  assert(manifest.format_availability?.json?.status==='published','JSON must be published');
  assert(manifest.format_availability?.csv?.status==='published','CSV must be published');
  assert(manifest.format_availability?.ndjson?.status==='published','NDJSON must be published');
  assert(manifest.format_availability?.parquet?.status==='not_committed','Parquet decision must be explicit rather than silently absent');
  assert((manifest.format_availability.parquet.note||'').toLowerCase().includes('deterministic'),'Parquet omission must explain reproducibility trade-off');

  const developer=read('docs/DEVELOPER.md');
  for(const token of ['data/distribution/manifest.json','subsets/counties/KEN-C032.json','subsets/indicators/IND-POPULATION.json','Parquet','pin a Git commit'])assert(developer.includes(token),`developer guide missing ${token}`);
  assert(exists('LICENSE'),'top-level software license missing');
  assert(exists('DATA-NOTICE.md'),'data rights notice missing');
  assert(exists('CITATION.cff'),'citation metadata missing');
  const readme=read('README.md');
  assert(!readme.includes('Kenya Data Atlas — static MVP'),'README still identifies the current product as the retired static MVP');
  for(const token of ['98 indicators','3,370 series','6,864 observations','Rankings & Insights','Data distribution'])assert(readme.includes(token),`README missing current product marker ${token}`);

  const packageScripts=pkg.scripts||{};
  assert(packageScripts['distribution:build']==='node scripts/distribution/build-distribution.mjs','distribution:build script not wired');
  assert(packageScripts['distribution:validate']==='node scripts/distribution/validate-distribution.mjs','distribution:validate script not wired');
  assert((packageScripts['build:data']||'').includes('distribution:build'),'build:data must publish distribution');
  assert((packageScripts.test||'').includes('distribution:validate'),'npm test must validate distribution');
  console.log('P15_DEVELOPER_SURFACE_OK');

  const roadmap=json('data/project-roadmap.json');
  const p14=roadmap.phases.find(p=>p.id==='P14');
  const p15=roadmap.phases.find(p=>p.id==='P15');
  const p16=roadmap.phases.find(p=>p.id==='P16');
  assert(p14?.status==='deferred','P14 must be explicitly deferred rather than silently skipped');
  assert(p15?.status==='complete','P15 must be complete');
  assert(p16?.status==='next','P16 must be the next v1.0 phase');
  console.log('P15_ROADMAP_HANDOFF_OK next=P16 deferred=P14');
  console.log(`P15_DATA_DISTRIBUTION_ALL_OK version=${pkg.version} contract=${manifest.data_contract_version}`);
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
