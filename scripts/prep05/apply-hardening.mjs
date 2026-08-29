import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const p=file=>path.join(root,file);
const read=file=>readFile(p(file),'utf8');
const write=(file,text)=>writeFile(p(file),text);
function must(condition,message){if(!condition)throw new Error(message);}
function replaceOnce(text,from,to,label){
  if(text.includes(to))return text;
  must(text.includes(from),`prep05 patch anchor missing: ${label}`);
  return text.replace(from,to);
}
function replaceRegex(text,re,to,label){
  if(re.test(text))return text.replace(re,to);
  throw new Error(`prep05 regex anchor missing: ${label}`);
}

// package scripts: place facts are regenerated after the derived-area build.
const packagePath='package.json';
const pkg=JSON.parse(await read(packagePath));
pkg.scripts['placefacts:build']='node scripts/prep05/build-place-facts.mjs';
pkg.scripts['prep05:validate']='node scripts/prep05/validate-hardening.mjs';
pkg.scripts['build:data']='npm run geography:build && npm run catalogue:build && npm run indicators:build && npm run placefacts:build && npm run countyiq:build && npm run ui:build';
if(!pkg.scripts.test.includes('npm run prep05:validate'))pkg.scripts.test=pkg.scripts.test+' && npm run prep05:validate';
if(!pkg.scripts['ui:validate'].includes('pre-p05-hardening.js'))pkg.scripts['ui:validate']=pkg.scripts['ui:validate']+' && node --check assets/pre-p05-hardening.js';
await write(packagePath,JSON.stringify(pkg,null,2)+'\n');

// Catalogue: official county area is a narrow approved census slice; geometry-derived area remains for lower levels.
const datasetsPath='data/catalogue/seed/datasets.json';
const datasets=JSON.parse(await read(datasetsPath));
if(!datasets.some(d=>d.code==='DS-KNBS-CENSUS-AREA-2019')){
  const at=Math.max(0,datasets.findIndex(d=>d.code==='DS-KDA-DERIVED-AREA'));
  datasets.splice(at,0,{
    code:'DS-KNBS-CENSUS-AREA-2019',source_code:'KNBS-STATISTICS',title:'2019 Census — Official County Land Area',
    description:'Official county and national land-area figures from the 2019 Kenya Population and Housing Census.',
    topic:'Geography',geographic_coverage:['country','county'],frequency:'decennial',publication_status:'published',
    methodology_url:'https://www.knbs.or.ke/2019-kenya-population-and-housing-census-results/',
    known_limitations:'County/national land area only. Does not provide electoral-constituency or ward areas. RCMRD is retained as a spatial boundary cross-check, not the numeric area authority.'
  });
}
const derivedDataset=datasets.find(d=>d.code==='DS-KDA-DERIVED-AREA');
if(derivedDataset){
  derivedDataset.title='Constituency and Ward Area (derived from validated boundary geometry)';
  derivedDataset.description='Approximate small-area size computed from the Atlas validated boundary geometry; county headline area is instead sourced directly from KNBS 2019.';
  derivedDataset.geographic_coverage=['constituency','ward'];
  derivedDataset.known_limitations="Not a surveyed or official area figure. Used only where the official KNBS county land-area table does not publish the electoral geography. Geometry is externally validated and area is an approximation with the documented error band; county values are no longer sourced from this dataset.";
}
await write(datasetsPath,JSON.stringify(datasets,null,2)+'\n');

// Indicator definition now distinguishes official county area from lower-level derived estimates.
const indicatorsPath='data/indicators/seed/indicators.json';
const indicatorSeed=JSON.parse(await read(indicatorsPath));
const areaIndicator=indicatorSeed.find(i=>i.code==='IND-LAND-AREA');
must(areaIndicator,'IND-LAND-AREA seed missing');
areaIndicator.name='Land area';
areaIndicator.short_name='Area';
areaIndicator.description='Land area. County and national values use the official KNBS 2019 census land-area table; constituency and ward values are explicitly boundary-derived estimates.';
areaIndicator.methodology_url='https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/indicators.md';
await write(indicatorsPath,JSON.stringify(indicatorSeed,null,2)+'\n');

