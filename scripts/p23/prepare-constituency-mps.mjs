import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SOURCE='https://www.parliament.go.ke/the-national-assembly/mps';
const OUT='data/p23/source/constituency-mps-13th-parliament.json';
const ROLE_EVIDENCE='data/p23/source/parliament-seat-role-evidence.json';
const UA='Kenya-Data-Atlas-P23/1.0 (+https://github.com/dansamuka/kenya-data-atlas)';
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 MP prepare: ${msg}`);};
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const decode=s=>String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#0*39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&ndash;|&mdash;/gi,'-').replace(/&#x2019;|&#8217;/gi,"'").replace(/&#x2013;|&#8211;/gi,'-');
const text=s=>decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const norm=s=>text(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\bCONSTITUENCY\b/g,'').replace(/[^A-Z0-9]+/g,'').trim();
const personNorm=s=>text(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\b(HON|HONOURABLE|DR|PROF|MP|CBS|OGW|MBS|COL|RTD)\b/g,' ').replace(/[^A-Z0-9]+/g,'').trim();
const labelNorm=s=>text(s).toLowerCase().replace(/[^a-z]+/g,'');
const absoluteUrl=href=>href?.startsWith('http')?href:new URL(href||'',SOURCE).href;
const regexEscape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

const [allGeos,roleEvidence]=await Promise.all([readJson('data/geography/registry/geographies.json'),readJson(ROLE_EVIDENCE)]);
const geos=allGeos.filter(g=>g.level==='constituency'),counties=allGeos.filter(g=>g.level==='county');
assert(geos.length===290,'canonical constituency registry must contain 290 rows');
const countyByCode=new Map(counties.map(g=>[g.geo_code,g.name]));
const expectedCounty=r=>countyByCode.get(String(r.geo_code).match(/^KEN-C\d{3}/)?.[0]||'')||'';
const canonical=new Map();for(const g of geos){const k=norm(g.name);assert(k&&!canonical.has(k),`canonical normalized name collision: ${g.name}`);canonical.set(k,g);}
const aliases=new Map([
  ['CHUKAIGAMBANGOMBE','CHUKAIGAMBANGOM'],
  ['SUBANORTH','MBITA'],
  ['SUBASOUTH','SUBA'],
  ['KAMKUNJI','KAMUKUNJI'],
  ['KILIFINORTH','KILIFINORTH'],['KILIFISOUTH','KILIFISOUTH'],['KITUTUCHACHENORTH','KITUTUCHACHENORTH'],['KITUTUCHACHESOUTH','KITUTUCHACHESOUTH'],['HOMABAYTOWN','HOMABAYTOWN'],['OLJOROOROK','OLJOROOROK'],['MTELGON','MTELGON']
]);
const matchKey=s=>aliases.get(norm(s))||norm(s);
const roleMap=new Map((roleEvidence.evidence||[]).map(e=>[`${norm(e.target_constituency)}|${personNorm(e.member_name)}`,e]));
const seatRole=r=>roleMap.get(`${norm(r.constituency)}|${personNorm(r.member_name)}`)||null;
const countyMatches=r=>Boolean(r.published_county&&expectedCounty(r)&&norm(r.published_county)===norm(expectedCounty(r)));
const explicitElected=r=>/^ELECTED$/i.test(r.status||'');

function tableHeaders(html){
  const hr=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]).find(row=>/<th\b/i.test(row)&&/constituency/i.test(text(row)));
  if(!hr)return null;
  const labels=[...hr.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>labelNorm(m[1]));
  const idx=(...n)=>labels.findIndex(l=>n.some(x=>l.includes(x)));
  return {member:idx('member','name'),county:idx('county'),constituency:idx('constituency'),party:idx('party'),status:idx('status')};
}
function rowFields(row,h){
  const raw=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(m=>({attrs:m[1],html:m[2],value:text(m[2])}));
  if(raw.length<3)return null;
  const labels=raw.map(c=>{const m=c.attrs.match(/(?:data-label|headers|aria-label)\s*=\s*["']([^"']+)["']/i);return m?labelNorm(m[1]):'';});
  let ci=labels.findIndex(l=>l.includes('constituency'));if(ci<0&&h?.constituency>=0)ci=h.constituency;if(ci<0||ci>=raw.length)return null;
  const cells=raw.map(x=>x.value),lv=n=>{const i=labels.findIndex(l=>l.includes(n));return i>=0?cells[i]:'';};
  const constituency=cells[ci]||'';
  let member=lv('member')||lv('name'),party=lv('party'),county=lv('county'),status=lv('status');
  if(!member&&h?.member>=0)member=cells[h.member]||'';if(!party&&h?.party>=0)party=cells[h.party]||'';if(!county&&h?.county>=0)county=cells[h.county]||'';if(!status&&h?.status>=0)status=cells[h.status]||'';
  if(!member)member=cells.find((v,i)=>i!==ci&&/^HON\.?\s/i.test(v))||cells.slice(0,ci).filter(Boolean).at(-1)||'';
  if(!status)status=cells.find(v=>/^(ELECTED|NOMINATED)$/i.test(v))||'';
  if(!party){const ex=new Set([member,county,constituency,status,'More...','More..','More.','More']);party=cells.slice(ci+1).find(v=>v&&!ex.has(v)&&!/^(ELECTED|NOMINATED)$/i.test(v)&&v.length<=45)||'';}
  const mi=member?cells.findIndex(v=>v===member):-1,pm=(mi>=0?raw[mi]?.html:row).match(/<a\b[^>]*href=["']([^"']+)["']/i);
  return {member,county,constituency,party,status,profile_url:pm?absoluteUrl(pm[1]):'',raw:cells};
}
async function confirmsConstituencySeat(row){
  if(!row.profile_url)return false;
  const res=await fetch(row.profile_url,{headers:{'User-Agent':UA,'Accept':'text/html'}});assert(res.ok,`official profile fetch failed for ${row.member_name} (${res.status})`);
  const body=text(await res.text()),name=regexEscape(row.constituency).replace(/\s+/g,'\\s+');
  return [new RegExp(`Member\\s+of\\s+Parliament\\s*[,–-]?\\s*${name}\\s+Constituency`,'i'),new RegExp(`Member\\s+of\\s+Parliament\\s+for\\s+${name}(?:\\s+Constituency)?`,'i'),new RegExp(`Member\\s+for\\s+${name}\\s+Constituency`,'i')].some(p=>p.test(body));
}
const quality=r=>100*Number(explicitElected(r))+20*Number(countyMatches(r))+5*Number(seatRole(r)?.seat_role==='constituency_mp')-100*Number(seatRole(r)?.seat_role==='county_woman_representative')+2*Number(Boolean(r.profile_url))+Number(Boolean(r.party));

const found=[];let emptyPages=0;
for(let page=0;page<60;page++){
  const url=`${SOURCE}?field_employment_history_value=&field_name_value=+&field_parliament_value=2022&order=field_constituency&page=${page}&sort=asc`;
  const res=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'}});assert(res.ok,`official roster page ${page} fetch failed (${res.status})`);
  const html=await res.text(),h=tableHeaders(html),trs=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);let n=0;
  for(const tr of trs){
    const f=rowFields(tr,h);if(!f)continue;const geo=canonical.get(matchKey(f.constituency));if(!geo)continue;
    if(/^NOMINATED$/i.test(f.status||''))continue;
    assert(f.member,`matched ${f.constituency} but member name missing; cells=${f.raw.join(' | ')}`);
    const r={geo_code:geo.geo_code,constituency_code:Number(geo.constituency_code),constituency:geo.name,published_county:f.county,published_constituency:f.constituency,member_name:f.member,party:f.party,party_source_status:f.party?'published':'source_blank',status:f.status,status_source_state:f.status?'published':'source_blank',source_page:url,profile_url:f.profile_url,geography_crosswalk:matchKey(f.constituency)!==norm(f.constituency)?`${f.constituency} -> ${geo.name}`:''};
    r.expected_county=expectedCounty(r);r.county_reconciliation=r.published_county?(countyMatches(r)?'match':'mismatch'):'source_blank';found.push(r);n++;
  }
  if(n===0)emptyPages++;else emptyPages=0;if(page>35&&emptyPages>=3)break;
}
const grouped=new Map();for(const r of found){if(!grouped.has(r.geo_code))grouped.set(r.geo_code,[]);const g=grouped.get(r.geo_code);if(!g.some(x=>x.member_name===r.member_name&&x.party===r.party&&x.published_county===r.published_county&&x.status===r.status))g.push(r);}
const selected=[],collisionResolutions=[];
for(const geo of geos){
  let c=grouped.get(geo.geo_code)||[];if(c.length===0)continue;
  const nonCwr=c.filter(r=>seatRole(r)?.seat_role!=='county_woman_representative');if(nonCwr.length)c=nonCwr;
  const max=Math.max(...c.map(quality)),top=c.filter(r=>quality(r)===max);
  if(top.length===1){const kept=top[0];kept.source_role_resolution=c.length===1?'unique_live_roster_row':'source_quality_precedence';selected.push(kept);if(c.length>1)collisionResolutions.push({geo_code:geo.geo_code,constituency:geo.name,kept_member:kept.member_name,rejected_candidates:c.filter(x=>x!==kept).map(x=>({member_name:x.member_name,status:x.status||'',published_county:x.published_county,reason:'lower_official_source_quality_or_role_conflict'}))});continue;}
  const roleCons=top.filter(r=>seatRole(r)?.seat_role==='constituency_mp');if(roleCons.length===1){const kept=roleCons[0];kept.source_role_resolution='official_parliament_seat_role_evidence';selected.push(kept);continue;}
  const prof=[];for(const r of top)if(await confirmsConstituencySeat(r))prof.push(r);assert(prof.length===1,`ambiguous official roster resolution for ${geo.geo_code} ${geo.name}: ${top.map(x=>`${x.member_name}:${x.status||'blank'}:${x.published_county}`).join(' / ')}`);const kept=prof[0];kept.source_role_resolution='official_profile_explicit_constituency_role';selected.push(kept);
}
const rows=selected.sort((a,b)=>a.constituency_code-b.constituency_code),missing=geos.filter(g=>!rows.some(r=>r.geo_code===g.geo_code)).map(g=>`${g.constituency_code}:${g.name}`);
assert(rows.length===290,`expected 290 constituency MP identities; got ${rows.length}; missing=${missing.slice(0,30).join('|')}`);
assert(new Set(rows.map(r=>r.constituency_code)).size===290,'duplicate constituency codes after official-source resolution');assert(rows.every(r=>r.member_name&&r.source_page),'incomplete MP identity row');
const snapshot={schema_version:'kda.p23.constituency-mp-source.v1',source_authority:'Parliament of Kenya — National Assembly',source_url:SOURCE,parliamentary_session:'13th Parliament',source_as_of_label:'12 Aug 2026',retrieval_note:'MP identity is taken from the live official Parliament roster, using the constituency-sorted 2022 session view for deterministic coverage. Explicit Elected status is preferred when duplicate rows exist, but a blank published status is preserved because this tranche measures office-holder identity. Nominated rows and official CWR-classified rows are excluded. Current Parliament labels Suba North/Suba South are crosswalked to the Atlas canonical 2012 registry labels Mbita/Suba; published labels are retained. Published blank party/status fields remain source_blank; no person, party or status is inferred.',coverage:{constituencies:rows.length,explicit_elected:rows.filter(explicitElected).length,status_source_blank:rows.filter(r=>!r.status).length,party_published:rows.filter(r=>r.party).length,party_source_blank:rows.filter(r=>!r.party).length,county_match:rows.filter(countyMatches).length,crosswalked_names:rows.filter(r=>r.geography_crosswalk).length,resolved_collisions:collisionResolutions.length},role_evidence_source:roleEvidence.source_url,collision_resolutions:collisionResolutions,rows};
await mkdir(path.join(root,path.dirname(OUT)),{recursive:true});await writeFile(path.join(root,OUT),JSON.stringify(snapshot,null,2)+'\n');
console.log(`P23_MP_SOURCE_OK constituencies=${rows.length} explicit_elected=${snapshot.coverage.explicit_elected} status_source_blank=${snapshot.coverage.status_source_blank} crosswalked=${snapshot.coverage.crosswalked_names}`);
