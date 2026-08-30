#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(c,m)=>{if(!c)throw new Error(`P13 validation: ${m}`);};
const allowedStates=new Set(['verified_document','verified_source_page','verified_source_collection','not_published','not_found','inaccessible']);
const officialHosts=new Set(['maarifa.cog.go.ke','www.maarifa.cog.go.ke','kwale.go.ke','www.kwale.go.ke','www.nyeri.go.ke','nyeri.go.ke','elgeyomarakwet.go.ke','www.elgeyomarakwet.go.ke','www.narok.go.ke','narok.go.ke','www.kajiado.go.ke','kajiado.go.ke','migori.go.ke','www.migori.go.ke','cob.go.ke','www.cob.go.ke','www.oagkenya.go.ke','oagkenya.go.ke','repository.kippra.or.ke','nyeriassembly.go.ke','www.nyeriassembly.go.ke','makueni.go.ke','www.makueni.go.ke']);
const isOfficial=u=>{try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)&&!x.hash&&officialHosts.has(x.hostname);}catch{return false;}};

try{
  const registry=json('data/evidence/county-documents.json');
  const geos=json('data/geography/registry/geographies.json').filter(g=>g.level==='county');
  const pkg=json('package.json');
  const index=read('index.html'),lazy=read('assets/lazy-integrations.js'),ui=read('assets/evidence-hub.js'),css=read('assets/evidence-hub.css');
  const roadmap=json('data/project-roadmap.json');
  assert(registry?.meta?.schema_version==='kda.county-evidence.v1','unexpected evidence schema');
  assert(registry.meta.county_count===47&&registry.counties.length===47,'registry must contain 47 counties');
  const expected=new Set(geos.map(g=>g.geo_code)),actual=new Set(registry.counties.map(c=>c.geo_code));
  assert(expected.size===47&&actual.size===47&&[...expected].every(x=>actual.has(x)),'county codes must exactly match canonical registry');
  let cidp=0,verified=0,collections=0,unavailable=0;const familyCounties=new Map();
  for(const county of registry.counties){
    assert(county.county_name&&Array.isArray(county.documents),`${county.geo_code}: invalid county evidence row`);
    const cidps=county.documents.filter(d=>d.family==='cidp'&&['verified_document','verified_source_page'].includes(d.verification_state));
    assert(cidps.length>=1,`${county.geo_code}: requires verified CIDP document/source page`);cidp++;
    for(const d of county.documents){
      assert(allowedStates.has(d.verification_state),`${d.record_id}: unsupported state`);
      assert(d.family&&d.title&&d.publisher&&d.verified_at,`${d.record_id}: missing core metadata`);
      assert(d.geo_code===county.geo_code,`${d.record_id}: county mismatch`);
      if(!familyCounties.has(d.family))familyCounties.set(d.family,new Set());familyCounties.get(d.family).add(d.geo_code);
      if(d.verification_state.startsWith('verified_')){
        assert(isOfficial(d.source_page_url),`${d.record_id}: verified evidence requires approved official source URL without fragment`);
        if(d.document_url!==null)assert(isOfficial(d.document_url),`${d.record_id}: document URL must be approved official http(s) without fragment`);
        assert(d.link_status==='verified_reachable',`${d.record_id}: verified record must carry verified_reachable link status`);verified++;
        if(d.verification_state==='verified_source_collection')collections++;
      }else{
        assert(d.document_url===null,`${d.record_id}: unavailable state may not carry document URL`);
        assert(typeof d.reason==='string'&&d.reason.trim(),`${d.record_id}: unavailable state requires explicit reason`);unavailable++;
      }
    }
  }
  assert(cidp===47,'CIDP coverage must be 47/47');
  const nonCidp=[...familyCounties.entries()].filter(([f,s])=>f!=='cidp'&&s.size>0);
  assert(nonCidp.length>=3,`requires at least three additional document families, found ${nonCidp.length}`);
  for(const required of ['budget_implementation','audit','cfsp','cbrop'])assert(familyCounties.get(required)?.size===47,`${required} evidence doorway must cover 47 counties`);
  assert(registry.meta.family_coverage.cidp?.county_count===47,'meta CIDP coverage must be 47');
  for(const token of ['id="ciq-evidence-hub"','id="ciq-evidence-search"','id="ciq-evidence-family"','assets/evidence-hub.css'])assert(index.includes(token),`index missing ${token}`);
  for(const token of ['assets/evidence-hub.js','KDAEvidenceHub'])assert(lazy.includes(token),`lazy CountyIQ loader missing ${token}`);
  for(const token of ['verified_document','verified_source_page','verified_source_collection','not_published','not_found','inaccessible'])assert(ui.includes(token),`UI must distinguish state ${token}`);
  assert(css.includes('.evidence-hub-list')&&css.includes('.evidence-state'),'Evidence Hub styling missing');
  assert(pkg.scripts['evidence:build']&&pkg.scripts['evidence:validate'],'package scripts must expose P13 build/validate');
  assert(pkg.scripts.test.includes('evidence:validate'),'npm test must include P13 validator');
  assert(pkg.scripts['build:data'].includes('evidence:build'),'build:data must materialise evidence registry');
  assert(pkg.scripts['ui:validate'].includes('assets/evidence-hub.js'),'ui validator must syntax-check Evidence Hub');
  const p13=roadmap.phases.find(p=>p.id==='P13');assert(p13&&['next','complete'].includes(p13.status),'roadmap must retain supported P13 handoff state');
  console.log(`P13_CIDP_47_OK counties=${cidp}`);
  console.log(`P13_DOCUMENT_FAMILIES_OK families=${familyCounties.size} non_cidp=${nonCidp.length}`);
  console.log(`P13_EVIDENCE_STATES_OK verified=${verified} collections=${collections} unavailable=${unavailable}`);
  console.log('P13_UI_AND_BUILD_WIRING_OK');console.log('P13_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
