import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SOURCE='https://www.parliament.go.ke/the-national-assembly/mps';
const OUT='data/p23/source/constituency-mps-13th-parliament.json';
const UA='Kenya-Data-Atlas-P23/1.0 (+https://github.com/dansamuka/kenya-data-atlas)';
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 MP final prepare: ${msg}`);};
const decode=s=>String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#0*39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&ndash;|&mdash;/gi,'-').replace(/&#x2019;|&#8217;/gi,"'").replace(/&#x2013;|&#8211;/gi,'-');
const text=s=>decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const norm=s=>text(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\bCONSTITUENCY\b/g,'').replace(/[^A-Z0-9]+/g,'');
const personNorm=s=>text(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\b(HON|HONOURABLE|DR|PROF|MP|CBS|OGW|MBS|COL|RTD)\b/g,' ').replace(/[^A-Z0-9]+/g,'');
const labelNorm=s=>text(s).toLowerCase().replace(/[^a-z]+/g,'');
const absolute=href=>href?.startsWith('http')?href:new URL(href||'',SOURCE).href;
const regexEscape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

const [allGeos,roles,fallbacks]=await Promise.all([
  read('data/geography/registry/geographies.json'),
  read('data/p23/source/parliament-seat-role-evidence.json'),
  read('data/p23/source/parliament-current-mp-fallbacks.json')
]);
const geos=allGeos.filter(g=>g.level==='constituency');
const counties=allGeos.filter(g=>g.level==='county');
assert(geos.length===290,'canonical constituency registry must contain 290 rows');
const countyByCode=new Map(counties.map(g=>[g.geo_code,g.name]));
const expectedCounty=g=>countyByCode.get(String(g.geo_code).match(/^KEN-C\d{3}/)?.[0]||'')||'';
const canonical=new Map(geos.map(g=>[norm(g.name),g]));
const aliases=new Map([
  ['CHUKAIGAMBANGOMBE','CHUKAIGAMBANGOM'],
  ['SUBANORTH','MBITA'],['SUBASOUTH','SUBA'],['KAMKUNJI','KAMUKUNJI'],
  ['EMBAKASSINORTH','EMBAKASINORTH'],
  ['KILIFINORTH','KILIFINORTH'],['KILIFISOUTH','KILIFISOUTH'],
  ['KITUTUCHACHENORTH','KITUTUCHACHENORTH'],['KITUTUCHACHESOUTH','KITUTUCHACHESOUTH'],
  ['HOMABAYTOWN','HOMABAYTOWN'],['OLJOROOROK','OLJOROOROK'],['MTELGON','MTELGON']
]);
const key=s=>aliases.get(norm(s))||norm(s);
const roleMap=new Map((roles.evidence||[]).map(e=>[`${norm(e.target_constituency)}|${personNorm(e.member_name)}`,e]));
const roleFor=(g,name)=>roleMap.get(`${norm(g.name)}|${personNorm(name)}`)||null;

function headers(html){
  const hr=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(x=>x[1]).find(r=>/<th\b/i.test(r)&&/constituency/i.test(text(r)));
  if(!hr)return null;
  const labs=[...hr.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(x=>labelNorm(x[1]));
  const ix=(...n)=>labs.findIndex(l=>n.some(x=>l.includes(x)));
  return {member:ix('member','name'),county:ix('county'),constituency:ix('constituency'),party:ix('party'),status:ix('status')};
}
function parseRow(row,h){
  const raw=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(m=>({attrs:m[1],html:m[2],value:text(m[2])}));if(raw.length<3)return null;
  const labs=raw.map(c=>{const m=c.attrs.match(/(?:data-label|headers|aria-label)\s*=\s*["']([^"']+)["']/i);return m?labelNorm(m[1]):'';});
  let ci=labs.findIndex(l=>l.includes('constituency'));if(ci<0&&h?.constituency>=0)ci=h.constituency;if(ci<0||ci>=raw.length)return null;
  const cells=raw.map(x=>x.value),lv=n=>{const i=labs.findIndex(l=>l.includes(n));return i>=0?cells[i]:'';};
  let member=lv('member')||lv('name'),county=lv('county'),party=lv('party'),status=lv('status');const constituency=cells[ci]||'';
  if(!member&&h?.member>=0)member=cells[h.member]||'';if(!county&&h?.county>=0)county=cells[h.county]||'';if(!party&&h?.party>=0)party=cells[h.party]||'';if(!status&&h?.status>=0)status=cells[h.status]||'';
  if(!member)member=cells.find((v,i)=>i!==ci&&/^HON\.?\s/i.test(v))||cells.slice(0,ci).filter(Boolean).at(-1)||'';
  if(!status)status=cells.find(v=>/^(ELECTED|NOMINATED)$/i.test(v))||'';
  if(!party){const ex=new Set([member,county,constituency,status,'More...','More..','More.','More']);party=cells.slice(ci+1).find(v=>v&&!ex.has(v)&&!/^(ELECTED|NOMINATED)$/i.test(v)&&v.length<=45)||'';}
  const mi=member?cells.findIndex(v=>v===member):-1,pm=(mi>=0?raw[mi]?.html:row).match(/<a\b[^>]*href=["']([^"']+)["']/i);
  return {member,county,constituency,party,status,profile_url:pm?absolute(pm[1]):''};
}
async function profileConfirms(row){
  if(!row.profile_url)return false;const res=await fetch(row.profile_url,{headers:{'User-Agent':UA,'Accept':'text/html'}});if(!res.ok)return false;
  const body=text(await res.text()),n=regexEscape(row.constituency).replace(/\s+/g,'\\s+');
  return [new RegExp(`Member\\s+of\\s+Parliament\\s*[,–-]?\\s*${n}\\s+Constituency`,'i'),new RegExp(`Member\\s+of\\s+Parliament\\s+for\\s+${n}(?:\\s+Constituency)?`,'i'),new RegExp(`Member\\s+for\\s+${n}\\s+Constituency`,'i')].some(p=>p.test(body));
}

const found=[];let blanks=0;
for(let page=0;page<60;page++){
  const url=`${SOURCE}?field_employment_history_value=&field_name_value=+&field_parliament_value=2022&order=field_constituency&page=${page}&sort=asc`;
  const res=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'}});assert(res.ok,`roster page ${page} fetch failed (${res.status})`);
  const html=await res.text(),h=headers(html),trs=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(x=>x[1]);let matched=0;
  for(const tr of trs){const f=parseRow(tr,h);if(!f)continue;const g=canonical.get(key(f.constituency));if(!g)continue;if(/^NOMINATED$/i.test(f.status||''))continue;if(!f.member)continue;
    found.push({geo_code:g.geo_code,constituency_code:Number(g.constituency_code),constituency:g.name,published_county:f.county,published_constituency:f.constituency,member_name:f.member,party:f.party,party_source_status:f.party?'published':'source_blank',status:f.status,status_source_state:f.status?'published':'source_blank',source_page:url,profile_url:f.profile_url,expected_county:expectedCounty(g),county_reconciliation:f.county&&norm(f.county)===norm(expectedCounty(g))?'match':f.county?'mismatch':'source_blank',geography_crosswalk:key(f.constituency)!==norm(f.constituency)?`${f.constituency} -> ${g.name}`:''});matched++;}
  if(matched===0)blanks++;else blanks=0;if(page>35&&blanks>=3)break;
}
const grouped=new Map();for(const r of found){if(!grouped.has(r.geo_code))grouped.set(r.geo_code,[]);const a=grouped.get(r.geo_code);if(!a.some(x=>x.member_name===r.member_name&&x.party===r.party&&x.published_county===r.published_county&&x.status===r.status))a.push(r);}
const selected=[];
for(const g of geos){let c=grouped.get(g.geo_code)||[];if(!c.length)continue;const nonCwr=c.filter(r=>roleFor(g,r.member_name)?.seat_role!=='county_woman_representative');if(nonCwr.length)c=nonCwr;
  const score=r=>100*Number(/^ELECTED$/i.test(r.status||''))+20*Number(r.county_reconciliation==='match')+5*Number(roleFor(g,r.member_name)?.seat_role==='constituency_mp')+2*Number(Boolean(r.profile_url))+Number(Boolean(r.party));
  const max=Math.max(...c.map(score)),top=c.filter(r=>score(r)===max);if(top.length===1){top[0].source_role_resolution=c.length===1?'unique_live_roster_row':'source_quality_precedence';selected.push(top[0]);continue;}
  const role=top.filter(r=>roleFor(g,r.member_name)?.seat_role==='constituency_mp');if(role.length===1){role[0].source_role_resolution='official_parliament_seat_role_evidence';selected.push(role[0]);continue;}
  const p=[];for(const r of top)if(await profileConfirms(r))p.push(r);assert(p.length===1,`unresolved live-roster collision for ${g.constituency_code}:${g.name}`);p[0].source_role_resolution='official_profile_explicit_constituency_role';selected.push(p[0]);
}
const selectedCodes=new Set(selected.map(r=>r.geo_code));const fallbackUsed=[];
for(const f of fallbacks.rows||[]){const g=canonical.get(norm(f.constituency));assert(g,`fallback target not canonical: ${f.constituency}`);if(selectedCodes.has(g.geo_code))continue;
  selected.push({geo_code:g.geo_code,constituency_code:Number(g.constituency_code),constituency:g.name,published_county:expectedCounty(g),published_constituency:g.name,member_name:f.member_name,party:f.party||'',party_source_status:f.party?'published':'source_blank',status:'',status_source_state:'not_applicable_fallback',source_page:f.source_url,profile_url:f.source_url,expected_county:expectedCounty(g),county_reconciliation:'match',geography_crosswalk:'',source_role_resolution:'official_current_parliament_fallback',supporting_url:f.supporting_url||'',fallback_evidence_note:f.evidence_note||''});selectedCodes.add(g.geo_code);fallbackUsed.push(g.name);
}
const rows=selected.sort((a,b)=>a.constituency_code-b.constituency_code);const missing=geos.filter(g=>!selectedCodes.has(g.geo_code)).map(g=>`${g.constituency_code}:${g.name}`);
assert(rows.length===290,`expected 290 constituency MP identities; got ${rows.length}; missing=${missing.join('|')}`);assert(new Set(rows.map(r=>r.geo_code)).size===290,'duplicate canonical constituency after fallback');
const snapshot={schema_version:'kda.p23.constituency-mp-source.v1',source_authority:'Parliament of Kenya — National Assembly',source_url:SOURCE,parliamentary_session:'13th Parliament',source_as_of_label:'12 Aug 2026',retrieval_note:'Primary identity evidence is the live Parliament 2022-session roster sorted by constituency. Current official Parliament profile/Hansard/Votes-and-Proceedings evidence is used only for canonical seats omitted or misspelled in the roster table. Nominated and CWR rows are excluded. Published blank party/status fields remain blank; no identity, party or status is inferred. Current Parliament labels Suba North/Suba South are crosswalked to Atlas canonical 2012 registry labels Mbita/Suba while preserving published labels.',coverage:{constituencies:290,live_roster:290-fallbackUsed.length,official_current_fallback:fallbackUsed.length,fallback_constituencies:fallbackUsed,explicit_elected:rows.filter(r=>/^ELECTED$/i.test(r.status||'')).length,party_source_blank:rows.filter(r=>!r.party).length,crosswalked_names:rows.filter(r=>r.geography_crosswalk).length},role_evidence_source:roles.source_url,fallback_source_file:'data/p23/source/parliament-current-mp-fallbacks.json',rows};
await mkdir(path.join(root,path.dirname(OUT)),{recursive:true});await writeFile(path.join(root,OUT),JSON.stringify(snapshot,null,2)+'\n');
console.log(`P23_MP_SOURCE_OK constituencies=290 live=${snapshot.coverage.live_roster} fallback=${snapshot.coverage.official_current_fallback} fallback_seats=${fallbackUsed.join('|')}`);
