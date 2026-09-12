import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const fail=m=>{console.error(`P28A_AUDIT_FAIL ${m}`);process.exitCode=1;};
const assert=(c,m)=>{if(!c)fail(m);};
const uniq=a=>[...new Set(a)];
const same=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));

const manifest=read('data/completeness/local-54-indicator-manifest.json');
const policy=read('data/policy/local-54-indicator-contract.json');
const governance=read('data/local-54-source-governance-contract.json');
const contract=read('data/legacy-secondary-source-audit-contract.json');
const indicators=read('data/indicators/registry/indicators.json');
const series=read('data/indicators/registry/series.json');
const observations=read('data/indicators/registry/observations.json');
const geographies=read('data/geography/registry/geographies.json');
const datasets=read('data/catalogue/registry/datasets.json');
const sources=read('data/catalogue/registry/sources.json');
const ledger=read('data/completeness/slot-ledger.json');
const audit=read('data/audit/legacy-source-tier-audit.json');
const opportunities=read('data/audit/legacy-representation-opportunities.json');
const conflicts=read('data/audit/legacy-conflicts.json');
const summary=read('data/audit/legacy-source-tier-summary.json');

for(const p of contract.outputs)assert(fs.existsSync(path.join(root,p)),`missing contract output ${p}`);
assert(audit.schema_version==='kda.legacy-source-tier-audit.v1','audit schema mismatch');
assert(audit.audited_at===manifest.as_of,`audit date ${audit.audited_at} must equal frozen manifest date ${manifest.as_of}`);
assert(summary.audited_at===manifest.as_of,'summary must use deterministic manifest date');

const levels=new Set(['county','constituency','ward']);
const codes=new Set(manifest.indicators.map(x=>x.indicator_id));
const tierIds=governance.source_tiers.map(x=>x.id),tierSet=new Set(tierIds);
const actions=new Set(contract.recommended_actions);
const indicatorById=new Map(indicators.map(x=>[x.indicator_id,x]));
const geoById=new Map(geographies.map(x=>[x.geography_id,x]));
const obsById=new Map(observations.map(x=>[x.observation_id,x]));
const datasetById=new Map(datasets.map(x=>[x.dataset_id,x]));
const sourceById=new Map(sources.map(x=>[x.source_id,x]));
const treatmentByCode=new Map(policy.indicators.map(x=>[x.indicator_id,x]));
const codeOf=s=>indicatorById.get(s.indicator_id)?.indicator_code||'';

const rowIds=audit.rows.map(x=>x.record_or_slot_id);
assert(rowIds.length===uniq(rowIds).length,'duplicate audit record_or_slot_id');
for(const r of audit.rows){
  for(const field of contract.required_audit_fields)assert(Object.hasOwn(r,field),`${r.record_or_slot_id} missing ${field}`);
  assert(codes.has(r.indicator_id),`${r.record_or_slot_id} indicator outside frozen 54: ${r.indicator_id}`);
  assert(levels.has(r.level),`${r.record_or_slot_id} invalid level ${r.level}`);
  assert(tierSet.has(r.audited_source_tier),`${r.record_or_slot_id} invalid tier ${r.audited_source_tier}`);
  assert(actions.has(r.recommended_action),`${r.record_or_slot_id} invalid recommended_action ${r.recommended_action}`);
  assert(r.audited_at===manifest.as_of,`${r.record_or_slot_id} non-deterministic audited_at`);
  assert(typeof r.current_source_label==='string'&&r.current_source_label.length>0,`${r.record_or_slot_id} blank source label`);
  assert(typeof r.evidence_lineage_id==='string'&&r.evidence_lineage_id.length>0,`${r.record_or_slot_id} blank evidence_lineage_id`);
}

const expectedPreferred=[];
for(const s of series){
  if(s.status&&s.status!=='active')continue;
  const code=codeOf(s),geo=geoById.get(s.geography_id);
  if(codes.has(code)&&geo&&levels.has(geo.level)&&s.latest_observation_id)expectedPreferred.push(s.latest_observation_id);
}
const expectedPreferredUnique=uniq(expectedPreferred).sort();
const actualPreferred=audit.rows.filter(x=>x.record_type==='preferred_observation').map(x=>x.observation_id).sort();
assert(same(expectedPreferredUnique,actualPreferred),`preferred observation coverage mismatch expected=${expectedPreferredUnique.length} actual=${actualPreferred.length}`);

for(const r of audit.rows.filter(x=>x.record_type==='preferred_observation')){
  const o=obsById.get(r.observation_id);
  assert(Boolean(o),`${r.record_or_slot_id} observation missing from registry`);
  if(!o)continue;
  if(o.source_class==='external'||o.badge==='E')assert(!['S0_direct_primary_official','S1_derived_from_primary_official'].includes(r.audited_source_tier),`${r.record_or_slot_id} external evidence misclassified as primary official`);
  if(o.statistical_status==='estimated'||['interpolated','modelled'].includes(o.geographic_method))assert(['S5_transparent_modelled_or_spatial_estimate','S4_probable_value_conflicting_sources'].includes(r.audited_source_tier),`${r.record_or_slot_id} estimated/modelled value not labelled S5/S4`);
  const s=series.find(x=>x.series_id===o.series_id),d=datasetById.get(o.source_dataset_id||s?.dataset_id),src=d?sourceById.get(d.source_id):null;
  if(src?.source_type==='internal_derivation')assert(['S5_transparent_modelled_or_spatial_estimate','S4_probable_value_conflicting_sources'].includes(r.audited_source_tier),`${r.record_or_slot_id} internal derivation not S5/S4`);
}

