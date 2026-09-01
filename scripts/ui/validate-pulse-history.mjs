import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const series=read('data/indicators/registry/series.json');
const observations=read('data/indicators/registry/observations.json');
const pulse=read('data/ui/initial-pulse.json');
const display=read('data/indicators/registry/worldbank-display.json');
const seriesById=new Map(series.map(s=>[s.series_id,s]));
const byCode=new Map(series.map(s=>[s.series_code,s]));
const obsBySeries=new Map();
for(const o of observations){
  if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);
  obsBySeries.get(o.series_id).push(o);
}

const failures=[];
const checked=new Set();
function checkSeries(s,label){
  if(!s){failures.push(`${label}: missing published series`);return;}
  if(checked.has(s.series_id))return;checked.add(s.series_id);
  const rows=(obsBySeries.get(s.series_id)||[]).sort((a,b)=>String(a.period_end).localeCompare(String(b.period_end)));
  if(rows.length<2)failures.push(`${s.series_code}: only ${rows.length} canonical observation(s)`);
  for(const row of rows){
    if(!row.source_url)failures.push(`${s.series_code} ${row.period_label}: missing source_url`);
  }
}

for(const card of pulse.cards||[])checkSeries(byCode.get(card.series_code),`Pulse ${card.series_code}`);
for(const card of display.cards||[])checkSeries(seriesById.get(card.series_id),`WDI ${card.indicator_code}`);

// Explicitly prove the two formerly sparse Core Kenya series are now part of
// the canonical Series registry rather than a Pulse-only overlay.
for(const [code,min] of [['KDA-POP-TOTAL-KEN',6],['KDA-VOTERS-KEN',3]]){
  const s=byCode.get(code),rows=s?(obsBySeries.get(s.series_id)||[]):[];
  if(rows.length<min)failures.push(`${code}: expected at least ${min} canonical observations, found ${rows.length}`);
  const card=(pulse.cards||[]).find(c=>c.series_code===code);
  if(!card)failures.push(`${code}: missing Pulse card`);
  else if(card.available_observation_count!==rows.length)failures.push(`${code}: Pulse count ${card.available_observation_count} does not match canonical count ${rows.length}`);
}

if(failures.length){
  console.error('PULSE_HISTORY_FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1);
}
console.log(`PULSE_HISTORY_OK canonical_series=${checked.size} population=${(obsBySeries.get(byCode.get('KDA-POP-TOTAL-KEN')?.series_id)||[]).length} voters=${(obsBySeries.get(byCode.get('KDA-VOTERS-KEN')?.series_id)||[]).length}`);
