import fs from 'node:fs';
const o=JSON.parse(fs.readFileSync('data/p42/kphc-secondary-pcode-crosswalk.json','utf8'));
const failures=[];
if(o.source?.pinned_blob_sha!=='1537272254d8022661462cd8958d5df9972ddf37') failures.push('crosswalk blob not pinned');
const seen=new Map();
for(const r of o.rows??[]){
 if(r.passes){
   if(!r.source_subcounty_pcode||!r.target_adm2_pcode||!r.target_geo_code) failures.push('passing row missing identity');
   if((r.unique_target_pcodes??[]).length!==1) failures.push('passing row not unique '+r.source_subcounty_pcode);
   const old=seen.get(r.source_subcounty_pcode);
   if(old && old!==r.target_geo_code) failures.push('source pcode maps to multiple KDA geographies '+r.source_subcounty_pcode);
   seen.set(r.source_subcounty_pcode,r.target_geo_code);
 }
}
if(failures.length){console.error('FAIL: P42 secondary PCode crosswalk\n - '+failures.join('\n - '));process.exit(1);}
console.log('PASS: secondary PCode crosswalk rows='+o.summary.passing_rows+' unique source pcodes='+o.summary.unique_source_pcodes_passing);
