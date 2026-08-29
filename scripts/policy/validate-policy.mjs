#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INDICATOR_POLICY_VERSION,
  policyForIndicator,
  domainForIndicator,
  directionFor,
  crossLevelPolicyForSeries
} from './indicator-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const indicators = read('data/indicators/registry/indicators.json');
const units = read('data/indicators/registry/units.json');
const series = read('data/indicators/registry/series.json');
const policy = read('data/policy/indicator-policy.json');
const mart = read('data/countyiq/county-summary.json');
const cross = read('data/indicators/registry/cross-level-eligibility.json');
const packageJson = read('package.json');

const fail = message => { throw new Error(`P12 policy validation: ${message}`); };
if (policy.policy_version !== INDICATOR_POLICY_VERSION) fail(`policy registry version ${policy.policy_version} != ${INDICATOR_POLICY_VERSION}`);
if (policy.indicators.length !== indicators.length) fail(`policy indicator count ${policy.indicators.length} != registry ${indicators.length}`);
if (cross.policy_version !== INDICATOR_POLICY_VERSION) fail('cross-level registry is not stamped with canonical policy version');
if (mart.meta?.indicator_policy_version !== INDICATOR_POLICY_VERSION) fail('CountyIQ mart is not stamped with canonical policy version');

const indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const unitById = new Map(units.map(u => [u.unit_id, u]));
const policyByCode = new Map(policy.indicators.map(p => [p.indicator_code, p]));
const seriesById = new Map(series.map(s => [s.series_id, s]));

for (const indicator of indicators) {
  const expected = policyForIndicator(indicator);
  const actual = policyByCode.get(indicator.indicator_code);
  if (!actual) fail(`missing policy row for ${indicator.indicator_code}`);
  for (const key of ['domain','publication_status']) if (actual[key] !== expected[key]) fail(`${indicator.indicator_code}: ${key} drift`);
  if (actual.direction?.higher_is_better !== expected.direction.higher_is_better) fail(`${indicator.indicator_code}: direction drift`);
  if (actual.ranking?.mode !== expected.ranking.mode) fail(`${indicator.indicator_code}: ranking mode drift`);
  if (actual.uncertainty?.required_for_ranking !== expected.uncertainty.required_for_ranking) fail(`${indicator.indicator_code}: uncertainty rule drift`);
  if (actual.trend?.allowed !== expected.trend.allowed) fail(`${indicator.indicator_code}: trend rule drift`);
  if (actual.inheritance?.parent_value_inheritance_allowed !== false) fail(`${indicator.indicator_code}: parent inheritance must be false`);
}

const spotChecks = {
  'IND-GCP-CURRENT': 'economic',
  'IND-RENT-BURDEN': 'living',
  'IND-SCHOOL-ATTENDANCE-RATE': 'education',
  'IND-LABOUR-FORCE-PARTICIPATION': 'economic',
  'IND-REGISTERED-VOTERS': 'governance'
};
for (const [code, expectedDomain] of Object.entries(spotChecks)) {
  const indicator = indicatorByCode.get(code);
  if (!indicator) fail(`spot-check indicator ${code} missing`);
  if (domainForIndicator(indicator) !== expectedDomain) fail(`${code}: expected domain ${expectedDomain}`);
}
if (directionFor('IND-RENT-BURDEN') !== false) fail('rent burden direction must be lower-is-better');
if (directionFor('IND-POPULATION') !== null) fail('population must remain positional-only, not quality directional');

for (const county of mart.counties || []) {
  for (const metric of Object.values(county.metrics || {})) {
    const indicator = indicatorById.get(metric.indicator_id);
    if (!indicator) fail(`${county.geography?.geo_code}/${metric.indicator_code}: missing indicator`);
    const expected = policyForIndicator(indicator);
    if (metric.domain !== expected.domain) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart domain drift`);
    if (metric.eligibility?.higher_is_better !== expected.direction.higher_is_better) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart direction drift`);
    if (metric.eligibility?.trend_allowed !== expected.trend.allowed) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart trend policy drift`);
    if (metric.eligibility?.composite_eligible !== expected.composite.eligible) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart composite policy drift`);
    if (metric.eligibility?.requires_sampling_uncertainty !== expected.uncertainty.required_for_ranking) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart uncertainty policy drift`);
    if (metric.eligibility?.parent_value_inheritance_allowed !== false) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart inheritance drift`);
    if (metric.eligibility?.policy_version !== INDICATOR_POLICY_VERSION) fail(`${county.geography?.geo_code}/${metric.indicator_code}: mart policy version missing`);
  }
}

for (const row of cross.series || []) {
  const s = seriesById.get(row.series_id);
  const indicator = indicatorById.get(s?.indicator_id);
  if (!s || !indicator) fail(`cross-level row ${row.series_id}: source series/indicator missing`);
  const unit = unitById.get(s.unit_id || indicator.unit_id);
  const expected = crossLevelPolicyForSeries(s, indicator, unit);
  if (row.cross_level_eligible !== expected.eligible || row.rule_basis !== expected.rule_basis) fail(`${row.series_code}: cross-level policy drift`);
}

const martSource = fs.readFileSync(path.join(root, 'scripts/countyiq/build-mart.mjs'), 'utf8');
const crossSource = fs.readFileSync(path.join(root, 'scripts/indicators/build-cross-level-eligibility.mjs'), 'utf8');
const directionSource = fs.readFileSync(path.join(root, 'scripts/p06/direction-rules.mjs'), 'utf8');
if (martSource.includes('function domainFor(indicator)')) fail('legacy local CountyIQ domain classifier still exists');
if (!martSource.includes("from '../policy/indicator-policy.mjs'")) fail('CountyIQ mart does not consume canonical policy');
if (crossSource.includes('const NORMALIZED_TRANSFORM')) fail('cross-level builder still carries a duplicate normalisation policy');
if (!directionSource.includes("from '../policy/indicator-policy.mjs'")) fail('P06 direction compatibility layer does not re-export canonical policy');
if (!String(packageJson.scripts?.['countyiq:build'] || '').includes('policy:build')) fail('countyiq:build must materialise the public policy registry');
if (!String(packageJson.scripts?.test || '').includes('policy:validate')) fail('npm test must include the P12 policy validator');

console.log(`P12_POLICY_VERSION_OK ${INDICATOR_POLICY_VERSION}`);
console.log(`P12_POLICY_INDICATORS_OK count=${indicators.length}`);
console.log(`P12_POLICY_MART_CONVERGENCE_OK counties=${mart.counties.length}`);
console.log(`P12_POLICY_CROSS_LEVEL_OK series=${cross.series.length}`);
console.log('P12_CANONICAL_CONVERGENCE_ALL_OK');
