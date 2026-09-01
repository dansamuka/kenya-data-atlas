import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const NAMESPACE='c9a6f7b2-3e1d-4a8f-9c2b-5d7e1f4a8b3c';
const uuid=name=>{
  const ns=Buffer.from(NAMESPACE.replaceAll('-',''),'hex');
  const hash=createHash('sha1').update(ns).update(name).digest();
  hash[6]=(hash[6]&0x0f)|0x50;hash[8]=(hash[8]&0x3f)|0x80;
  const h=hash.subarray(0,16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;
const rewriteCsv=(p,rows)=>{
  const file=path.join(root,p),fields=fs.readFileSync(file,'utf8').split(/\r?\n/,1)[0].split(',');
  fs.writeFileSync(file,[fields.join(','),...rows.map(row=>fields.map(f=>csvCell(row[f])).join(','))].join('\n')+'\n');
};
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
    observation_id:uuid(`observation:${row.series_code}:${row.period_start}:${row.period_end}`),
    period_start:row.period_start,period_end:row.period_end,period_type:row.period_type,period_label:row.period_label,value:row.value,
    geographic_method:row.geographic_method,statistical_status:row.statistical_status,source_class:row.source_class,badge:'A',
    source_release_id:'',source_url:row.source_url,published_at:'',notes:row.notes||'',supersedes_observation_id:'',
    vintage_id:uuid(`vintage:${row.series_code}:${row.period_start}:1`)
  });
  seen.add(key);added+=1;
}
observations.sort((a,b)=>String(a.series_id).localeCompare(String(b.series_id))||String(a.period_start).localeCompare(String(b.period_start))||String(a.period_end).localeCompare(String(b.period_end)));
for(const s of series){
  const own=observations.filter(o=>o.series_id===s.series_id).sort((a,b)=>String(a.period_start).localeCompare(String(b.period_start))||String(a.period_end).localeCompare(String(b.period_end)));
  if(!own.length)continue;
  s.start_period=own[0].period_label;s.end_period=own.at(-1).period_label;s.latest_observation_id=own.at(-1).observation_id;s.observation_count=own.length;
}
write('data/indicators/registry/observations.json',observations);
write('data/indicators/registry/series.json',series);
rewriteCsv('data/indicators/registry/observations.csv',observations);
rewriteCsv('data/indicators/registry/series.csv',series);
console.log(`PULSE_HISTORY_CANONICAL_OK added=${added} total_backfill=${backfill.length}`);
