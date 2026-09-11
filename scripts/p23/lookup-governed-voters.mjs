import { readFile } from 'node:fs/promises';
const geoCode = process.argv[2];
if (!geoCode) { console.error('usage: node lookup-governed-voters.mjs <geo_code>'); process.exit(1); }
const rj = async p => JSON.parse(await readFile(p, 'utf8'));
const [series, obs, inds, geos] = await Promise.all([
  rj('data/indicators/registry/series.json'),
  rj('data/indicators/registry/observations.json'),
  rj('data/indicators/registry/indicators.json'),
  rj('data/geography/registry/geographies.json'),
]);
const ind = inds.find(i => i.indicator_code === 'IND-REGISTERED-VOTERS');
const geo = geos.find(g => g.geo_code === geoCode);
if (!geo) { console.error('geo not found'); process.exit(1); }
const s = series.find(s => s.indicator_id === ind.indicator_id && s.geography_id === geo.geography_id);
if (!s) { console.log(JSON.stringify({ geo_code: geoCode, name: geo.name, governed_registered_voters: null })); process.exit(0); }
const o = obs.find(o => o.observation_id === s.latest_observation_id);
console.log(JSON.stringify({ geo_code: geoCode, name: geo.name, constituency_code: geo.constituency_code, series_code: s.series_code, governed_registered_voters: o ? o.value : null, period: o ? o.period_label : null }, null, 2));
