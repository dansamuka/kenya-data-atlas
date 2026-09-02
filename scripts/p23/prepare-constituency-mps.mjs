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
const canonical=new Map();for(const g of geos){const key=norm(g.name);assert(key&&!canonical.has(key),`canonical normalized name collision: ${g.name}`);canonical.set(key,g);}
const aliases=new Map([['CHUKAIGAMBANGOMBE','CHUKAIGAMBANGOMBE'],['KILIFINORTH','KILIFINORTH'],['KILIFISOUTH','KILIFISOUTH'],['KITUTUCHACHENORTH','KITUTUCHACHENORTH'],['KITUTUCHACHESOUTH','KITUTUCHACHESOUTH'],['HOMABAYTOWN','HOMABAYTOWN'],['OLJOROOROK','OLJOROOROK']]);
const matchKey=s=>aliases.get(norm(s))||norm(s);
const roleMap=new Map((roleEvidence.evidence||[]).map(e=>[`${norm(e.target_constituency)}|${personNorm(e.member_name)}`,e]));

function tableHeaders(html){const hr=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]).find(row=>/<th\b/i.test(row)&&/constituency/i.test(text(row)));if(!hr)return null;const labels=[...hr.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>labelNorm(m[1]));const idx=(...n)=>labels.findIndex(l=>n.some(x=>l.includes(x)));return {member:idx('member','name'),county:idx('county'),constituency:idx('constituency'),party:idx('party'),status:idx('status')};}
function rowFields(row,h){
  const raw=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(m=>({attrs:m[1],html:m[2],value:text(m[2])}));if(raw.length<4)return null;
  const labels=raw.map(c=>{const m=c.attrs.match(/(?:data-label|headers|aria-label)\s*=\s*["']([^"']+)["']/i);return m?labelNorm(m[1]):'';});let ci=labels.findIndex(l=>l.includes('constituency'));if(ci<0&&h?.constituency>=0)ci=h.constituency;if(ci<0||ci>=raw.length)return null;
  const cells=raw.map(x=>x.value),constituency=cells[ci]||'',lv=n=>{const i=labels.findIndex(l=>l.includes(n));return i>=0?cells[i]:'';};let member=lv('member')||lv('name'),party=lv('party'),county=lv('county'),status=lv('status');
  if(!member&&h?.member>=0)member=cells[h.member]||'';if(!party&&h?.party>=0)party=cells[h.party]||'';if(!county&&h?.county>=0)county=cells[h.county]||'';if(!status&&h?.status>=0)status=cells[h.status]||'';if(!member)member=cells.find((v,i)=>i!==ci&&/^HON\.?\s/i.test(v))||cells.slice(0,ci).filter(Boolean).at(-1)||'';if(!status)status=cells.find(v=>/^(ELECTED|NOMINATED)$/i.test(v))||'';
  if(!party){const ex=new Set([member,county,constituency,status,'More...','More..','More.','More']);party=cells.slice(ci+1).find(v=>v&&!ex.has(v)&&!/^(ELECTED|NOMINATED)$/i.test(v)&&v.length<=45)||'';}
  const mi=member?cells.findIndex(v=>v===member):-1,pm=(mi>=0?raw[mi]?.html:row).match(/<a\b[^>]*href=["']([^"']+)["']/i);return {member,county,constituency,party,status,profile_url:pm?absoluteUrl(pm[1]):'',raw:cells};
}
async function confirmsConstituencySeat(row){if(!row.profile_url)return {confirmed:false,reason:'no_profile_url'};const res=await fetch(row.profile_url,{headers:{'User-Agent':UA,'Accept':'text/html'}});assert(res.ok,`official profile fetch failed for ${row.member_name} (${res.status})`);const body=text(await res.text()),name=regexEscape(row.constituency).replace(/\s+/g,'\\s+'),p=[new RegExp(`Member\\s+of\\s+Parliament\\s*[,–-]?\\s*${name}\\s+Constituency`,'i'),new RegExp(`Member\\s+of\\s+Parliament\\s+for\\s+${name}(?:\\s+Constituency)?`,'i'),new RegExp(`Member\\s+for\\s+${name}\\s+Constituency`,'i')];return {confirmed:p.some(x=>x.test(body)),reason:'official_profile_role_text'};}
const countyMatches=r=>Boolean(r.published_county&&expectedCounty(r)&&norm(r.published_county)===norm(expectedCounty(r)));
const quality=r=>4*Number(countyMatches(r))+Number(Boolean(r.party))+Number(Boolean(r.profile_url));
const seatRole=r=>roleMap.get(`${norm(r.constituency)}|${personNorm(r.member_name)}`)||null;