const closureStatuses=new Set(['official_unavailable','governed_unavailable','boundary_unresolved','active_missing','retired_replaced','not_applicable']);
const expectedClosureSlots=[];const expectedClosureCells=new Set();
for(const r of ledger.rows){if(codes.has(r.indicator_code)&&levels.has(r.level)&&r.lifecycle_status==='active'&&closureStatuses.has(r.status)){expectedClosureSlots.push(r.slot_key);expectedClosureCells.add(`${r.geography_id}|${r.indicator_code}`);}}
const closureRows=audit.rows.filter(x=>x.record_type==='closure_cell');
const actualClosureSlots=uniq(closureRows.flatMap(x=>x.covered_slot_keys||[])).sort();
assert(same(uniq(expectedClosureSlots).sort(),actualClosureSlots),`closure slot coverage mismatch expected=${uniq(expectedClosureSlots).length} actual=${actualClosureSlots.length}`);
assert(closureRows.length===expectedClosureCells.size,`closure cell count mismatch expected=${expectedClosureCells.size} actual=${closureRows.length}`);
for(const r of closureRows){
  const treatment=treatmentByCode.get(r.indicator_id);
  const shouldNA=(r.legacy_statuses||[]).every(x=>x==='not_applicable')||(treatment?.treatment_class==='institutional_county_only'&&r.level!=='county');
  assert(r.audited_source_tier===(shouldNA?'S7_not_applicable':'S6_governed_unavailable'),`${r.record_or_slot_id} closure tier incompatible with P27 treatment`);
}

const externalCells=new Set();
for(const r of ledger.rows)if(codes.has(r.indicator_code)&&levels.has(r.level)&&r.lifecycle_status==='active'&&r.status==='external_verified'&&!r.observation_id)externalCells.add(`${r.geography_id}|${r.indicator_code}`);
assert(audit.rows.filter(x=>x.record_type==='legacy_external_slot').length===externalCells.size,'legacy external slot coverage mismatch');

const reopen=closureRows.filter(x=>x.audited_source_tier==='S6_governed_unavailable');
assert(opportunities.count===reopen.length,`representation opportunity count=${opportunities.count} expected=${reopen.length}`);
assert(opportunities.rows.length===reopen.length,'representation opportunity rows mismatch');
assert(conflicts.count===conflicts.rows.length,'conflict count/row mismatch');
assert(summary.preferred_observations_in_scope===expectedPreferredUnique.length,'summary preferred count mismatch');
assert(summary.preferred_observations_with_disposition===actualPreferred.length,'summary preferred disposition count mismatch');
assert(summary.preferred_observation_disposition_pct===100,'preferred mechanical audit must be 100%');
assert(summary.closure_cells_in_scope===expectedClosureCells.size,'summary closure count mismatch');
assert(summary.closure_cells_with_disposition===closureRows.length,'summary closure disposition mismatch');
assert(summary.closure_cell_disposition_pct===100,'closure mechanical audit must be 100%');
assert(summary.closure_slot_keys_covered===actualClosureSlots.length,'summary closure slot coverage mismatch');
assert(summary.candidate_conflict_group_count===conflicts.count,'summary conflict count mismatch');
assert(summary.governed_unavailable_reopen_queue_count===reopen.length,'summary reopen count mismatch');
const manual=audit.rows.filter(x=>x.requires_manual_review).length;
assert(summary.manual_review_count===manual,'summary manual review count mismatch');
for(const t of tierIds)assert(summary.source_tier_counts[t]===audit.rows.filter(x=>x.audited_source_tier===t).length,`summary tier count mismatch ${t}`);

const csvLines=fs.readFileSync(path.join(root,'data/audit/legacy-source-tier-audit.csv'),'utf8').trimEnd().split(/\r?\n/).length;
assert(csvLines===audit.rows.length+1,`CSV line count=${csvLines}, expected ${audit.rows.length+1}`);

if(summary.successor_acceptance?.p28a_complete){
  assert(summary.manual_review_count===0,'P28A cannot be complete with manual review rows');
  assert(summary.governed_unavailable_reopen_queue_count===0,'P28A cannot be complete with unavailable re-open queue');
  assert(summary.candidate_conflict_group_count===0,'P28A cannot be complete with conflict candidates');
  assert(summary.legacy_external_slots_without_canonical_observation===0,'P28A cannot be complete with external slots lacking canonical observations');
}
if(!process.exitCode)console.log(`P28A_AUDIT_OK preferred=${actualPreferred.length} closure_cells=${closureRows.length} closure_slots=${actualClosureSlots.length} external_slots=${externalCells.size} reopen=${reopen.length} conflicts=${conflicts.count} manual=${manual}`);
