import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SOURCE='https://www.parliament.go.ke/the-national-assembly/mps';
const OUT='data/p23/source/constituency-mps-13th-parliament.json';
const UA='Kenya-Data-Atlas-P23/1.0 (+https://github.com/dansamuka/kenya-data-atlas)';
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 MP prepare: ${msg}`);};
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const decode=s=>String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#0*39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&ndash;|&mdash;/gi,'-').replace(/&#x2019;|&#8217;/gi,"'").replace(/&#x2013;|&#8211;/gi,'-');
const text=s=>decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const norm=s=>text(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\bCONSTITUENCY\b/g,'').replace(/[^A-Z0-9]+/g,'').trim();
const labelNorm=s=>text(s).toLowerCase().replace(/[^a-z]+/g,'');

const geos=(await readJson('data/geography/registry/geographies.json')).filter(g=>g.level==='constituency');
assert(geos.length===290,'canonical constituency registry must contain 290 rows');
const canonical=new Map();
for(const g of geos){const key=norm(g.name);assert(key&&!canonical.has(key),`canonical normalized name collision: ${g.name}`);canonical.set(key,g);}
const aliases=new Map([
  ['CHUKAIGAMBANGOMBE','CHUKAIGAMBANGOMBE'],
  ['KILIFINORTH','KILIFINORTH'],['KILIFISOUTH','KILIFISOUTH'],
  ['KITUTUCHACHENORTH','KITUTUCHACHENORTH'],['KITUTUCHACHESOUTH','KITUTUCHACHESOUTH'],
  ['HOMABAYTOWN','HOMABAYTOWN'],['OLJOROOROK','OLJOROOROK']
]);
const matchKey=s=>aliases.get(norm(s))||norm(s);

function tableHeaders(html){
  const headerRow=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m=>m[1])
    .find(row=>/<th\b/i.test(row)&&/constituency/i.test(text(row)));
  if(!headerRow)return null;
  const labels=[...headerRow.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>labelNorm(m[1]));
  const indexFor=(...needles)=>labels.findIndex(label=>needles.some(n=>label.includes(n)));
  const h={member:indexFor('member','name'),county:indexFor('county'),constituency:indexFor('constituency'),party:indexFor('party'),status:indexFor('status')};
  return h.constituency>=0?h:null;
}

function rowFields(row,headers){
  const raw=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(m=>({attrs:m[1],value:text(m[2])}));
  if(raw.length<4)return null;
  let constituencyIndex=-1;
  const labels=raw.map(cell=>{
    const m=cell.attrs.match(/(?:data-label|headers|aria-label)\s*=\s*["']([^"']+)["']/i);
    return m?labelNorm(m[1]):'';
  });
  constituencyIndex=labels.findIndex(label=>label.includes('constituency'));
  if(constituencyIndex<0&&headers?.constituency>=0)constituencyIndex=headers.constituency;
  if(constituencyIndex<0||constituencyIndex>=raw.length)return null;
  const cells=raw.map(x=>x.value);
  const constituency=cells[constituencyIndex]||'';
  const labelledValue=(needle)=>{const i=labels.findIndex(label=>label.includes(needle));return i>=0?cells[i]:'';};
  let member=labelledValue('member')||labelledValue('name');
  let party=labelledValue('party');
  let county=labelledValue('county');
  let status=labelledValue('status');
  if(!member&&headers?.member>=0)member=cells[headers.member]||'';
  if(!party&&headers?.party>=0)party=cells[headers.party]||'';
  if(!county&&headers?.county>=0)county=cells[headers.county]||'';
  if(!status&&headers?.status>=0)status=cells[headers.status]||'';
  if(!member)member=cells.find((value,i)=>i!==constituencyIndex&&/^HON\.?\s/i.test(value))||cells.slice(0,constituencyIndex).filter(Boolean).at(-1)||'';
  if(!status)status=cells.find(value=>/^(ELECTED|NOMINATED)$/i.test(value))||'';
  if(!party){
    const excluded=new Set([member,county,constituency,status,'More...','More..','More.','More']);
    party=cells.slice(constituencyIndex+1).find(value=>value&&!excluded.has(value)&&!/^(ELECTED|NOMINATED)$/i.test(value)&&value.length<=45)||'';
  }
  return {member,county,constituency,party,status,raw:cells};
}

const found=[]; let emptyPages=0;
for(let page=0;page<60;page++){
  const url=`${SOURCE}?field_employment_history_value=&field_name_value=&field_parliament_value=2022&page=${page}`;
  const res=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'}});
  assert(res.ok,`official roster page ${page} fetch failed (${res.status})`);
  const html=await res.text();
  const headers=tableHeaders(html);
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
  let pageMatches=0;
  for(const row of rows){
    const f=rowFields(row,headers);if(!f)continue;
    const key=matchKey(f.constituency),geo=canonical.get(key);
    if(!geo)continue;
    if(f.status&&f.status.toUpperCase()!=='ELECTED')continue;
    assert(f.member&&f.party,`matched ${f.constituency} but member/party missing on page ${page}; cells=${f.raw.join(' | ')}`);
    found.push({
      geo_code:geo.geo_code,
      constituency_code:Number(geo.constituency_code),
      constituency:geo.name,
      published_county:f.county,
      published_constituency:f.constituency,
      member_name:f.member,
      party:f.party,
      status:f.status||'Elected',
      source_page:url
    });
    pageMatches++;
  }
  if(pageMatches===0)emptyPages++; else emptyPages=0;
  if(page>30&&emptyPages>=3)break;
}

const byGeo=new Map();
for(const row of found){
  const prev=byGeo.get(row.geo_code);
  if(prev){
    const same=prev.member_name===row.member_name&&prev.party===row.party;
    assert(same,`conflicting official constituency rows for ${row.geo_code}: ${prev.member_name} / ${row.member_name}`);
  }else byGeo.set(row.geo_code,row);
}
const rows=[...byGeo.values()].sort((a,b)=>a.constituency_code-b.constituency_code);
const missing=geos.filter(g=>!byGeo.has(g.geo_code)).map(g=>`${g.constituency_code}:${g.name}`);
assert(rows.length===290,`expected 290 matched constituency MPs; got ${rows.length}; missing=${missing.slice(0,30).join('|')}`);
assert(new Set(rows.map(r=>r.constituency_code)).size===290,'duplicate constituency codes after reconciliation');
assert(rows.every(r=>r.member_name&&r.party&&r.source_page),'incomplete roster row');

const snapshot={
  schema_version:'kda.p23.constituency-mp-source.v1',
  source_authority:'Parliament of Kenya — National Assembly',
  source_url:SOURCE,
  parliamentary_session:'13th Parliament',
  source_as_of_label:'12 Aug 2026',
  retrieval_note:'Prepared from the official server-rendered National Assembly member roster using the explicit constituency column (never the county column). Member/party extraction tolerates inconsistent HTML cell labels but never relaxes the exact 290-constituency reconciliation. Nominated members and county women representatives are not constituency observations.',
  coverage:{constituencies:rows.length},
  rows
};
await mkdir(path.join(root,path.dirname(OUT)),{recursive:true});
await writeFile(path.join(root,OUT),JSON.stringify(snapshot,null,2)+'\n');
console.log(`P23_MP_SOURCE_OK constituencies=${rows.length} first=${rows[0].constituency} last=${rows.at(-1).constituency}`);
