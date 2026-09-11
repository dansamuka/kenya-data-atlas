import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P25 mobile money validation: ${msg}`); };

const INDICATOR_CODE = 'IND-MOBILE-MONEY-VOLUME';
const PREFIX = 'KDA-P25-MOBILE-MONEY-VOLUME-';

const source = json('data/p25/source/mobile-money-cico-cbk-2026.json');
const taxonomy = json('data/indicators/seed/placeholder-taxonomy.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');
const observations = json('data/indicators/registry/observations.json');
const geographies = json('data/geography/registry/geographies.json');
const datasets = json('data/catalogue/registry/datasets.json');
const releases = json('data/catalogue/registry/releases.json');
const ledger = json('data/completeness/slot-ledger.json').rows;
const summary = json('data/completeness/summary.json');

// ---------------------------------------------------------------- source
const months = source.months || [];
assert(months.length >= 1, 'source must contain at least one monthly observation');
for (const m of months) {
  assert(Number.isFinite(Number(m.value_kes_million)) && Number(m.value_kes_million) > 0, `invalid value_kes_million for ${m.period_label}`);
  assert(Math.round(Number(m.value_ksh_billion) * 1000) === Number(m.value_kes_million), `value_kes_million/value_ksh_billion mismatch for ${m.period_label}`);
}
assert(String(source.publisher || '') === 'Central Bank of Kenya', 'source must attribute the Central Bank of Kenya');
assert(String(source.source_url || '').startsWith('https://www.centralbank.go.ke/'), 'source_url must point at a centralbank.go.ke page');
assert(/agent cash-in\/cash-out|CICO/i.test(source.scope_note || ''), 'source must document the CICO scope limitation');
assert(/does not|not a reconciled|excluded/i.test(source.scope_note || ''), 'source must not overclaim coverage of every mobile-money transaction type');

// ---------------------------------------------------------------- taxonomy
assert((taxonomy.national_pulse_slots || []).includes(INDICATOR_CODE), 'IND-MOBILE-MONEY-VOLUME must remain a national_pulse slot');
const taxDef = (taxonomy.indicators || []).find(i => i.code === INDICATOR_CODE);
assert(taxDef?.status === 'active', 'taxonomy definition must be active');
assert(/CICO|cash-in\/cash-out/i.test(taxDef?.note || ''), 'taxonomy note must document the CICO scope');

// ---------------------------------------------------------------- indicator
const indicator = indicators.find(i => i.indicator_code === INDICATOR_CODE);
assert(indicator, 'indicator record missing');
assert(indicator.active === true && indicator.lifecycle_status === 'active', 'indicator must be active');
assert(indicator.minimum_geo_level === 'country', 'indicator must remain country-level only');
assert(/CICO|cash-in\/cash-out/i.test(indicator.description || ''), 'indicator description must document the CICO scope');
assert(/does not cover|not a reconciled|excludes|excluded/i.test(indicator.expected_availability_note || indicator.description || ''), 'indicator must not overclaim coverage');

// ---------------------------------------------------------------- series/observations
const country = geographies.find(g => g.level === 'country' && g.geo_code === 'KEN');
assert(country, 'KEN country geography missing');
const ownSeries = series.filter(s => String(s.series_code || '').startsWith(PREFIX) || (s.indicator_id === indicator.indicator_id && s.geography_id === country.geography_id));
assert(ownSeries.length === 1, `expected exactly one national mobile-money series, found ${ownSeries.length}`);
const s = ownSeries[0];
assert(s.geography_id === country.geography_id, 'series must be attached to the KEN country geography');
assert(s.geographic_method === 'direct' && s.frequency === 'monthly', 'series must be a direct monthly national series');

const ownObs = observations.filter(o => o.series_id === s.series_id);
assert(ownObs.length === months.length, `expected ${months.length} observations, found ${ownObs.length}`);
assert(s.observation_count === ownObs.length, 'series observation_count must match actual observation count');
assert(ownObs.some(o => o.observation_id === s.latest_observation_id), 'latest_observation_id must point at one of the series observations');
for (const o of ownObs) {
  assert(o.source_class === 'official' && o.badge === 'A' && o.geographic_method === 'direct', `observation ${o.period_label} must be official/direct/Class A`);
  assert(Number.isFinite(Number(o.value)) && Number(o.value) > 0, `observation ${o.period_label} must carry a positive numeric value`);
  assert(String(o.source_url || '').startsWith('https://www.centralbank.go.ke/'), `observation ${o.period_label} must cite the CBK source`);
  assert(/CICO|cash-in\/cash-out/i.test(o.notes || ''), `observation ${o.period_label} notes must document the CICO scope`);
}

// ---------------------------------------------------------------- catalogue
assert(datasets.some(d => d.dataset_code === 'DS-CBK-MOBILE-MONEY-CICO-2026-P25'), 'CBK mobile-money dataset missing');
assert(releases.some(r => r.release_code === 'REL-CBK-MOBILE-MONEY-CICO-2026-P25'), 'CBK mobile-money release missing');

// ---------------------------------------------------------------- ledger
const row = ledger.find(r => r.indicator_code === INDICATOR_CODE && r.geo_code === 'KEN');
assert(row, 'P25 ledger row missing for IND-MOBILE-MONEY-VOLUME');
assert(row.resolved === true, 'P25 ledger row must be resolved');
assert(row.status === 'published_direct', `P25 ledger row must be published_direct, found ${row.status}`);
assert(row.completion_phase === 'complete', 'P25 ledger row completion_phase must be complete');
assert((summary.by_completion_phase?.P25 || 0) === 0, 'completeness summary must show zero remaining P25 rows');

console.log(`P25_MOBILE_MONEY_VALIDATE_OK months=${months.length} latest=${months[months.length - 1].period_label} value_kes_million=${months[months.length - 1].value_kes_million} ledger_resolved=true`);