// Indicator build: publish KNBS direct county/national area and retain derived area only for constituency/ward.
const buildPath='scripts/indicators/build-registry.mjs';
let build=await read(buildPath);
const areaSeriesBlock=`const areaComputed = await readRoot('data/indicators/seed/derived/area-computed.json');
const officialAreaCsv = await readFile(path.join(root, 'data/geography/source/official-county-area-2019.csv'), 'utf8');
const officialAreaByGeoCode = new Map(officialAreaCsv.trim().split(/\\r?\\n/).slice(1).map(line => {
  const [countyNumber, geoCode, name, value] = line.split(',');
  return [geoCode, { countyNumber, geoCode, name, value: Number(value) }];
}));
officialAreaByGeoCode.set('KEN', { countyNumber: '', geoCode: 'KEN', name: 'Kenya', value: 580876.3 });
const areaSeriesMetaByGeoCode = new Map();
for (const result of areaComputed.results) {
  const official = (result.level === 'country' || result.level === 'county') ? officialAreaByGeoCode.get(result.geo_code) : null;
  const s = {
    code: \`KDA-AREA-\${result.geo_code}\`, indicator_code: 'IND-LAND-AREA', geo_code: result.geo_code,
    dataset_code: official ? 'DS-KNBS-CENSUS-AREA-2019' : 'DS-KDA-DERIVED-AREA', frequency: official ? 'decennial' : 'irregular', period_type: 'point_in_time',
    unit_code: 'km2', price_basis: 'not_applicable', transformation: 'level',
    geographic_method: official ? 'direct' : 'aggregated', comparability_group: official ? 'AREA-KNBS-2019' : \`AREA-DERIVED-\${areaComputed.boundary_version}\`
  };
  const row = buildSeries(s, { indicatorCode: s.indicator_code, geoCode: s.geo_code, datasetCode: s.dataset_code, unitCode: s.unit_code });
  if (row) { seriesRows.push(row); areaSeriesMetaByGeoCode.set(result.geo_code, { row, official, derived: result }); }
}

const seriesByCode = new Map`;
build=replaceRegex(build,/const areaComputed = await readRoot\('data\/indicators\/seed\/derived\/area-computed\.json'\);[\s\S]*?const seriesByCode = new Map/,areaSeriesBlock,'area series block');
const areaObsBlock=`// Area observations: official KNBS for country/counties; boundary-derived estimates for constituencies/wards.
for (const result of areaComputed.results) {
  const seriesCode = \`KDA-AREA-\${result.geo_code}\`;
  const meta = areaSeriesMetaByGeoCode.get(result.geo_code);
  if (!seriesByCode.has(seriesCode) || !meta) continue;
  if (meta.official) {
    buildObservation({
      period_start: '2019-08-24', period_end: '2019-08-24', period_type: 'point_in_time', period_label: '2019 Census land area',
      value: meta.official.value,
      source_url: 'https://www.knbs.or.ke/2019-kenya-population-and-housing-census-results/',
      source_table: 'Table 2.4 — Distribution of Population, Land Area and Population Density by County',
      published_at: '2019-11-04',
      notes: 'Official KNBS 2019 land-area figure. RCMRD Geoportal is retained as an independent spatial boundary cross-check; it is not used as the numeric area authority.'
    }, seriesCode, { geographic_method: 'direct', statistical_status: 'final', source_class: 'official' });
  } else {
    buildObservation({
      period_start: areaComputed.generated_at.slice(0, 10), period_end: areaComputed.generated_at.slice(0, 10),
      period_type: 'point_in_time', period_label: \`Boundary-derived \${areaComputed.boundary_version}\`,
      value: result.area_km2, release_code: 'REL-KDA-AREA-2026',
      source_url: 'https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/indicators.md',
      published_at: areaComputed.generated_at.slice(0, 10),
      notes: \`\${areaComputed.method}. Estimated error band +/-\${areaComputed.estimated_error_band_pct}%. \${areaComputed.note} County values are sourced separately from KNBS and are not inferred from this geometry.\`
    }, seriesCode, { geographic_method: 'aggregated', statistical_status: 'estimated', source_class: 'official' });
  }
}

// --------------------------------------------------- roll observations into series`;
build=replaceRegex(build,/\/\/ Auto-generated area observations, one per computed feature\.[\s\S]*?\/\/ --------------------------------------------------- roll observations into series/,areaObsBlock,'area observations block');
await write(buildPath,build);

// Static shell: load hardening styles/scripts and clarify fiscal + P04 scope copy.
const indexPath='index.html';let index=await read(indexPath);
index=replaceOnce(index,'  <link rel="stylesheet" href="assets/countyiq-view.css">','  <link rel="stylesheet" href="assets/countyiq-view.css">\n  <link rel="stylesheet" href="assets/pre-p05-hardening.css">','hardening CSS include');
index=replaceOnce(index,'  <script src="assets/routed-views.js"></script>','  <script src="assets/routed-views.js"></script>\n  <script src="assets/pre-p05-hardening.js"></script>','hardening JS include');
index=index.replace('Current release uses published GCP, fiscal and voter data only.','Current release combines published economic, fiscal, voter, health and living-standard facts; contextual place facts retain their own source dates.');
index=index.replace('FY2013/14–FY2024/25 · common-period county comparisons only.','One consolidated table · FY2013/14–FY2024/25 · common-period county comparisons only.');
await write(indexPath,index);

