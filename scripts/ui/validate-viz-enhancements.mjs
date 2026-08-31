import fs from 'node:fs';

const lazy=fs.readFileSync('assets/lazy-integrations.js','utf8');
const js=fs.readFileSync('assets/viz-enhancements.js','utf8');
const css=fs.readFileSync('assets/viz-enhancements.css','utf8');

const checks=[
  ['enhancement JS is lazy-loaded',lazy.includes("KDA.loadScript('assets/viz-enhancements.js'")],
  ['enhancement CSS is lazy-loaded',lazy.includes("KDA.loadStyle('assets/viz-enhancements.css'")],
  ['visual route gate excludes home',lazy.includes("(?:pulse|explore|compare|series|rankings)")&&!lazy.includes("(?:home|pulse|explore|compare|series|rankings)")],
  ['rankings distribution exists',js.includes('function beeswarmSvg(')&&css.includes('.viz-beeswarm')],
  ['Pulse sparklines use published observations',js.includes("KDA.registries(['series','observations']")&&js.includes('viz-card-spark')],
  ['life comparison paired bars exist',js.includes('viz-life-pair')&&css.includes('.viz-life-row')],
  ['series overlay compatibility is explicit',js.includes('function compatibilityKey(s)')&&js.includes('s.indicator_id')&&js.includes('s.unit_id')&&js.includes('s.frequency')&&js.includes('s.comparability_group')],
  ['series overlays are capped at three',js.includes('state.length<3')&&js.includes('Maximum 3 overlays')],
  ['overlay styles are not colour-only',css.includes('stroke-dasharray')&&css.includes('border-top-style:dashed')],
  ['map contrast control is accessible',js.includes('aria-pressed')&&js.includes('High-contrast map')&&css.includes('.viz-map-contrast')],
  ['new interactive elements have focus treatment',css.includes(':focus-visible')],
  ['series observer watches route renderer state only',js.includes("attributeFilter:['data-series-ready']")&&!js.includes("attributeFilter:['data-series-ready'],childList:true")]
];

const failed=checks.filter(([,ok])=>!ok);
if(failed.length){
  for(const [name] of failed)console.error(`FAIL: ${name}`);
  process.exit(1);
}
for(const [name] of checks)console.log(`PASS: ${name}`);
console.log(`Visualization enhancement validation passed (${checks.length} checks).`);
