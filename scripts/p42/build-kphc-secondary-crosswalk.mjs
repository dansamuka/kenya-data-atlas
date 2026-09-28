import fs from 'node:fs';

function parseCsv(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"') q=false;
      else cell+=ch;
    }else{
      if(ch==='"') q=true;
      else if(ch===','){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell='';}
      else cell+=ch;
    }
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const head=rows.shift();
  return rows.filter(r=>r.some(x=>x!=='')).map(r=>Object.fromEntries(head.map((h,j)=>[h,r[j]??''])));
}
const probe=JSON.parse(fs.readFileSync('data/p42/kphc-subcounty-crosswalk-probe.json','utf8'));
const geos=JSON.parse(fs.readFileSync('data/geography/registry/geographies.json','utf8'));
const xwalk=parseCsv(fs.readFileSync('data/p42/reference/kenya-eie-locations-match.csv','utf8'));

const kda=new Map();
for(const g of geos){
  if(g.level!=='constituency') continue;
  const p='KE'+String(g.county_code).padStart(3,'0')+String(g.constituency_code).padStart(3,'0');
  if(kda.has(p)) throw new Error('duplicate derived external PCode '+p);
  kda.set(p,g);
}
const bySource=new Map();
for(const r of xwalk){
  const s=String(r.sub_county_pcode||'').trim();
  const t=String(r.adm2_pcode||'').trim();
  if(!s||!t) continue;
  if(!bySource.has(s)) bySource.set(s,[]);
  bySource.get(s).push(r);
}
const rows=[];
for(const r of probe.rows??[]){
  const p=r.source_subcounty_pcode;
  const matches=p ? (bySource.get(p)||[]) : [];
  const targets=[...new Set(matches.map(x=>x.adm2_pcode).filter(Boolean))];
  const target=targets.length===1 ? targets[0] : null;
  const geo=target ? kda.get(target) : null;
  const countyOk=geo ? Number(geo.county_code)===Number(String(target).slice(2,5)) : false;
  rows.push({
    dataset:r.dataset,indicator_id:r.indicator_id,source_county:r.source_county,source_subcounty:r.source_subcounty,
    source_subcounty_pcode:p??null,crosswalk_row_count:matches.length,unique_target_pcodes:targets,
    target_adm2_pcode:target,target_geo_code:geo?.geo_code??null,target_constituency:geo?.name??null,
    origin_values:[...new Set(matches.map(x=>x.origin).filter(Boolean))],
    passes:Boolean(p && target && geo && countyOk),
    status:!p?'blocked_missing_source_pcode':targets.length===0?'unmatched':targets.length>1?'blocked_ambiguous_target':!geo?'blocked_target_not_in_kda':'pass'
  });
}
const passing=rows.filter(r=>r.passes);
const out={
 schema_version:'kda.p42.kphc-secondary-pcode-crosswalk.v1',
 source:{
   repository:'kenya-eie-wg/kenya_locations',
   path:'data/locations_match.csv',
   pinned_blob_sha:'1537272254d8022661462cd8958d5df9972ddf37',
   role:'secondary documented subcounty-to-constituency PCode crosswalk; not an official KNBS or IEBC boundary instrument'
 },
 rule:'A source sub-county PCode may advance only when the pinned crosswalk maps it to exactly one constituency/Admin-2 PCode and that target resolves uniquely to the KDA constituency registry.',
 summary:{
   source_rows:xwalk.length,probe_rows:rows.length,passing_rows:passing.length,
   unmatched_or_blocked_rows:rows.length-passing.length,
   unique_source_pcodes_passing:new Set(passing.map(r=>r.source_subcounty_pcode)).size,
   unique_target_constituencies_passing:new Set(passing.map(r=>r.target_geo_code)).size
 },
 rows
};
fs.writeFileSync('data/p42/kphc-secondary-pcode-crosswalk.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.summary,null,2));
