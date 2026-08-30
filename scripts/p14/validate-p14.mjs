#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P14 validation: ${msg}`);};

try{
  const registry=read('data/opportunities/opportunity-registry.json');
  const mart=read('data/countyiq/county-summary.json');
  const seed=read('data/opportunities/programmes.seed.json');
  assert(registry.schema_version==='kda.opportunity-registry.v1','registry schema mismatch');
  assert(registry.meta?.phase==='P14'&&registry.meta?.release_label==='v1.1 Beta','Beta release label missing');
  assert(registry.meta?.freshness_policy?.stale_rule,'freshness policy missing stale downgrade rule');
  assert(registry.programmes.length===seed.programmes.length,'seed/registry programme count drift');
  assert(registry.programmes.length>=6,'programme registry too small for Beta');
  assert((mart.counties||[]).length===47,'CountyIQ mart must contain 47 counties');

  const ids=new Set(),urls=new Set();
  for(const p of registry.programmes){
    assert(!ids.has(p.id),`duplicate id ${p.id}`);ids.add(p.id);
    assert(/^https:\/\//.test(p.primary_url||''),`${p.id} missing primary https URL`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(p.verified_at||''),`${p.id} invalid verified_at`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(p.next_review_at||''),`${p.id} invalid next_review_at`);
    assert(p.next_review_at>p.verified_at,`${p.id} invalid review window`);
    if(p.status==='live'){
      assert(/^https:\/\//.test(p.application_url||''),`${p.id} live record missing application URL`);
      assert(p.window_type&&p.window_note,`${p.id} live record missing window semantics`);
      assert(p.source_claims?.length,`${p.id} live record missing source-backed claims`);
    }
    if(p.amount)assert(p.amount.label&&p.source_claims?.length,`${p.id} amount claim lacks source trace`);
    urls.add(p.primary_url);
  }
  assert(urls.size>=5,'registry should span at least five distinct primary programme surfaces');

  const triggerCodes=new Set(registry.programmes.flatMap(p=>p.relevance?.trigger_indicators||[]));
  const martCodes=new Set((mart.counties||[]).flatMap(c=>Object.keys(c.metrics||{})));
  for(const code of triggerCodes)assert(martCodes.has(code),`trigger indicator ${code} is not in CountyIQ mart`);

  let gapMatches=0,countiesWithMatch=0;
  for(const c of mart.counties){
    const unfavourable=new Set((c.gaps?.items||[]).filter(g=>g.favourable_to_county===false).map(g=>g.indicator_code));
    const matches=registry.programmes.filter(p=>p.relevance?.mode==='gap'&&(p.relevance.trigger_indicators||[]).some(code=>unfavourable.has(code)));
    gapMatches+=matches.length;if(matches.length)countiesWithMatch++;
  }
  assert(gapMatches>0,'no reproducible gap-to-programme matches found');
  assert(countiesWithMatch>=10,`Beta should produce useful gap matches across counties; only ${countiesWithMatch} counties matched`);
  assert(registry.programmes.some(p=>p.relevance?.mode==='contextual'),'at least one contextual nationwide opportunity required');

  const ui=text('assets/opportunity-finder.js'),css=text('assets/opportunity-finder.css'),lazy=text('assets/lazy-integrations.js');
  for(const token of ['review_due','favourable_to_county','trigger_indicators','does not confirm that you, your group or your business qualifies'])assert(ui.includes(token),`UI missing ${token}`);
  assert(css.includes('.opportunity-card')&&css.includes('@media'),'responsive opportunity styling missing');
  assert(lazy.includes('opportunity-finder.js'),'CountyIQ lazy loader is not wired to P14');
  console.log(`P14_REGISTRY_OK programmes=${registry.programmes.length} live=${registry.programmes.filter(p=>p.status==='live').length}`);
  console.log(`P14_FRESHNESS_POLICY_OK verification=${registry.meta.verification_date}`);
  console.log(`P14_MATCH_REPRODUCIBILITY_OK counties=${countiesWithMatch} matches=${gapMatches}`);
  console.log('P14_UI_PUBLIC_COPY_OK');
  console.log('P14_ALL_OK');
}catch(error){console.error(error.message||error);process.exit(1);}
