import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTION_RULES } from './direction-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registryPath = path.join(root, 'data/indicators/registry/indicators.json');

function main() {
  const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.indicators;
  let changed = 0;
  for (const indicator of list) {
    const rule = DIRECTION_RULES[indicator.indicator_code];
    const next = rule ? rule.higher_is_better : null;
    if (indicator.higher_is_better !== next) {
      indicator.higher_is_better = next;
      changed += 1;
    }
  }
  fs.writeFileSync(registryPath, JSON.stringify(raw, null, 2) + '\n');
  console.log(`P06_DIRECTION_APPLIED changed=${changed} total=${list.length} directional=${Object.keys(DIRECTION_RULES).length}`);
}

main();
