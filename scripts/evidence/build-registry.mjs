#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const target=path.join(root,'data/evidence/county-documents.json');
const VERIFIED_AT='2026-08-30';

const FAMILIES=[
  {id:'cidp',label:'CIDP',description:'County Integrated Development Plan',core:true},
  {id:'adp',label:'ADP',description:'Annual Development Plan',core:true},
  {id:'cfsp',label:'CFSP',description:'County Fiscal Strategy Paper',core:true},
  {id:'cbrop',label:'CBROP',description:'County Budget Review and Outlook Paper',core:true},
  {id:'approved_budget',label:'Approved budget',description:'Approved county budget or budget documents',core:true},
  {id:'budget_implementation',label:'Budget implementation',description:'Controller of Budget county implementation evidence',core:true},
  {id:'audit',label:'Audit',description:'Office of the Auditor-General county-government audit evidence',core:true}
];

const CIDP=[
['KEN-C001','https://maarifa.cog.go.ke/county-integrated-development-plans/mombasa-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C002','https://kwale.go.ke/download/auto-draft-15/','County Government of Kwale','verified_source_page'],
['KEN-C003','https://maarifa.cog.go.ke/county-integrated-development-plans/kilifi-county-integrated-development-plan-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C004','https://maarifa.cog.go.ke/county-integrated-development-plans/tana-river-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C005','https://maarifa.cog.go.ke/county-integrated-development-plans/lamu-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C006','https://maarifa.cog.go.ke/county-integrated-development-plans/taita-taveta-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C007','https://maarifa.cog.go.ke/county-integrated-development-plans/garissa-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C008','https://maarifa.cog.go.ke/county-integrated-development-plans/wajir-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C009','https://maarifa.cog.go.ke/county-integrated-development-plans/mandera-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C010','https://maarifa.cog.go.ke/county-integrated-development-plans/marsabit-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C011','https://maarifa.cog.go.ke/county-integrated-development-plans/isiolo-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C012','https://maarifa.cog.go.ke/county-integrated-development-plans/meru-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C013','https://maarifa.cog.go.ke/county-integrated-development-plans/tharaka-nithi-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C014','https://maarifa.cog.go.ke/county-integrated-development-plans/embu-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C015','https://maarifa.cog.go.ke/county-integrated-development-plans/kitui-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C016','https://maarifa.cog.go.ke/county-integrated-development-plans/machakos-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C017','https://maarifa.cog.go.ke/county-integrated-development-plans/makueni-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C018','https://maarifa.cog.go.ke/county-integrated-development-plans/nyandarua-county-integrated-development-plan','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C019','https://www.nyeri.go.ke/nyeri-county-cidp-iii-2023-2027-2/','County Government of Nyeri','verified_source_page'],
['KEN-C020','https://maarifa.cog.go.ke/county-integrated-development-plans/kirinyaga-county-integrated-development-plan-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C021','https://maarifa.cog.go.ke/county-integrated-development-plans/muranga-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C022','https://maarifa.cog.go.ke/county-integrated-development-plans/kiambu-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C023','https://maarifa.cog.go.ke/county-integrated-development-plans/turkana-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C024','https://maarifa.cog.go.ke/county-integrated-development-plans/west-pokot-integrated-development-plan','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C025','https://maarifa.cog.go.ke/county-integrated-development-plans/samburu-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C026','https://maarifa.cog.go.ke/county-integrated-development-plans/trans-nzoia-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C027','https://maarifa.cog.go.ke/county-integrated-development-plans/uasin-gishu-2023-2027-cipd','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C028','https://elgeyomarakwet.go.ke/mdocs-posts/emc-cidp-iii-2023-2027-approved/','County Government of Elgeyo Marakwet','verified_source_page'],
['KEN-C029','https://maarifa.cog.go.ke/county-integrated-development-plans/nandi-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C030','https://maarifa.cog.go.ke/county-integrated-development-plans/baringo-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C031','https://maarifa.cog.go.ke/county-integrated-development-plans/laikipia-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C032','https://maarifa.cog.go.ke/county-integrated-development-plans/nakuru-2023-2027-cipd','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C033','https://www.narok.go.ke/wp-content/uploads/2025/02/Narok-County-CIDP-2023-2027.pdf','County Government of Narok','verified_document'],
['KEN-C034','https://www.kajiado.go.ke/download/county-integrated-development-plan-2023-2027-2/','County Government of Kajiado','verified_source_page'],
['KEN-C035','https://maarifa.cog.go.ke/county-integrated-development-plans/kericho-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C036','https://maarifa.cog.go.ke/county-integrated-development-plans/bomet-cidp-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C037','https://maarifa.cog.go.ke/county-integrated-development-plans/kakamega-county-integrated-development-plan-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C038','https://maarifa.cog.go.ke/county-integrated-development-plans/vihiga-county-integrated-development-plan','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C039','https://www.maarifa.cog.go.ke/node/840','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C040','https://maarifa.cog.go.ke/county-integrated-development-plans/busia-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C041','https://maarifa.cog.go.ke/county-integrated-development-plans/siaya-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C042','https://maarifa.cog.go.ke/county-integrated-development-plans/kisumu-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C043','https://maarifa.cog.go.ke/county-integrated-development-plans/homa-bay-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C044','https://migori.go.ke/downloads?category=Plans','County Government of Migori','verified_source_page'],
['KEN-C045','https://maarifa.cog.go.ke/county-integrated-development-plans/kisii-county-integrated-development-plan-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C046','https://maarifa.cog.go.ke/county-integrated-development-plans/nyamira-2023-2027','Council of Governors Maarifa Centre','verified_source_page'],
['KEN-C047','https://maarifa.cog.go.ke/county-integrated-development-plans/nairobi-2023-2027-cidp','Council of Governors Maarifa Centre','verified_source_page']
];

