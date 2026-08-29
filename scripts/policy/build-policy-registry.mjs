#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INDICATOR_POLICY_VERSION,
  DOMAIN_ORDER,
  DOMAIN_TARGETS,
  policyForIndicator,
  crossLevelPolicyForSeries
} from './indicator-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const [indicators, units, series, observations] = await Promise.all([
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/units.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json')
]);

const unitById = new Map(units.map(u => [u.unit_id, u]));
const indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
const obsCount = new Map();
for (const o of observations) obsCount.set(o.series_id, (obsCount.get(o.series_id) || 0) + 1);

const indicatorPolicies = indicators
  .map(indicator => ({
    indicator_id: indicator.indicator_id,
    name: indicator.name,
    lifecycle_status: indicator.lifecycle_status || null,
    ...policyForIndicator(indicator)
  }))
  .sort((a, b) => String(a.indicator_code).localeCompare(String(b.indicator_code)));

const seriesPolicies = series
  .filter(s => (obsCount.get(s.series_id) || 0) > 0)
  .map(s => {
    const indicator = indicatorById.get(s.indicator_id);
    if (!indicator) throw new Error(`Policy build: missing indicator ${s.indicator_id} for ${s.series_code || s.series_id}`);
    const unit = unitById.get(s.unit_id || indicator.unit_id);
    const crossLevel = crossLevelPolicyForSeries(s, indicator, unit);
    return {
      series_id: s.series_id,
      series_code: s.series_code,
      indicator_code: indicator.indicator_code,
      unit_code: unit?.code || null,
      transformation: s.transformation || null,
      aggregation: s.aggregation || null,
      cross_level_comparison: crossLevel
    };
  })
  .sort((a, b) => String(a.series_code).localeCompare(String(b.series_code)));

const output = {
  schema_version: 'kda.indicator-policy.registry.v1',
  policy_version: INDICATOR_POLICY_VERSION,
  generated_from: [
    'data/indicators/registry/indicators.json',
    'data/indicators/registry/units.json',
    'data/indicators/registry/series.json',
    'data/indicators/registry/observations.json',
    'scripts/policy/indicator-policy.mjs'
  ],
  principles: {
    parent_value_inheritance_allowed: false,
    dynamic_checks_remain_with_consumer: ['coverage', 'common_period', 'actual_numeric_history', 'provenance_badge', 'observation_uncertainty'],
    static_policy_owned_here: ['domain', 'direction', 'composite_eligibility', 'ranking_mode', 'uncertainty_requirement', 'trend_permission', 'parent_value_inheritance', 'publication_status', 'cross_level_normalisation']
  },
  domains: { order: DOMAIN_ORDER, target_indicators: DOMAIN_TARGETS },
  indicators: indicatorPolicies,
  series: seriesPolicies
};

await mkdir(path.join(root, 'data/policy'), { recursive: true });
await writeFile(path.join(root, 'data/policy/indicator-policy.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`P12_POLICY_REGISTRY_BUILT indicators=${indicatorPolicies.length} series=${seriesPolicies.length} policy=${INDICATOR_POLICY_VERSION}`);