// Geo Explorer emits exact selected geography identity so small-area context can stay honest.
const geoPath='assets/geo-explorer.js';let geo=await read(geoPath);
geo=replaceOnce(geo,"const el=$('#geo-selected-summary');if(!el)return;if(!geo.parent_id||!indicator){el.hidden=true;return;}","const el=$('#geo-selected-summary');if(!el)return;if(!geo.parent_id||!indicator){el.hidden=true;delete el.dataset.geoCode;delete el.dataset.geoLevel;return;}el.dataset.geoCode=geo.geo_code;el.dataset.geoLevel=geo.level;",'geo summary identity');
await write(geoPath,geo);

// Generic Series chart now has actual point marks, source periods and touch/focus disclosures.
const routedPath='assets/routed-views.js';let routed=await read(routedPath);
const chartFunction=`function chartSvg(rows,unit){
    if(!rows.length)return'<div class="series-empty">No published observations.</div>';
    const values=rows.map(o=>Number(o.value)).filter(Number.isFinite);if(!values.length)return'';
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,1e-9),w=740,h=210;
    const coords=rows.map((o,i)=>({o,x:40+(i/(Math.max(rows.length-1,1)))*(w-80),y:25+((max-Number(o.value))/span)*(h-50)}));
    const points=coords.map(p=>p.x+','+p.y).join(' ');
    const circles=coords.map(p=>'<circle data-chart-point="true" cx="'+p.x+'" cy="'+p.y+'" r="5"><title>'+esc(p.o.period_label)+': '+esc(formatSeriesValue(p.o.value,unit))+'</title></circle>').join('');
    const axisY=esc(unit?.name||unit?.code||'Published value');
    return'<svg viewBox="0 0 '+w+' '+h+'" role="img" data-axis-x="Reference period" data-axis-y="'+axisY+'" aria-label="Published series history"><path class="grid" d="M40 25H700M40 80H700M40 135H700M40 185H700"/><polyline class="series-line" points="'+points+'"/>'+circles+'</svg>';
  }`;
routed=replaceRegex(routed,/function chartSvg\(rows\)\{[\s\S]*?\n  \}\n  async function renderSeriesRoute/,chartFunction+'\n  async function renderSeriesRoute','series chart function');
routed=routed.replace('chartSvg(shown)','chartSvg(shown,unit)');
await write(routedPath,routed);

// Hardening runtime uses series-provided axis units when available.
const hardPath='assets/pre-p05-hardening.js';let hard=await read(hardPath);
hard=hard.replace("else if(svg.closest('.large-chart'))cfg={x:'Reference period',y:'Published value',top:25,bottom:185,left:40};","else if(svg.closest('.large-chart'))cfg={x:svg.dataset.axisX||'Reference period',y:svg.dataset.axisY||'Published value',top:25,bottom:185,left:40};");
await write(hardPath,hard);

// Geography docs: separate official numeric county area from geometry validation and RCMRD cross-check.
const geoReadmePath='data/geography/README.md';let geoReadme=await read(geoReadmePath);
if(!geoReadme.includes('## Area authority and RCMRD cross-check')){
  const insert='## Area authority and RCMRD cross-check\n\nCounty headline land area is now sourced directly from KNBS 2019 Census Table 2.4 rather than calculated from the Atlas polygon. `data/geography/county-area-validation.json` compares each official county value with the geometry-derived area and reports the difference without forcing agreement. RCMRD Geoportal is recorded as an independent spatial boundary cross-check; it is not presented as the numeric county-area authority. Constituency and ward area remain clearly labelled boundary-derived estimates because the KNBS county table does not publish those electoral-geography areas.\n\n';
  geoReadme=geoReadme.replace('## Identity rules\n',insert+'## Identity rules\n');
}
await write(geoReadmePath,geoReadme);

// Methodology appendix for display semantics.
const methodPath='docs/methodology/indicators.md';let method=await read(methodPath);
if(!method.includes('## Pre-P05 area and place-fact hardening'))method += '\n## Pre-P05 area and place-fact hardening\n\n- County/national land area uses the official KNBS 2019 Census land-area table and is published as direct official evidence.\n- Constituency/ward area remains a boundary-derived estimate and retains the geometry method/error disclosure.\n- RCMRD Geoportal is a spatial cross-check, not the numeric county-area authority.\n- Contextual school, teacher, facility, historical hospital and historical approximate doctor facts are date/definition labelled and are not silently inherited to lower geographies.\n- These contextual facts do not count toward the P05 active-indicator breadth gate until P05 performs full catalogue/indicator promotion.\n';
await write(methodPath,method);

console.log('PREP05_HARDENING_PATCH_OK');
