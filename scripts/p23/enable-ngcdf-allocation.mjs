import { readFile, writeFile } from 'node:fs/promises';

const pkg=JSON.parse(await readFile('package.json','utf8'));
const appendAfter=(value,needle,addition)=>value.includes(addition)?value:value.replace(needle,`${needle} && ${addition}`);
pkg.scripts['catalogue:build']=appendAfter(pkg.scripts['catalogue:build'],'node scripts/p23/build-constituency-mps.mjs catalogue','node scripts/p23/build-ngcdf-allocation.mjs catalogue');
pkg.scripts['indicators:build']=appendAfter(pkg.scripts['indicators:build'],'node scripts/p23/build-constituency-mps.mjs indicators','node scripts/p23/build-ngcdf-allocation.mjs indicators');
if(!pkg.scripts['p23:validate'].includes('validate-ngcdf-allocation.mjs'))pkg.scripts['p23:validate']+=' && node scripts/p23/validate-ngcdf-allocation.mjs';
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('P23_NGCDF_ALLOCATION_BUILD_WIRING_OK');
