#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'scripts/countyiq/build-mart.mjs');
let source = fs.readFileSync(target, 'utf8');

function mustReplace(label, pattern, replacement) {
  const before = source;
  source = typeof pattern === 'string' ? source.replace(pattern, replacement) : source.replace(pattern, replacement);
  if (source === before) throw new Error(`P12 migration failed: ${label}`);
}

mustReplace(
  'canonical policy import',
  "import { buildRecognition } from '../p11/recognition.mjs';\n",
  "import { buildRecognition } from '../p11/recognition.mjs';\nimport { INDICATOR_POLICY_VERSION, DOMAIN_ORDER, DOMAIN_TARGETS as TARGETS, domainForIndicator, policyForIndicator, rankingPolicyForIndicator } from '../policy/indicator-policy.mjs';\n"
);

mustReplace(
  'remove local domain policy',
  /const TARGETS=\{economic:8,fiscal:8,health:8,education:6,living:7,infrastructure:6,governance:4\};\nconst DOMAIN_ORDER=\['economic','fiscal','health','education','living','infrastructure','governance'\];\n\nfunction domainFor\(indicator\)\{[\s\S]*?\n\}\nfunction dateKey/,
  'function dateKey'
);

mustReplace(
  'canonical ranking policy',
  /function rankingDecision\(indicator, metricCode, latestByCounty\)\{[\s\S]*?\n\}\nfunction trendView/,
  `function rankingDecision(indicator, metricCode, latestByCounty){\n  const rows=latestByCounty.get(metricCode)||[];\n  const periods=new Set(rows.map(x=>x.latest?.period_label).filter(Boolean));\n  const badges=new Set(rows.map(x=>x.latest?.provenance?.badge).filter(Boolean));\n  const validValues=rows.filter(x=>typeof x.latest?.value==='number'&&Number.isFinite(x.latest.value));\n  const staticPolicy=rankingPolicyForIndicator(indicator);\n  let reason=staticPolicy.static_reason_not_allowed;\n  if(!reason&&rows.length!==47||!reason&&validValues.length!==47) reason='Current comparable value is not available for all 47 counties.';\n  else if(!reason&&periods.size!==1) reason='Latest county observations do not share one comparable period.';\n  else if(!reason&&[...badges].some(b=>!['A','B','C'].includes(b))) reason='Ranking is limited to A/B/C provenance in P02.';\n  else if(!reason&&staticPolicy.requires_sampling_uncertainty&&rows.some(x=>!x.latest?.uncertainty)) reason='Required sampling uncertainty is not available for every county.';\n  return {eligible:!reason,reason,period_key:periods.size===1?[...periods][0]:null,coverage_pct:Number(((rows.length/47)*100).toFixed(1)),policy_version:INDICATOR_POLICY_VERSION};\n}\nfunction trendView`
);

mustReplace(
  'metric static policy projection',
  /const code=indicator\.indicator_code;\n      const metric=\{\n        indicator_id:indicator\.indicator_id,indicator_code:code,name:indicator\.name,domain:domainFor\(indicator\),status:'active',\n        latest,history,\n        ranking:null,\n        trend:trendView\(history\),\n        eligibility:\{ranking_allowed:false,higher_is_better:indicator\.higher_is_better\?\?null,minimum_coverage:100,\n          requires_sampling_uncertainty:indicator\.requires_sampling_uncertainty===true,reason_not_eligible:'P02 ranking eligibility pending cross-county check\.'\}\n      \};/,
  `const code=indicator.indicator_code;\n      const policy=policyForIndicator(indicator);\n      const metric={\n        indicator_id:indicator.indicator_id,indicator_code:code,name:indicator.name,domain:domainForIndicator(indicator),status:'active',\n        latest,history,\n        ranking:null,\n        trend:trendView(history),\n        eligibility:{ranking_allowed:false,higher_is_better:policy.direction.higher_is_better,minimum_coverage:100,\n          requires_sampling_uncertainty:policy.uncertainty.required_for_ranking,trend_allowed:policy.trend.allowed,composite_eligible:policy.composite.eligible,\n          publication_status:policy.publication_status,parent_value_inheritance_allowed:policy.inheritance.parent_value_inheritance_allowed,\n          policy_version:INDICATOR_POLICY_VERSION,reason_not_eligible:'P02 ranking eligibility pending cross-county check.'}\n      };`
);

mustReplace(
  'policy metadata in mart',
  "source_registries:['data/geography/registry/geographies.json','data/indicators/registry/indicators.json','data/indicators/registry/series.json','data/indicators/registry/observations.json','data/indicators/registry/units.json','data/catalogue/registry/datasets.json','data/catalogue/registry/releases.json','data/catalogue/registry/sources.json','data/catalogue/registry/agencies.json'],methodology_version:PEER_METHODOLOGY_VERSION",
  "source_registries:['data/geography/registry/geographies.json','data/indicators/registry/indicators.json','data/indicators/registry/series.json','data/indicators/registry/observations.json','data/indicators/registry/units.json','data/catalogue/registry/datasets.json','data/catalogue/registry/releases.json','data/catalogue/registry/sources.json','data/catalogue/registry/agencies.json','data/policy/indicator-policy.json'],indicator_policy_version:INDICATOR_POLICY_VERSION,methodology_version:PEER_METHODOLOGY_VERSION"
);

fs.writeFileSync(target, source);
console.log('P12_BUILD_MART_CONVERGENCE_MIGRATED');
