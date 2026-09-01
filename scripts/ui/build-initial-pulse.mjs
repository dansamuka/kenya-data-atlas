import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const outPath=path.join(root,'data/ui/initial-pulse.json');

const series=readJson('data/indicators/registry/series.json');
const canonicalObservations=readJson('data/indicators/registry/observations.json');
const pulseBackfillPath='data/indicators/seed/pulse-history-backfill.json';
const pulseBackfill=fs.existsSync(path.join(root,pulseBackfillPath))?readJson(pulseBackfillPath):[];
const seriesByCode=new Map(series.map(row=>[row.series_code,row]));
const observations=[...canonicalObservations];
const seenPeriods=new Set(canonicalObservations.map(o=>`${o.series_id}|${o.period_start}|${o.period_end}`));

// Pulse history is source-backed only. The supplemental file exists for older
// official national observations that pre-date the first canonical seed load.
// It never overwrites a canonical observation and is keyed to an existing
// published series so the Series page and Pulse can share the same history.
for(const row of pulseBackfill){
  const s=seriesByCode.get(row.series_code);
  if(!s)throw new Error(`Pulse history backfill missing series ${row.series_code}`);
  const key=`${s.series_id}|${row.period_start}|${row.period_end}`;
  if(seenPeriods.has(key))continue;
  observations.push({
    series_id:s.series_id,
    period_label:row.period_label,
    period_start:row.period_start,
    period_end:row.period_end,
    period_type:row.period_type,
    value:row.value,
    source_url:row.source_url,
    badge:row.source_class==='external'?'E':({direct:'A',aggregated:'B',interpolated:'C',modelled:'D'}[row.geographic_method]||'A'),
    notes:row.notes||''
  });
  seenPeriods.add(key);
}

const specs=[
  {series_code:'KDA-CPI-YOY-KEN',label:'Consumer price inflation',unit_code:'percent',suffix:'%',source:'KNBS',badge:'A',category:'economy',hero:true,accent:'gold'},
  {series_code:'KDA-USDKES-MONTHLY-AVG-KEN',label:'USD / KES',unit_code:'kes_per_usd',suffix:'',source:'CBK',badge:'A',category:'economy',hero:true,accent:'red'},
  {series_code:'KDA-WB-NY-GDP-MKTP-CD-KEN',label:'GDP',unit_code:'usd',suffix:'',source:'World Bank WDI',badge:'B',category:'economy',hero:true,accent:'green'},
  {series_code:'KDA-WB-NY-GDP-PCAP-CD-KEN',label:'GDP per capita',unit_code:'usd_per_person',suffix:'',source:'World Bank WDI',badge:'B',category:'economy',hero:true,accent:'blue'},
  {series_code:'KDA-CBR-KEN',label:'Central Bank Rate',unit_code:'percent',suffix:'%',source:'CBK',badge:'A',category:'institutions'},
  {series_code:'KDA-TBILL91-MONTHLY-AVG-KEN',label:'91-day Treasury bill',unit_code:'percent',suffix:'%',source:'CBK',badge:'A',category:'economy'},
  {series_code:'KDA-POP-TOTAL-KEN',label:'Population',unit_code:'persons',suffix:'',source:'KNBS',badge:'A',category:'social'},
  {series_code:'KDA-VOTERS-KEN',label:'Registered voters',unit_code:'persons',suffix:'',source:'IEBC',badge:'A',category:'institutions'}
];

const cards=specs.map(spec=>{
  const seriesRow=series.find(row=>row.series_code===spec.series_code);
  if(!seriesRow) throw new Error(`Initial pulse missing series ${spec.series_code}`);
  const history=observations
    .filter(o=>o.series_id===seriesRow.series_id)
    .sort((a,b)=>String(a.period_end).localeCompare(String(b.period_end)))
    .map(o=>({
      period_label:o.period_label,
      period_start:o.period_start,
      period_end:o.period_end,
      value:o.value,
      source_url:o.source_url
    }));
  if(!history.length) throw new Error(`Initial pulse missing ${spec.series_code}`);
  const latestEnd=new Date(history.at(-1).period_end);
  const cutoff=new Date(latestEnd);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-5);
  const fiveYearHistory=history.filter(o=>new Date(o.period_end)>=cutoff);
  // Sparse official series (for example decennial censuses) should still show
  // a real historical trajectory rather than collapsing to one latest point.
  const displayHistory=fiveYearHistory.length>=2?fiveYearHistory:history.slice(-Math.min(6,history.length));
  return {...spec,history:displayHistory,available_observation_count:history.length};
});

const output={
  meta:{
    schema_version:1,
    purpose:'Compact first-paint display product. Heavy canonical registries remain authoritative and load only on demand.',
    generated_from:'data/indicators/registry/series.json + observations.json + official Pulse history backfill',
    card_count:cards.length
  },
  cards
};

fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(`INITIAL_PULSE_BUILT ${cards.length} cards`);
