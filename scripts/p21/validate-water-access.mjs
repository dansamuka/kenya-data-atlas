import fs from 'node:fs';

const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 water validation: ${msg}`);};
const CODE='IND-WATER-ACCESS';
const PREFIX='KDA-P21-IMPROVED-WATER-';
const IMPROVED_FIELDS=['Protected Spring','Protected Well','Borehole/ Tube well','Piped into dwelling','Piped to yard/ Plot','Bottled water','Rain/ Harvested water','Public tap/ Standpipe'];

function parseCsv(text){
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  const h=rows.shift(); return rows.filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])));
}
const derive=r=>Number(IMPROVED_FIELDS.map(f=>Number(r[f])).reduce((a,b)=>a+b,0).toFixed(1));

try{
  const indicators=j('data/indicators/registry/indicators.json');
  const series=j('data/indicators/registry/series.json');
  const observations=j('data/indicators/registry/observations.json');
  const ledger=j('data/completeness/slot-ledger.json');
  const summary=j('data/completeness/summary.json');
  const queue=j('data/completeness/p21-work-queue.json');
  const sourceRows=parseCsv(fs.readFileSync('data/p21/source/kphc-2019-drinking-water-county-subcounty.csv','utf8'));
  const national=sourceRows.find(r=>String(r['County/ Sub-County']).trim().toUpperCase()==='KENYA');
  assert(national&&derive(national)===64.8,`national source reconciliation must equal 64.8, got ${national?derive(national):'missing'}`);

  const indicator=indicators.find(i=>i.indicator_code===CODE);
  assert(indicator,'indicator missing');
  assert(indicator.active===true&&indicator.lifecycle_status==='active','indicator must be active after promotion');
  assert(indicator.requires_sampling_uncertainty===false,'census indicator must not require sampling uncertainty');
  const waterSeries=series.filter(s=>s.indicator_id===indicator.indicator_id&&String(s.series_code).startsWith(PREFIX));
  assert(waterSeries.length===47,`expected 47 water series, got ${waterSeries.length}`);
  const ids=new Set(waterSeries.map(s=>s.series_id));
  const waterObs=observations.filter(o=>ids.has(o.series_id));
  assert(waterObs.length===47,`expected 47 water observations, got ${waterObs.length}`);
  assert(waterObs.every(o=>o.badge==='B'&&o.source_class==='official'),'all water observations must be official Badge B transparent derivations');
  assert(waterObs.every(o=>Number.isFinite(Number(o.value))&&Number(o.value)>=0&&Number(o.value)<=100),'water values must be valid percentages');
  assert(waterObs.every(o=>!o.crosswalk_id),'water observations must not use a geographic crosswalk');

  const rows=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code===CODE);
  assert(rows.length===47,`expected 47 governed county slots, got ${rows.length}`);
  assert(rows.every(r=>r.resolved===true&&r.status==='published_derived'),`all 47 water slots must resolve as published_derived`);
  assert((summary.by_completion_phase?.P21||0)===329,`P21 remaining must be 329, got ${summary.by_completion_phase?.P21}`);
  assert(summary.resolved_slots===3479,`resolved slots expected 3479, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots===16636,`unresolved slots expected 16636, got ${summary.unresolved_slots}`);
  assert(summary.unknown_missing===0,'unknown_missing must remain zero');
  assert(queue.remaining_slots===329&&queue.family_count===7,`queue expected 329 slots / 7 families, got ${queue.remaining_slots}/${queue.family_count}`);
  assert(!Object.hasOwn(queue.family_counts||{},CODE),'water family must leave P21 work queue');

  const obsByGeo=new Map(rows.map(r=>[r.geo_code,r]));
  assert(Number(obsByGeo.get('KEN-C001')?.value)===55.6,`Mombasa expected 55.6, got ${obsByGeo.get('KEN-C001')?.value}`);
  assert(Number(obsByGeo.get('KEN-C002')?.value)===56.2,`Kwale transparent subtotal expected 56.2, got ${obsByGeo.get('KEN-C002')?.value}`);
  assert(Number(obsByGeo.get('KEN-C003')?.value)===71.0,`Kilifi transparent subtotal expected 71.0, got ${obsByGeo.get('KEN-C003')?.value}`);

  console.log('P21_WATER_ACCESS_47_OK badge=B crosswalk=false national_anchor=64.8');
  console.log(`P21_WATER_COMPLETENESS_OK resolved=${summary.resolved_slots} remaining=${queue.remaining_slots} families=${queue.family_count}`);
}catch(error){console.error(error.message||error);process.exit(1);}