const found=[];let emptyPages=0;
for(let page=0;page<60;page++){
  const url=`${SOURCE}?field_employment_history_value=&field_name_value=&field_parliament_value=2022&page=${page}`,res=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'}});assert(res.ok,`official roster page ${page} fetch failed (${res.status})`);const html=await res.text(),h=tableHeaders(html),trs=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);let n=0;
  for(const tr of trs){const f=rowFields(tr,h);if(!f)continue;const geo=canonical.get(matchKey(f.constituency));if(!geo)continue;if(!f.status||f.status.toUpperCase()!=='ELECTED')continue;assert(f.member,`explicit elected row ${f.constituency} missing member; cells=${f.raw.join(' | ')}`);const r={geo_code:geo.geo_code,constituency_code:Number(geo.constituency_code),constituency:geo.name,published_county:f.county,published_constituency:f.constituency,member_name:f.member,party:f.party,party_source_status:f.party?'published':'source_blank',status:f.status,source_page:url,profile_url:f.profile_url};r.expected_county=expectedCounty(r);r.county_reconciliation=r.published_county?(countyMatches(r)?'match':'mismatch'):'source_blank';found.push(r);n++;}
  if(n===0)emptyPages++;else emptyPages=0;if(page>30&&emptyPages>=3)break;
}
const grouped=new Map();for(const r of found){if(!grouped.has(r.geo_code))grouped.set(r.geo_code,[]);const g=grouped.get(r.geo_code);if(!g.some(x=>x.member_name===r.member_name&&x.party===r.party&&x.published_county===r.published_county))g.push(r);}
const selected=[],collisionResolutions=[];
for(const geo of geos){
  let c=grouped.get(geo.geo_code)||[];if(c.length===1){selected.push(c[0]);continue;}if(c.length===0)continue;
  const max=Math.max(...c.map(quality)),top=c.filter(r=>quality(r)===max);if(top.length===1&&max>Math.min(...c.map(quality))){const kept=top[0];kept.source_role_resolution=countyMatches(kept)?'canonical_parent_county_and_source_quality_precedence':'complete_explicit_elected_row_precedence';selected.push(kept);collisionResolutions.push({geo_code:geo.geo_code,constituency:geo.name,expected_county:expectedCounty(kept),kept_member:kept.member_name,kept_profile_url:kept.profile_url,rejected_candidates:c.filter(x=>x!==kept).map(x=>({member_name:x.member_name,published_county:x.published_county,profile_url:x.profile_url,reason:countyMatches(x)?'lower_source_quality':'published_county_conflicts_with_canonical_parent_or_lower_source_quality'}))});continue;}
  c=top;
  const roleClassified=c.map(r=>({row:r,evidence:seatRole(r)}));
  const roleConstituency=roleClassified.filter(x=>x.evidence?.seat_role==='constituency_mp');
  if(roleConstituency.length===1){const kept=roleConstituency[0].row;kept.source_role_resolution='official_parliament_seat_role_evidence';kept.role_evidence_url=roleEvidence.source_url;selected.push(kept);collisionResolutions.push({geo_code:geo.geo_code,constituency:geo.name,expected_county:expectedCounty(kept),kept_member:kept.member_name,kept_profile_url:kept.profile_url,role_evidence_url:roleEvidence.source_url,rejected_candidates:roleClassified.filter(x=>x.row!==kept).map(x=>({member_name:x.row.member_name,published_county:x.row.published_county,profile_url:x.row.profile_url,reason:x.evidence?.seat_role==='county_woman_representative'?'official_parliament_table_labels_candidate_CWR':'not_selected_by_unique_official_constituency_role_evidence'}))});continue;}
  const ev=[];for(const r of c)ev.push({...r,...await confirmsConstituencySeat(r)});const yes=ev.filter(x=>x.confirmed);assert(yes.length===1,`ambiguous official profile resolution for ${geo.geo_code} ${geo.name}: ${ev.map(x=>`${x.member_name}:${x.confirmed?'seat':'not-confirmed'}:${x.published_county}`).join(' / ')}`);const kept=yes[0];kept.source_role_resolution='official_profile_explicit_constituency_role';selected.push(kept);collisionResolutions.push({geo_code:geo.geo_code,constituency:geo.name,expected_county:expectedCounty(kept),kept_member:kept.member_name,kept_profile_url:kept.profile_url,rejected_candidates:ev.filter(x=>x.member_name!==kept.member_name).map(x=>({member_name:x.member_name,published_county:x.published_county,profile_url:x.profile_url,reason:'profile_does_not_explicitly_identify_member_as_MP_for_target_constituency'}))});
}
const rows=selected.sort((a,b)=>a.constituency_code-b.constituency_code),missing=geos.filter(g=>!rows.some(r=>r.geo_code===g.geo_code)).map(g=>`${g.constituency_code}:${g.name}`);assert(rows.length===290,`expected 290 explicit-elected constituency MPs; got ${rows.length}; missing=${missing.slice(0,30).join('|')}`);assert(new Set(rows.map(r=>r.constituency_code)).size===290,'duplicate constituency codes after official-source resolution');assert(rows.every(r=>r.member_name&&r.status&&r.source_page),'incomplete MP identity row');
const snapshot={schema_version:'kda.p23.constituency-mp-source.v1',source_authority:'Parliament of Kenya — National Assembly',source_url:SOURCE,parliamentary_session:'13th Parliament',source_as_of_label:'12 Aug 2026',retrieval_note:'Only Parliament rows with explicit Elected status are eligible. Published county is reconciled to the canonical parent county. Published blank party fields remain source_blank. Same-county collisions are resolved first with frozen official Parliament seat-role evidence (including explicit CWR labels) used only for role classification; current identity still comes from the live roster. Remaining collisions require exactly one official Parliament profile to explicitly identify the candidate as MP for the target constituency. No person, party or status is inferred.',coverage:{constituencies:rows.length,party_published:rows.filter(r=>r.party).length,party_source_blank:rows.filter(r=>!r.party).length,county_match:rows.filter(countyMatches).length,county_source_blank:rows.filter(r=>!r.published_county).length,resolved_collisions:collisionResolutions.length},role_evidence_source:roleEvidence.source_url,collision_resolutions:collisionResolutions,rows};await mkdir(path.join(root,path.dirname(OUT)),{recursive:true});await writeFile(path.join(root,OUT),JSON.stringify(snapshot,null,2)+'\n');console.log(`P23_MP_SOURCE_OK constituencies=${rows.length} county_match=${snapshot.coverage.county_match} party_source_blank=${snapshot.coverage.party_source_blank} resolved_collisions=${collisionResolutions.length}`);
