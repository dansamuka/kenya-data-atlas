import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const outPath=path.join(root,'data/ui/initial-pulse.json');

const observations=readJson('data/indicators/seed/observations.json');
const specs=[
  {series_code:'KDA-CPI-YOY-KEN',label:'Consumer price inflation',unit_code:'percent',suffix:'%',source:'KNBS',badge:'A'},
  {series_code:'KDA-USDKES-KEN',label:'USD / KES',unit_code:'kes_per_usd',suffix:'',source:'External market reference',badge:'E'},
  {series_code:'KDA-CBR-KEN',label:'Central Bank Rate',unit_code:'percent',suffix:'%',source:'CBK',badge:'A'},
  {series_code:'KDA-TBILL91-KEN',label:'91-day Treasury bill',unit_code:'percent',suffix:'%',source:'CBK',badge:'A'},
  {series_code:'KDA-POP-TOTAL-KEN',label:'Population',unit_code:'persons',suffix:'',source:'KNBS',badge:'A'},
  {series_code:'KDA-VOTERS-KEN',label:'Registered voters',unit_code:'persons',suffix:'',source:'IEBC',badge:'A'}
];

const cards=specs.map(spec=>{
  const history=observations
    .filter(o=>o.series_code===spec.series_code)
    .sort((a,b)=>String(a.period_end).localeCompare(String(b.period_end)))
    .map(o=>({
      period_label:o.period_label,
      period_start:o.period_start,
      period_end:o.period_end,
      value:o.value,
      source_url:o.source_url
    }));
  if(!history.length) throw new Error(`Initial pulse missing ${spec.series_code}`);
  return {...spec,history};
});

const output={
  meta:{
    schema_version:1,
    purpose:'Compact first-paint display product. Heavy canonical registries remain authoritative and load only on demand.',
    generated_from:'data/indicators/seed/observations.json',
    card_count:cards.length
  },
  cards
};

fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
console.log(`INITIAL_PULSE_BUILT ${cards.length} cards`);
