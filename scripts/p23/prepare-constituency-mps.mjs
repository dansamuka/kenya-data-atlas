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

const found=[]; let emptyPages=0;
for(let page=0;page<60;page++){
  const url=`${SOURCE}?field_employment_history_value=&field_name_value=&field_parliament_value=2022&page=${page}`;
  const res=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'}});
  assert(res.ok,`official roster page ${page} fetch failed (${res.status})`);
  const html=await res.text();
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
  let pageMatches=0;
  for(const row of rows){
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
    if(cells.length<5)continue;
    const candidates=[];
    for(let i=0;i<cells.length;i++){const key=matchKey(cells[i]);if(canonical.has(key))candidates.push({i,key,geo:canonical.get(key)});}
    if(!candidates.length)continue;
    const constituency=candidates.find(x=>x.i>=2)||candidates[0];
    const member=cells.slice(0,constituency.i).find(x=>/^HON\.?\s/i.test(x))||cells[0];
    const after=cells.slice(constituency.i+1).filter(Boolean);
    const party=after.find(x=>x.length<=30&&!/^(ELECTED|NOMINATED|MORE\.?\.?)$/i.test(x))||'';
    const status=after.find(x=>/^(ELECTED|NOMINATED)$/i.test(x))||'';
    if(!member||!party)continue;
    if(status&&status.toUpperCase()!=='ELECTED')continue;
    found.push({
      geo_code:constituency.geo.geo_code,
      constituency_code:Number(constituency.geo.constituency_code),
      constituency:constituency.geo.name,
      published_constituency:cells[constituency.i],
      member_name:member,
      party,
      status:status||'Elected',
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
    assert(same,`conflicting official roster rows for ${row.geo_code}: ${prev.member_name} / ${row.member_name}`);
  }else byGeo.set(row.geo_code,row);
}
const rows=[...byGeo.values()].sort((a,b)=>a.constituency_code-b.constituency_code);
const missing=geos.filter(g=>!byGeo.has(g.geo_code)).map(g=>`${g.constituency_code}:${g.name}`);
assert(rows.length===290,`expected 290 matched constituency MPs; got ${rows.length}; missing=${missing.slice(0,20).join('|')}`);
assert(new Set(rows.map(r=>r.constituency_code)).size===290,'duplicate constituency codes after reconciliation');
assert(rows.every(r=>r.member_name&&r.party&&r.source_page),'incomplete roster row');

const snapshot={
  schema_version:'kda.p23.constituency-mp-source.v1',
  source_authority:'Parliament of Kenya — National Assembly',
  source_url:SOURCE,
  parliamentary_session:'13th Parliament',
  source_as_of_label:'12 Aug 2026',
  retrieval_note:'Prepared from the official server-rendered National Assembly member roster. Only rows reconciling to the canonical 290 constituency names are retained; nominated members and county women representatives are not constituency observations.',
  coverage:{constituencies:rows.length},
  rows
};
await mkdir(path.join(root,path.dirname(OUT)),{recursive:true});
await writeFile(path.join(root,OUT),JSON.stringify(snapshot,null,2)+'\n');
console.log(`P23_MP_SOURCE_OK constituencies=${rows.length} first=${rows[0].constituency} last=${rows.at(-1).constituency}`);
