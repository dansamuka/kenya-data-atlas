import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const series=read('data/indicators/registry/series.json');
const observations=read('data/indicators/registry/observations.json');
const backfill=read('data/indicators/seed/pulse-history-backfill.json');
const byCode=new Map(series.map(s=>[s.series_code,s]));
const seen=new Set(observations.map(o=>`${o.series_id}|${o.period_start}|${o.period_end}`));
let added=0;
for(const row of backfill){
  const s=byCode.get(row.series_code);
  if(!s)throw new Error(`Missing published series ${row.series_code}`);
  const key=`${s.series_id}|${row.period_start}|${row.period_end}`;
  if(seen.has(key))continue;
  const template=observations.find(o=>o.series_id===s.series_id);
  observations.push({...template,
    observation_id:`pulse-history-${row.series_code}-${row.period_start}`,
    period_start:row.period_start,period_end:row.period_end,period_type:row.period_type,period_label:row.period_label,value:row.value,
    geographic_method:row.geographic_method,statistical_status:row.statistical_status,source_class:row.source_class,badge:'A',
    source_release_id:'',source_url:row.source_url,published_at:'',notes:row.notes||'',supersedes_observation_id:''
  });
  seen.add(key);added+=1;
}
for(const s of series){
  const own=observations.filter(o=>o.series_id===s.series_id).sort((a,b)=>String(a.period_start).localeCompare(String(b.period_start)));
  if(!own.length)continue;
  s.start_period=own[0].period_label;s.end_period=own.at(-1).period_label;s.latest_observation_id=own.at(-1).observation_id;s.observation_count=own.length;
}
write('data/indicators/registry/observations.json',observations);
write('data/indicators/registry/series.json',series);
console.log(`PULSE_HISTORY_CANONICAL_OK added=${added}`);
