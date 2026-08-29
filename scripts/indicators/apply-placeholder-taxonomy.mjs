import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const NAMESPACE = 'c9a6f7b2-3e1d-4a8f-9c2b-5d7e1f4a8b3c';
const uuid = name => {
  const ns = Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"','""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const csv = rows => {
  const fields = unionFields(rows);
  return [fields.join(','), ...rows.map(r => fields.map(f => csvCell(r[f])).join(','))].join('\n') + '\n';
};

const taxonomy = await readJson('data/indicators/seed/placeholder-taxonomy.json');
const dir = 'data/indicators/registry';
const [units, indicators, series, observations, geographies] = await Promise.all([
  readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`),
  readJson(`${dir}/observations.json`), readJson('data/geography/registry/geographies.json')
]);

const validLifecycle = new Set(['planned','sourced','active','retired']);
const validTabs = new Set(['people','economy','health','finance','representation','infrastructure','resilience']);
// §11.6 applies to every household/population sample-survey indicator, not just
// the explicitly enumerated KDHS/NACADA health family. Monetary poverty is a
// household-survey estimate, so enforce the same uncertainty contract here.
const surveyCodes = new Set([...(taxonomy.survey_indicator_codes || []), 'IND-POVERTY-RATE']);
const noRankingCodes = new Set(taxonomy.sensitive_no_ranking_codes || []);
const unitByCode = new Map(units.map(u => [u.code, u]));

for (const u of taxonomy.units || []) {
  if (unitByCode.has(u.code)) continue;
  const row = {
    unit_id: uuid(`unit:${u.code}`), code:u.code, name:u.name, symbol:u.symbol || '',
    dimension:u.dimension, scale_factor:u.scale_factor || 1, decimal_places:u.decimal_places ?? 0,
    currency_code:u.currency_code || ''
  };
  units.push(row); unitByCode.set(row.code,row);
}

const explicitByCode = new Map((taxonomy.indicators || []).map(i => [i.code, i]));
const existingByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const publishedIndicatorIds = new Set(series.filter(s => Number(s.observation_count || 0) > 0).map(s => s.indicator_id));

function defaultPlacement(code) {
  if (['IND-CPI-INFLATION','IND-USD-KES','IND-CBR','IND-TBILL-91'].includes(code)) return { tab:'economy', levels:[] };
  if (code === 'IND-LAND-AREA') return { tab:'infrastructure', levels:['county','constituency','ward'] };
  return { tab:'economy', levels:[] };
}

function enrichExisting(row) {
  const def = explicitByCode.get(row.indicator_code);
  const placement = def || defaultPlacement(row.indicator_code);
  // A real published series outranks placeholder lifecycle metadata. Once an
  // indicator has observations in the canonical registry it is active; a
  // placeholder "sourced" status must not demote released data on rebuild.
  row.lifecycle_status = publishedIndicatorIds.has(row.indicator_id) ? 'active' : (def?.status || 'active');
  row.expected_source = def?.source || row.expected_source || '';
  row.expected_source_url = def?.source_url || row.expected_source_url || '';
  row.expected_availability_note = def?.note || row.expected_availability_note || '';
  row.tab = placement.tab || row.tab || 'economy';
  row.applies_to_levels = placement.levels || row.applies_to_levels || [];
  row.applies_to_geography_subset = def?.subset || row.applies_to_geography_subset || '';
  row.requires_sampling_uncertainty = row.requires_sampling_uncertainty === true || surveyCodes.has(row.indicator_code);
  // Preserve an explicit release-level ranking prohibition. Taxonomy may add
  // further prohibitions but must never turn a false policy back to true.
  row.ranking_allowed = row.ranking_allowed === false ? false : !noRankingCodes.has(row.indicator_code);
  row.active = row.lifecycle_status === 'active';
  return row;
}
indicators.forEach(enrichExisting);

for (const def of taxonomy.indicators || []) {
  if (existingByCode.has(def.code)) continue;
  if (!validLifecycle.has(def.status)) throw new Error(`${def.code}: invalid lifecycle ${def.status}`);
  if (!validTabs.has(def.tab)) throw new Error(`${def.code}: invalid tab ${def.tab}`);
  if (def.status === 'sourced' && (!def.source || !def.source_url)) throw new Error(`${def.code}: sourced indicator requires source + source_url`);
  const unit = unitByCode.get(def.unit_code);
  if (!unit) throw new Error(`${def.code}: unknown unit ${def.unit_code}`);
  const row = {
    indicator_id:uuid(`indicator:${def.code}`), indicator_code:def.code, name:def.name, short_name:def.short_name || def.name,
    description:def.description, topic:def.topic || ({people:'Demography',economy:'Economy',health:'Health',finance:'Public Finance',representation:'Representation',infrastructure:'Infrastructure',resilience:'Resilience & Environment'}[def.tab] || 'Other'),
    subtopic:def.subtopic || def.tab, unit_id:unit.unit_id, higher_is_better:def.higher_is_better ?? null,
    preferred_frequency:def.preferred_frequency || 'irregular', minimum_geo_level:(def.levels?.[0] || 'country'), minimum_denominator:null,
    methodology_url:def.source_url || '', comparable:true, active:def.status === 'active',
    lifecycle_status:def.status, expected_source:def.source || '', expected_source_url:def.source_url || '',
    expected_availability_note:def.note || '', tab:def.tab, applies_to_levels:def.levels || [],
    applies_to_geography_subset:def.subset || '', requires_sampling_uncertainty:surveyCodes.has(def.code),
    ranking_allowed:!noRankingCodes.has(def.code)
  };
  indicators.push(row); existingByCode.set(def.code,row);
}

// The spec names 2009 population as its own active slot. The Atlas already
// holds those observations under IND-POPULATION, so expose the slot without
// inventing data by cloning only the existing county 2009 observations.
const pop2009 = existingByCode.get('IND-POP-2009');
const pop = existingByCode.get('IND-POPULATION');
if (!pop2009 || !pop) throw new Error('Population taxonomy indicators missing');
const geoById = new Map(geographies.map(g => [g.geography_id,g]));
const obsBySeries = new Map();
for (const o of observations) {
  if (!obsBySeries.has(o.series_id)) obsBySeries.set(o.series_id, []);
  obsBySeries.get(o.series_id).push(o);
}
const existingSeriesCodes = new Set(series.map(s => s.series_code));
const existingObsIds = new Set(observations.map(o => o.observation_id));
for (const s of [...series]) {
  if (s.indicator_id !== pop.indicator_id) continue;
  const geo = geoById.get(s.geography_id);
  if (geo?.level !== 'county') continue;
  const own2009 = (obsBySeries.get(s.series_id) || []).filter(o => String(o.period_label).includes('2009') || String(o.period_start).startsWith('2009'));
  if (!own2009.length) continue;
  const code = `KDA-POP-2009-${geo.geo_code}`;
  if (existingSeriesCodes.has(code)) continue;
  const sid = uuid(`series:${code}`);
  const clonedObs = own2009.map(o => {
    const oid = uuid(`observation:${code}:${o.period_start}:${o.period_end}`);
    return {...o, observation_id:oid, series_id:sid, vintage_id:uuid(`vintage:${code}:${o.period_start}:1`), supersedes_observation_id:''};
  }).filter(o => !existingObsIds.has(o.observation_id));
  clonedObs.forEach(o => { observations.push(o); existingObsIds.add(o.observation_id); });
  clonedObs.sort((a,b) => String(a.period_start).localeCompare(String(b.period_start)));
  series.push({...s, series_id:sid, series_code:code, indicator_id:pop2009.indicator_id,
    start_period:clonedObs[0]?.period_label || '', end_period:clonedObs.at(-1)?.period_label || '',
    latest_observation_id:clonedObs.at(-1)?.observation_id || '', observation_count:clonedObs.length,
    last_updated_at:clonedObs.at(-1)?.ingested_at || ''});
  existingSeriesCodes.add(code);
}

if (!series.some(s => s.indicator_id === pop2009.indicator_id)) {
  throw new Error('IND-POP-2009 is active but no existing county 2009 observations could be exposed as series');
}

await Promise.all([
  writeFile(path.join(root,`${dir}/units.json`),JSON.stringify(units,null,2)+'\n'),
  writeFile(path.join(root,`${dir}/units.csv`),csv(units)),
  writeFile(path.join(root,`${dir}/indicators.json`),JSON.stringify(indicators,null,2)+'\n'),
  writeFile(path.join(root,`${dir}/indicators.csv`),csv(indicators)),
  writeFile(path.join(root,`${dir}/series.json`),JSON.stringify(series,null,2)+'\n'),
  writeFile(path.join(root,`${dir}/series.csv`),csv(series)),
  writeFile(path.join(root,`${dir}/observations.json`),JSON.stringify(observations,null,2)+'\n'),
  writeFile(path.join(root,`${dir}/observations.csv`),csv(observations))
]);

console.log(`Placeholder taxonomy applied: ${indicators.length} indicators (${indicators.filter(i=>i.lifecycle_status==='active').length} active, ${indicators.filter(i=>i.lifecycle_status==='sourced').length} sourced, ${indicators.filter(i=>i.lifecycle_status==='planned').length} planned).`);
