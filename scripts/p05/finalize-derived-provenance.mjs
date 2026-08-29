import fs from 'node:fs';
const derivedPrefixes=['KDA-P05-AGRI-SHARE-','KDA-P05-MANUFACTURING-SHARE-','KDA-P05-MAIZE-YIELD-'];
const isDerived=code=>derivedPrefixes.some(prefix=>String(code).startsWith(prefix));
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const series=read('data/indicators/seed/series.json');
const observations=read('data/indicators/seed/observations.json');
let s=0,o=0;
for(const row of series)if(isDerived(row.code)){row.geographic_method='aggregated';row.transformation='ratio';s++;}
for(const row of observations)if(isDerived(row.series_code)){row.geographic_method='aggregated';row.source_class='official';o++;}
if(s!==47*3||o!==47*3)throw new Error(`P05 derived provenance expected 141 series/observations, got ${s}/${o}`);
write('data/indicators/seed/series.json',series);write('data/indicators/seed/observations.json',observations);
console.log(`P05_DERIVED_PROVENANCE_OK series=${s} observations=${o} badge=B-after-build`);
