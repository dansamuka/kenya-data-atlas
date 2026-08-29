import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>readFile(path.join(root,file),'utf8');
const json=async file=>JSON.parse(await read(file));
const assert=(x,m)=>{if(!x)throw new Error(m);};

const [facts,areaAudit,geos,indicators,series,observations,datasets,roadmap,index,hard,routed,geoJs,ciq] = await Promise.all([
  json('data/place-facts/county-key-facts.json'),json('data/geography/county-area-validation.json'),json('data/geography/registry/geographies.json'),
  json('data/indicators/registry/indicators.json'),json('data/indicators/registry/series.json'),json('data/indicators/registry/observations.json'),json('data/catalogue/registry/datasets.json'),json('data/project-roadmap.json'),
  read('index.html'),read('assets/pre-p05-hardening.js'),read('assets/routed-views.js'),read('assets/geo-explorer.js'),read('assets/countyiq-view.js')
]);

assert(facts.counties?.length===47,'place facts must cover 47 counties');
facts.counties.forEach((c,i)=>{const n=String(i+1).padStart(3,'0');assert(c.county_number===n,`county facts out of formal order at ${n}`);assert(c.geo_code===`KEN-C${n}`,`county code mismatch ${c.name}`);});
assert(facts.validation.public_primary_schools_2023===23274,'primary school reconciliation failed');
assert(facts.validation.primary_classroom_teachers_2023===183929,'primary teacher reconciliation failed');
assert(facts.validation.public_secondary_schools_2023===9246,'secondary school reconciliation failed');
assert(facts.validation.secondary_teachers_2023===108569,'secondary teacher reconciliation failed');
assert(facts.validation.level4_hospitals_2017===349&&facts.validation.level5_hospitals_2017===13,'hospital baseline reconciliation failed');
assert(facts.validation.facilities_assessed_2023===14883,'facility census reconciliation failed');
assert(facts.small_area_rule.includes('never inherited'),'small-area non-inheritance rule missing');
console.log('PREP05_PLACE_FACTS_47_OK');
console.log('PREP05_FACT_DEFINITIONS_OK education=TSC2023 facilities=MoH2023 hospitals=MoH2017 doctors=CRA2011');

assert(areaAudit.counties?.length===47,'area audit must cover 47 counties');
assert(areaAudit.numeric_authority?.agency.includes('KNBS'),'KNBS numeric area authority missing');
assert(areaAudit.spatial_cross_checks?.some(x=>x.agency.includes('RCMRD')),'RCMRD spatial cross-check missing');
assert(areaAudit.counties.every(x=>Number.isFinite(Number(x.official_knbs_land_area_km2))&&Number(x.official_knbs_land_area_km2)>0),'invalid official county area');
console.log('PREP05_AREA_KNBS_RCMRD_OK');

const areaIndicator=indicators.find(i=>i.indicator_code==='IND-LAND-AREA');assert(areaIndicator,'land-area indicator missing');
const datasetById=new Map(datasets.map(d=>[d.dataset_id,d]));const obsById=new Map(observations.map(o=>[o.observation_id,o]));
const geoById=new Map(geos.map(g=>[g.geography_id,g]));
const areaSeries=series.filter(s=>s.indicator_id===areaIndicator.indicator_id);
const countyAreaSeries=areaSeries.filter(s=>geoById.get(s.geography_id)?.level==='county');
assert(countyAreaSeries.length===47,`expected 47 county area series, got ${countyAreaSeries.length}`);
for(const s of countyAreaSeries){const ds=datasetById.get(s.dataset_id),o=obsById.get(s.latest_observation_id);assert(ds?.dataset_code==='DS-KNBS-CENSUS-AREA-2019',`county area not using KNBS dataset: ${s.series_code}`);assert(o?.badge==='A'&&o?.geographic_method==='direct'&&o?.statistical_status==='final',`county area not official direct: ${s.series_code}`);}
const wardArea=areaSeries.filter(s=>geoById.get(s.geography_id)?.level==='ward');assert(wardArea.length===1450,`expected 1450 derived ward area series, got ${wardArea.length}`);
for(const s of wardArea.slice(0,20)){const o=obsById.get(s.latest_observation_id);assert(o?.badge==='B'&&o?.statistical_status==='estimated',`ward area must remain derived estimate: ${s.series_code}`);}
console.log('PREP05_AREA_SEMANTICS_OK county=A ward=B');

assert(index.includes('assets/pre-p05-hardening.css')&&index.includes('assets/pre-p05-hardening.js'),'hardening assets not loaded');
assert(index.includes('One consolidated table · FY2013/14–FY2024/25'),'fiscal consolidated-table copy missing');
assert((ciq.match(/<table class=\\?"ciq-fiscal-table\\?"/g)||[]).length===1,'CountyIQ must render one canonical fiscal-history table');
assert(ciq.includes('f.history.slice().reverse().map'),'fiscal table must span full history');
console.log('PREP05_FISCAL_ONE_TABLE_OK');

assert(hard.includes("$$('select').forEach(enhanceSelect)"),'product-wide searchable-select enhancement missing');
assert(hard.includes('countyLabel(name)')&&hard.includes('countyOrdered'),'formal county-number ordering missing');
assert(hard.includes('kda-select-search-dialog'),'searchable dropdown dialog missing');
console.log('PREP05_SEARCHABLE_SELECTS_OK county_order=001-047');

assert(hard.includes('kda-axis-title')&&hard.includes('point.dataset.chartPoint'),'chart axes/point interaction enhancement missing');
assert(routed.includes('data-chart-point="true"')&&routed.includes('<title>'),'generic Series chart points lack disclosure');
assert(hard.includes("point.addEventListener('click'")&&hard.includes("point.addEventListener('pointerenter'")&&hard.includes("point.addEventListener('focus'"),'chart point hover/tap/focus handlers missing');
console.log('PREP05_CHART_DISCLOSURE_OK axes=labelled points=hover-tap-focus');

assert(hard.includes('public_primary_schools_2023')&&hard.includes('level4_5_hospitals_2017')&&hard.includes('approximate_doctors_cra2011'),'place-facts UI missing requested facts');
assert(hard.includes('not inherited to this'),'small-area UI inheritance warning missing');
assert(geoJs.includes('el.dataset.geoCode=geo.geo_code'),'Geo Explorer does not expose selected geography identity');
console.log('PREP05_PLACE_FACTS_UI_OK');

const p04=roadmap.phases.find(p=>p.id==='P04'),p05=roadmap.phases.find(p=>p.id==='P05'),p06=roadmap.phases.find(p=>p.id==='P06');
assert(p04?.status==='complete','P04 must remain complete');
assert(['next','complete'].includes(p05?.status),'pre-P05 hardening must remain valid before and after P05 release');
if(p05?.status==='complete')assert(p06?.status==='next','once P05 is complete, P06 must be next');
console.log(`PREP05_HARDENING_ROADMAP_OK P05=${p05?.status} P06=${p06?.status}`);
console.log('PREP05_HARDENING_ALL_OK');
