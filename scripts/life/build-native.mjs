import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue','indicators'].includes(mode)) {
  console.error('Usage: node scripts/life/build-native.mjs <catalogue|indicators>');
  process.exit(2);
}
const INGESTED_AT = '2026-08-28T00:00:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root,p),'utf8'));
const readText = async p => readFile(path.join(root,p),'utf8');
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"','""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(r => Object.keys(r)))];
const csv = rows => {
  const fields=unionFields(rows);
  return [fields.join(','), ...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\n')+'\n';
};
const uuid = name => {
  const h=createHash('sha1').update(`kenya-data-atlas:life-v1:${name}`).digest('hex').slice(0,32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`;
};
function parseCsv(raw) {
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const parseLine=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;};
  const headers=parseLine(lines.shift()||'');
  return lines.filter(Boolean).map(line=>{const v=parseLine(line);return Object.fromEntries(headers.map((h,i)=>[h,v[i]??'']));});
}

const defs = [
  {
    metric:'IND-RENT-BURDEN', short:'RENT-BURDEN', dataset:'DS-KNBS-RENT-BURDEN-2024-LIFE', release:'REL-KNBS-RENT-BURDEN-2024-LIFE',
    sourceId:'aa098973-0098-52f1-8bdd-db7ef2b16fc5', name:'Rent as a share of household expenditure',
    shortName:'Rent burden', description:'Rent as a percentage of household expenditure by county, using the published total column.',
    topic:'Economy', subtopic:'Cost & affordability', tab:'economy', unit:'percent', frequency:'annual',
    group:'LIFE-RENT-BURDEN-KNBS-2024', title:'Rent burden by county — 2024',
    datasetDescription:'County total-column proportion of rent to household expenditure from KNBS Economic Survey 2025 Table 20.5.',
    sourceUrl:'https://www.knbs.or.ke/wp-content/uploads/2025/05/2025-Economic-Survey.pdf',
    limitation:'Rent-burden measure only; not a synthetic cost-of-living index or prediction of an individual household rent.'
  },
  {
    metric:'IND-HOUSING-OWNER-OCCUPIED', short:'OWNER-OCCUPIED', dataset:'DS-KNBS-HOUSING-TENURE-2021-LIFE', release:'REL-KNBS-HOUSING-TENURE-2021-LIFE',
    sourceId:'aa098973-0098-52f1-8bdd-db7ef2b16fc5', name:'Households owning their main dwelling',
    shortName:'Owner-occupied households', description:'Percentage of households that own their main dwelling unit.',
    topic:'Demography', subtopic:'Housing', tab:'people', unit:'percent', frequency:'irregular',
    group:'LIFE-HOUSING-OWNER-KNBS-2021', title:'Housing tenure by county — 2021',
    datasetDescription:'County household tenure status from the KNBS Kenya Time Use Survey 2021 Table 3.6b.',
    sourceUrl:'https://www.knbs.or.ke/wp-content/uploads/2024/06/Kenya-Time-Use-Survey-Report-2021.pdf',
    limitation:'Tenure status is not itself a measure of housing quality, affordability or household wealth.'
  },
  {
    metric:'IND-HEALTH-FACILITY-STOCK', short:'HEALTH-FACILITY-COUNT', dataset:'DS-MOH-FACILITY-CENSUS-2023-LIFE', release:'REL-MOH-FACILITY-CENSUS-2023-LIFE',
    sourceId:'9bc61625-170e-54e8-90c7-922455df162c', name:'Health facility count',
    shortName:'Health facilities', description:'Facilities targeted by the Kenya Health Facility Census from the KMHFL list as at 1 August 2023.',
    topic:'Health', subtopic:'Health access / supply', tab:'health', unit:'count', frequency:'irregular',
    group:'LIFE-MOH-FACILITY-STOCK-2023', title:'Kenya Health Facility Census target stock — 2023',
    datasetDescription:'County target-facility stock used for the 2023 Kenya Health Facility Census, based on the KMHFL list as at 1 August 2023.',
    sourceUrl:'https://repository.familyhealth.go.ke/xmlui/bitstream/handle/123456789/192/Kenya%20Health%20Facility%20Census%20Report%20September%202023.pdf?isAllowed=y&sequence=1',
    limitation:'Facility-stock/supply context only; does not measure travel time, service quality, capacity or personal access.'
  },
  {
    metric:'IND-SCHOOL-ATTENDANCE-RATE', short:'SCHOOL-ATTENDANCE', dataset:'DS-KNBS-SCHOOL-ATTENDANCE-2019-LIFE', release:'REL-KNBS-SCHOOL-ATTENDANCE-2019-LIFE',
    sourceId:'aa098973-0098-52f1-8bdd-db7ef2b16fc5', name:'Population age 3+ at school or learning institution',
    shortName:'School attendance, age 3+', description:'Percentage of population age 3 years and above recorded as at school or a learning institution.',
    topic:'Demography', subtopic:'Education', tab:'people', unit:'percent', frequency:'irregular',
    group:'LIFE-SCHOOL-ATTENDANCE-KPHC-2019', title:'School attendance status by county — 2019 census',
    datasetDescription:'County school-attendance status from Appendix 2.2 of the KNBS 2019 KPHC Analytical Report on Education and Training.',
    sourceUrl:'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Education-and-Training.pdf',
    limitation:'Attendance status, not learning quality or attainment. County age structure affects comparisons.'
  },
  {
    metric:'IND-LABOUR-FORCE-PARTICIPATION', short:'LFPR-15-64', dataset:'DS-KNBS-LFPR-2019-LIFE', release:'REL-KNBS-LFPR-2019-LIFE',
    sourceId:'aa098973-0098-52f1-8bdd-db7ef2b16fc5', name:'Labour-force participation rate, age 15–64',
    shortName:'Labour-force participation', description:'Total labour-force participation rate for population age 15–64 years.',
    topic:'Economy', subtopic:'Employment', tab:'economy', unit:'percent', frequency:'irregular',
    group:'LIFE-LFPR-KPHC-2019', title:'Labour-force participation by county — 2019 census',
    datasetDescription:'County total labour-force participation rate for ages 15–64 from KNBS 2019 KPHC Labour Force Table 3.19.',
    sourceUrl:'https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Labour-Force.pdf',
    limitation:'Labour-force participation is not unemployment, job quality, earnings or probability of finding work.'
  }
];
const defByMetric=new Map(defs.map(d=>[d.metric,d]));

async function buildCatalogue(){
  const dir='data/catalogue/registry';
  const [datasets,releases]=await Promise.all([readJson(`${dir}/datasets.json`),readJson(`${dir}/releases.json`)]);
  const datasetByCode=new Map(datasets.map(d=>[d.dataset_code,d]));
  const releaseByCode=new Map(releases.map(r=>[r.release_code,r]));
  const rows=parseCsv(await readText('data/life-elsewhere/county-life-metrics.csv'));
  for(const d of defs){
    if(!datasetByCode.has(d.dataset)){
      const ds={dataset_id:uuid(`dataset:${d.dataset}`),dataset_code:d.dataset,source_id:d.sourceId,title:d.title,
        description:d.datasetDescription,topic:d.subtopic,geographic_coverage:['county'],frequency:d.frequency,
        publication_status:'published',methodology_url:'data/life-elsewhere/README.md',known_limitations:d.limitation};
      datasets.push(ds);datasetByCode.set(d.dataset,ds);
    }
    if(!releaseByCode.has(d.release)){
      const own=rows.filter(r=>r.metric_code===d.metric);
      const start=own.map(r=>r.period_start).sort()[0], end=own.map(r=>r.period_end).sort().at(-1);
      const rel={release_id:uuid(`release:${d.release}`),release_code:d.release,dataset_id:datasetByCode.get(d.dataset).dataset_id,
        title:d.title,reference_period_start:start,reference_period_end:end,published_at:'',discovered_at:INGESTED_AT,
        ingested_at:INGESTED_AT,release_url:d.sourceUrl,release_status:'published',version_label:'County Life v1',
        release_notes:d.limitation,supersedes_release_id:''};
      releases.push(rel);releaseByCode.set(d.release,rel);
    }
  }
  await Promise.all([
    writeFile(path.join(root,`${dir}/datasets.json`),JSON.stringify(datasets,null,2)+'\n'),
    writeFile(path.join(root,`${dir}/datasets.csv`),csv(datasets)),
    writeFile(path.join(root,`${dir}/releases.json`),JSON.stringify(releases,null,2)+'\n'),
    writeFile(path.join(root,`${dir}/releases.csv`),csv(releases))
  ]);
  console.log(`County Life catalogue promoted: ${datasets.length} datasets, ${releases.length} releases.`);
}

async function buildIndicators(){
  const dir='data/indicators/registry';
  const [units,indicators,series,observations,geos,datasets,releases,sources,rows]=await Promise.all([
    readJson(`${dir}/units.json`),readJson(`${dir}/indicators.json`),readJson(`${dir}/series.json`),readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'),readJson('data/catalogue/registry/datasets.json'),readJson('data/catalogue/registry/releases.json'),
    readJson('data/catalogue/registry/sources.json'),readText('data/life-elsewhere/county-life-metrics.csv').then(parseCsv)
  ]);
  const unitByCode=new Map(units.map(u=>[u.code,u]));
  const indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
  const geoByCode=new Map(geos.map(g=>[g.geo_code,g]));
  const datasetByCode=new Map(datasets.map(d=>[d.dataset_code,d]));
  const releaseByCode=new Map(releases.map(r=>[r.release_code,r]));
  const sourceById=new Map(sources.map(s=>[s.source_id,s]));
  const seriesByCode=new Map(series.map(s=>[s.series_code,s]));
  const existingNatural=new Set(observations.map(o=>`${o.series_id}|${o.period_start}|${o.period_end}`));

  function activateIndicator(d){
    let i=indicatorByCode.get(d.metric);
    if(!i){
      const u=unitByCode.get(d.unit); if(!u) throw new Error(`${d.metric}: missing unit ${d.unit}`);
      i={indicator_id:uuid(`indicator:${d.metric}`),indicator_code:d.metric,name:d.name,short_name:d.shortName,description:d.description,
        topic:d.topic,subtopic:d.subtopic,unit_id:u.unit_id,higher_is_better:null,preferred_frequency:d.frequency,minimum_geo_level:'county',
        minimum_denominator:null,methodology_url:'data/life-elsewhere/README.md',comparable:true,active:true};
      indicators.push(i);indicatorByCode.set(d.metric,i);
    }
    Object.assign(i,{name:d.name,short_name:d.shortName,description:d.description,topic:d.topic,subtopic:d.subtopic,
      unit_id:unitByCode.get(d.unit).unit_id,higher_is_better:null,preferred_frequency:d.frequency,minimum_geo_level:'county',
      methodology_url:'data/life-elsewhere/README.md',comparable:true,active:true,lifecycle_status:'active',
      expected_source:d.sourceId==='9bc61625-170e-54e8-90c7-922455df162c'?'Ministry of Health':'Kenya National Bureau of Statistics',
      expected_source_url:d.sourceUrl,expected_availability_note:d.limitation,tab:d.tab,applies_to_levels:['county'],
      applies_to_geography_subset:'',requires_sampling_uncertainty:false,ranking_allowed:true});
    return i;
  }
  for(const d of defs) activateIndicator(d);

  for(const r of rows){
    const d=defByMetric.get(r.metric_code); if(!d) throw new Error(`Unknown life metric ${r.metric_code}`);
    const geo=geoByCode.get(r.geo_code); if(!geo||geo.level!=='county') throw new Error(`${r.metric_code}: unknown/non-county ${r.geo_code}`);
    const indicator=indicatorByCode.get(d.metric), unit=unitByCode.get(r.unit_code);
    const dataset=datasetByCode.get(d.dataset), release=releaseByCode.get(d.release);
    if(!unit||!dataset||!release) throw new Error(`${r.metric_code}: missing unit/dataset/release`);
    const source=sourceById.get(dataset.source_id); if(!source) throw new Error(`${r.metric_code}: missing catalogue source`);
    const seriesCode=`KDA-LIFE-${d.short}-${geo.geo_code}`;
    let s=seriesByCode.get(seriesCode);
    if(!s){
      s={series_id:uuid(`series:${seriesCode}`),series_code:seriesCode,indicator_id:indicator.indicator_id,geography_id:geo.geography_id,
        geography_taxonomy:geo.geography_system||'electoral',boundary_version:'2012-01',frequency:d.frequency,period_type:'period',
        unit_id:unit.unit_id,price_basis:'not_applicable',base_period:'',currency:'',seasonal_adjustment:'none',transformation:'level',
        geographic_method:'direct',comparability_group:d.group,dataset_id:dataset.dataset_id,agency_id:source.agency_id,
        methodology_url:'data/life-elsewhere/README.md',start_period:r.period_label,end_period:r.period_label,latest_observation_id:'',
        observation_count:0,status:'active',last_updated_at:INGESTED_AT};
      series.push(s);seriesByCode.set(seriesCode,s);
    }
    const natural=`${s.series_id}|${r.period_start}|${r.period_end}`;
    if(!existingNatural.has(natural)){
      const obsId=uuid(`observation:${seriesCode}:${r.period_start}:${r.period_end}`);
      const o={observation_id:obsId,series_id:s.series_id,geography_id:geo.geography_id,boundary_version:'2012-01',
        period_start:r.period_start,period_end:r.period_end,period_type:'period',period_label:r.period_label,value:Number(r.value),
        geographic_method:'direct',statistical_status:'final',source_class:'official',badge:'A',source_release_id:release.release_id,
        source_dataset_id:dataset.dataset_id,source_table:r.source_table||'',source_sheet:'',source_page:r.source_page||'',
        source_row_label:r.name,source_url:r.source_url,published_at:'',ingested_at:INGESTED_AT,
        vintage_id:uuid(`vintage:${seriesCode}:${r.period_start}:1`),supersedes_observation_id:'',
        lower_bound:null,upper_bound:null,confidence_level:null,standard_error:null,sample_size:null,suppression_reason:'',
        crosswalk_id:'',notes:r.notes};
      observations.push(o);existingNatural.add(natural);
    }
  }

  for(const d of defs){
    const i=indicatorByCode.get(d.metric);
    for(const s of series.filter(s=>s.indicator_id===i.indicator_id)){
      const own=observations.filter(o=>o.series_id===s.series_id).sort((a,b)=>a.period_start.localeCompare(b.period_start));
      if(!own.length) continue;
      s.start_period=own[0].period_label;s.end_period=own.at(-1).period_label;s.latest_observation_id=own.at(-1).observation_id;
      s.observation_count=own.length;s.last_updated_at=INGESTED_AT;
    }
  }
  await Promise.all([
    writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),
    writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),
    writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),
    writeFile(path.join(root,`${dir}/series.csv`),csv(series)),
    writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),
    writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))
  ]);
  console.log(`County Life indicators promoted: ${defs.length} indicators × 47 counties = ${defs.length*47} county series/observations.`);
}
if(mode==='catalogue') await buildCatalogue(); else await buildIndicators();
