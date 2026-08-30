#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>{const out=path.join(root,p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(v,null,2)+'\n');};
const assert=(ok,msg)=>{if(!ok)throw new Error(`P14 opportunity build: ${msg}`);};
const date=/^\d{4}-\d{2}-\d{2}$/;
const url=/^https:\/\//;

const seed=read('data/opportunities/programmes.seed.json');
assert(seed.schema_version==='kda.opportunity-seed.v1','unexpected seed schema version');
assert(date.test(seed.verification_date||''),'verification_date must be YYYY-MM-DD');
assert(seed.freshness_policy?.live_states?.includes('live'),'freshness policy must define live state');
assert(Array.isArray(seed.programmes)&&seed.programmes.length>=6,'at least six verified programme records required');

const ids=new Set();
const programmes=seed.programmes.map(p=>{
  assert(/^P14-[A-Z0-9-]+$/.test(p.id||''),`invalid programme id ${p.id}`);
  assert(!ids.has(p.id),`duplicate programme id ${p.id}`);ids.add(p.id);
  assert(p.name&&p.provider&&p.opportunity_type,`${p.id} missing identity fields`);
  assert(['live','paused','closed','expired','unknown'].includes(p.status),`${p.id} unsupported status`);
  assert(p.window_type&&p.window_note,`${p.id} missing application-window semantics`);
  assert(Array.isArray(p.beneficiaries)&&p.beneficiaries.length,`${p.id} requires beneficiary eligibility`);
  assert(Array.isArray(p.sectors)&&p.sectors.length,`${p.id} requires sector tags`);
  assert(p.geography?.scope,`${p.id} requires geography eligibility`);
  assert(p.eligibility_summary&&p.application_method,`${p.id} requires eligibility and application method`);
  assert(url.test(p.primary_url||''),`${p.id} primary_url must use https`);
  assert(date.test(p.verified_at||''),`${p.id} verified_at must be YYYY-MM-DD`);
  assert(date.test(p.next_review_at||''),`${p.id} next_review_at must be YYYY-MM-DD`);
  assert(p.next_review_at>p.verified_at,`${p.id} next_review_at must follow verified_at`);
  if(p.status==='live')assert(p.application_url&&url.test(p.application_url),`${p.id} live record requires https application_url`);
  if(p.amount){
    assert(p.amount.currency==='KES',`${p.id} amount currency must be KES`);
    assert(p.amount.label,`${p.id} amount requires source-facing label`);
    if(p.amount.min!=null)assert(Number.isFinite(p.amount.min)&&p.amount.min>=0,`${p.id} invalid min amount`);
    if(p.amount.max!=null)assert(Number.isFinite(p.amount.max)&&p.amount.max>=0,`${p.id} invalid max amount`);
    if(p.amount.min!=null&&p.amount.max!=null)assert(p.amount.min<=p.amount.max,`${p.id} amount min exceeds max`);
  }
  assert(Array.isArray(p.source_claims)&&p.source_claims.length,`${p.id} requires source_claims`);
  assert(['gap','contextual'].includes(p.relevance?.mode),`${p.id} requires relevance mode`);
  assert(Array.isArray(p.relevance?.trigger_indicators),`${p.id} requires trigger_indicators array`);
  if(p.relevance.mode==='gap')assert(p.relevance.trigger_indicators.length>0,`${p.id} gap relevance requires triggers`);
  return {
    id:p.id,name:p.name,provider:p.provider,opportunity_type:p.opportunity_type,status:p.status,
    window_type:p.window_type,window_note:p.window_note,beneficiaries:p.beneficiaries,sectors:p.sectors,
    geography:p.geography,eligibility_summary:p.eligibility_summary,application_method:p.application_method,
    amount:p.amount??null,terms_note:p.terms_note??null,primary_url:p.primary_url,application_url:p.application_url??null,
    verified_at:p.verified_at,next_review_at:p.next_review_at,source_claims:p.source_claims,relevance:p.relevance
  };
}).sort((a,b)=>a.provider.localeCompare(b.provider)||a.name.localeCompare(b.name));

const output={
  schema_version:'kda.opportunity-registry.v1',
  meta:{
    phase:'P14',release_label:'v1.1 Beta',verification_date:seed.verification_date,
    programme_count:programmes.length,live_count:programmes.filter(p=>p.status==='live').length,
    freshness_policy:seed.freshness_policy,
    matching_policy:{
      version:'P14-match-v1',
      gap_match:'A programme with relevance.mode=gap is relevant when the selected county has an unfavourable P07 gap whose indicator_code appears in trigger_indicators.',
      contextual_match:'A programme with relevance.mode=contextual is shown as nationwide context, not as evidence that the county has a measured gap.',
      personal_eligibility:'County relevance never implies that a person, group or business is eligible. Users must check the programme rules on the official primary source.'
    }
  },
  programmes
};
write('data/opportunities/opportunity-registry.json',output);
console.log(`P14_OPPORTUNITY_REGISTRY_BUILT programmes=${output.meta.programme_count} live=${output.meta.live_count} verified=${output.meta.verification_date}`);