const SHARED=[
{family:'budget_implementation',period:'FY2024/25',publisher:'Office of the Controller of Budget',title:'County Governments Budget Implementation Review Report FY2024/25 — {county} section',source_page_url:'https://cob.go.ke/publications/consolidated-county-budget-implementation-review-reports/',document_url:'https://cob.go.ke/download/county-governments-budget-implementation-review-report-fy-2024-25/',verification_state:'verified_document',scope:'national_consolidated_county_report',notes:'Official consolidated annual report contains a county-specific section; section page varies by report edition.'},
{family:'audit',period:'FY2023/24',publisher:'Office of the Auditor-General',title:'Auditor-General County Government Audit Reports 2023/24 — {county} evidence doorway',source_page_url:'https://www.oagkenya.go.ke/2023-2024-county-government-audit-reports/',document_url:null,verification_state:'verified_source_collection',scope:'official_collection',notes:'Official OAG county-government audit collection. The Atlas does not claim a pinned county PDF until its exact item is separately verified.'},
{family:'cfsp',period:'Current and historical',publisher:'Kenya Institute for Public Policy Research and Analysis (KIPPRA)',title:'County Fiscal Strategy Papers — {county} official-policy repository',source_page_url:'https://repository.kippra.or.ke/',document_url:null,verification_state:'verified_source_collection',scope:'official_policy_repository',notes:'Government public-policy repository indexes county-authored CFSPs. This is a discovery collection, not a pinned county file.'},
{family:'cbrop',period:'Current and historical',publisher:'Kenya Institute for Public Policy Research and Analysis (KIPPRA)',title:'County Budget Review and Outlook Papers — {county} official-policy repository',source_page_url:'https://repository.kippra.or.ke/',document_url:null,verification_state:'verified_source_collection',scope:'official_policy_repository',notes:'Government public-policy repository indexes county-authored CBROPs. This is a discovery collection, not a pinned county file.'}
];

const HUBS=[
{geo_code:'KEN-C034',publisher:'County Government of Kajiado',url:'https://www.kajiado.go.ke/tenders/',items:[['adp','Kajiado County Annual Development Plan 2024/25','FY2024/25'],['cfsp','Kajiado County Fiscal Strategy Paper 2024','2024'],['cbrop','Kajiado County Budget Review and Outlook Paper 2023','2023'],['approved_budget','Kajiado County Approved Budget 2024/25','FY2024/25']]},
{geo_code:'KEN-C019',publisher:'County Assembly of Nyeri',url:'https://nyeriassembly.go.ke/budget-documents/',items:[['adp','Nyeri County Annual Development Plans','Current and historical'],['cfsp','Nyeri County Fiscal Strategy Papers','Current and historical'],['approved_budget','Nyeri County Budget Documents','Current and historical']]},
{geo_code:'KEN-C028',publisher:'County Government of Elgeyo Marakwet',url:'https://elgeyomarakwet.go.ke/departments/finance-economic-planning/',items:[['adp','Elgeyo Marakwet Annual Development Plans','Current and historical'],['cfsp','Elgeyo Marakwet County Fiscal Strategy Papers','Current and historical']]},
{geo_code:'KEN-C044',publisher:'County Government of Migori',url:'https://migori.go.ke/departments/finance-and-economic-planning',items:[['adp','Migori County Annual Development Plans','Current and historical'],['approved_budget','Migori County Budget and finance documents','Current and historical']]},
{geo_code:'KEN-C017',publisher:'County Government of Makueni',url:'https://makueni.go.ke/documents/',items:[['cfsp','Makueni County Fiscal Strategy Papers','Current and historical']]}
];

