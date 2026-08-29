import fs from 'node:fs';
const file='data/indicators/seed/series.json';
const rows=JSON.parse(fs.readFileSync(file,'utf8'));
const prefixes=['KDA-P05-AGRI-GVA-','KDA-P05-MANUFACTURING-GVA-'];
let changed=0;
for(const row of rows){
  if(prefixes.some(prefix=>String(row.code).startsWith(prefix))){
    row.price_basis='nominal';
    changed++;
  }
}
if(changed!==94)throw new Error(`P05 GVA price-basis fix expected 94 series, got ${changed}`);
fs.writeFileSync(file,JSON.stringify(rows,null,2)+'\n');
console.log(`P05_GVA_PRICE_BASIS_OK series=${changed} price_basis=nominal`);
