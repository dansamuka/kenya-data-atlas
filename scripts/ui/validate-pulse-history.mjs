import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const series=read('data/indicators/registry/series.json');
const observations=read('data/indicators/registry/observations.json');
const display=read('data/indicators/registry/worldbank-display.json');
const backfill=read('data/indicators/seed/pulse-history-backfill.json');

const byCode=new Map(series.map(s=>[s.series_code,s]));
const counts=new Map();
for(const o of observations)counts.set(o.series_id,(counts.get(o.series_id)||0)+1);
for(const row of backfill){
  const s=byCode.get(row.series_code);
  if(!s)throw new Error(`PULSE_HISTORY unknown backfill series ${row.series_code}`);
  const duplicate=observations.some(o=>o.series_id===s.series_id&&o.period_start===row.period_start&&o.period_end===row.period_end);
  if(!duplicate)counts.set(s.series_id,(counts.get(s.series_id)||0)+1);
}

const core=[
  'KDA-CPI-YOY-KEN','KDA-USDKES-MONTHLY-AVG-KEN','KDA-WB-NY-GDP-MKTP-CD-KEN',
  'KDA-WB-NY-GDP-PCAP-CD-KEN','KDA-CBR-KEN','KDA-TBILL91-MONTHLY-AVG-KEN',
  'KDA-POP-TOTAL-KEN','KDA-VOTERS-KEN'
];
const ids=new Set();
for(const code of core){
  const s=byCode.get(code);if(!s)throw new Error(`PULSE_HISTORY missing core series ${code}`);ids.add(s.series_id);
}
for(const card of display.cards||[]){if(card.series_id)ids.add(card.series_id);if(card.comparable_alternate_series_id)ids.add(card.comparable_alternate_series_id);}

const gaps=[];
for(const id of ids){
  const s=series.find(row=>row.series_id===id);
  const count=counts.get(id)||0;
  if(count<2)gaps.push(`${s?.series_code||id}: ${count}`);
}
if(gaps.length)throw new Error(`PULSE_HISTORY singleton/missing series:\n${gaps.join('\n')}`);
console.log(`PULSE_HISTORY_OK ${ids.size} Pulse-visible series have >=2 source-backed observations`);