const geos=read('data/geography/registry/geographies.json');
const counties=geos.filter(g=>g.level==='county').sort((a,b)=>Number(a.county_code)-Number(b.county_code));
if(counties.length!==47)throw new Error(`P13 requires 47 counties, found ${counties.length}`);
const byCode=new Map(counties.map(c=>[c.geo_code,c]));
const cidpByCode=new Map(CIDP.map(x=>[x[0],x]));
if(cidpByCode.size!==47)throw new Error('P13 CIDP source list must contain 47 unique counties');
let serial=1;
const records=[];
const add=(geo_code,base)=>{
  const county=byCode.get(geo_code);if(!county)throw new Error(`Unknown county ${geo_code}`);
  records.push({record_id:`KDA-EVD-${geo_code}-${String(serial++).padStart(4,'0')}`,geo_code,county_name:county.name,family:base.family,title:base.title,period:base.period||null,publisher:base.publisher,scope:base.scope||'county',document_url:base.document_url??null,source_page_url:base.source_page_url??null,verification_state:base.verification_state,link_status:base.verification_state.startsWith('verified_')?'verified_reachable':'unresolved',verified_at:VERIFIED_AT,verification_method:base.verification_method||'manual_official_source_review',reason:base.reason??null,notes:base.notes??null});
};
for(const county of counties){
  const c=CIDP.find(x=>x[0]===county.geo_code);if(!c)throw new Error(`${county.geo_code}: missing CIDP source`);
  add(county.geo_code,{family:'cidp',title:`${county.name} County Integrated Development Plan 2023–2027`,period:'2023–2027',publisher:c[2],scope:'county',document_url:c[3]==='verified_document'?c[1]:null,source_page_url:c[1],verification_state:c[3],verification_method:'official_repository_or_county_site_review',notes:c[3]==='verified_document'?'Direct official county PDF.':'Official county or Council of Governors repository page for the third-generation CIDP.'});
  for(const s of SHARED)add(county.geo_code,{...s,title:s.title.replace('{county}',county.name),verification_method:'official_national_or_government_repository_review'});
}
for(const hub of HUBS)for(const item of hub.items)add(hub.geo_code,{family:item[0],title:item[1],period:item[2],publisher:hub.publisher,scope:'county_source_hub',document_url:null,source_page_url:hub.url,verification_state:'verified_source_page',verification_method:'official_county_site_review',notes:'Official county source page specifically verified for this document family.'});
records.sort((a,b)=>a.geo_code.localeCompare(b.geo_code)||a.family.localeCompare(b.family)||a.title.localeCompare(b.title));
const docsByCounty=new Map(counties.map(c=>[c.geo_code,[]]));for(const r of records)docsByCounty.get(r.geo_code).push(r);
const family_coverage=Object.fromEntries(FAMILIES.map(f=>{const rows=records.filter(r=>r.family===f.id);return[f.id,{county_count:new Set(rows.map(r=>r.geo_code)).size,record_count:rows.length,pinned_document_count:rows.filter(r=>r.verification_state==='verified_document').length,source_page_count:rows.filter(r=>r.verification_state==='verified_source_page').length,source_collection_count:rows.filter(r=>r.verification_state==='verified_source_collection').length}];}));
const output={meta:{schema_version:'kda.county-evidence.v1',generated_at:`${VERIFIED_AT}T00:00:00.000Z`,verification_date:VERIFIED_AT,county_count:47,record_count:records.length,source_model:'scripts/evidence/build-registry.mjs',state_model:{verified_document:'Exact official document/file or item pinned.',verified_source_page:'Official page identifies the county document or family; exact file is not asserted unless separately pinned.',verified_source_collection:'Official collection/repository is verified as a discovery doorway; not an assertion of one pinned county file.',not_published:'Evidence indicates the document was not published for the stated period.',not_found:'A reasonable official-source search did not locate the document; this is not evidence it was never published.',inaccessible:'A known source exists but could not be accessed or verified at the last check.'},family_coverage},families:FAMILIES,counties:counties.map(c=>({geo_code:c.geo_code,county_name:c.name,documents:docsByCounty.get(c.geo_code)}))};
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
console.log(`P13_EVIDENCE_REGISTRY_BUILT counties=47 records=${records.length} cidp=${family_coverage.cidp.county_count} families=${FAMILIES.length}`);
