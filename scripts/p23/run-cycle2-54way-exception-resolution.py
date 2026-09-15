#!/usr/bin/env python3
"""Run deterministic Cycle-2 reconciliation for the exact 54 P23 exceptions.

Each worker receives the complete authoritative terminal record where available and
independently recomputes the checks that can be decided from pinned evidence. It never
inherits values, changes source transcription, authorizes promotion, or writes canonical data.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; P23=ROOT/'data'/'p23'
TERMINAL={'verified','denominator_mismatch','arithmetic_mismatch','source_unreadable','partial_unresolved','official_pdf_missing_results_pages'}; EXCEPTIONS=TERMINAL-{'verified'}
def load(p): return json.loads(p.read_text())
def queue():
 r=[]
 for x in 'abcdefghijk': r += [{'geo_code':z['geo_code'],'name':z['name'],'queue':'salvage'} for z in load(P23/f'turnout-salvage-tranche-{x}.json')['tranche']['rows']]
 r += [{'geo_code':z['geo_code'],'name':z['name'],'queue':'untouched'} for z in load(P23/'turnout-followup-triage.json')['genuinely_untouched']['constituencies']]
 assert len(r)==109 and len({z['geo_code'] for z in r})==109; return {z['geo_code']:z for z in r}
def evidence():
 out={}
 def add(c,s,src,row=None):
  if c and s in TERMINAL: out.setdefault(c,[]).append({'state':s,'source':src,'row':row})
 reg=P23/'turnout-salvage-review-outcomes.json'
 if reg.exists():
  for z in load(reg).get('outcomes',[]): add(z.get('geo_code'),z.get('reason'),reg.name,z)
 for p in sorted(P23.glob('form34b-*-fresh-source-review.json')):
  d=load(p); add(d.get('geo_code'),d.get('verification_state'),p.name,d)
 for p in sorted(P23.glob('p23-cycle1-terminal-classification-*.json')):
  for z in load(p).get('rows',[]): add(z.get('geo_code'),z.get('verification_state'),p.name,z)
 return out
def reconcile(base,recs,state):
 full=[x for x in recs if isinstance(x.get('row'),dict) and (isinstance(x['row'].get('visual_transcription'),dict) or isinstance(x['row'].get('governed_denominator'),dict))]
 row=full[-1]['row'] if full else (recs[-1].get('row') if recs else None)
 checks={'authoritative_terminal_state':state,'source_records':len(recs),'full_evidence_record_available':bool(full)}
 vt=(row.get('visual_transcription') or {}) if isinstance(row,dict) else {}; gd=(row.get('governed_denominator') or {}) if isinstance(row,dict) else {}
 assert isinstance(vt,dict) and isinstance(gd,dict)
 votes=vt.get('candidate_vote_totals_in_source_column_order'); tv=vt.get('total_valid_votes'); rv=vt.get('registered_voters')
 if isinstance(votes,list) and all(isinstance(v,int) for v in votes) and isinstance(tv,int):
  checks['candidate_vote_sum']=sum(votes); checks['candidate_arithmetic_reconciles']=sum(votes)==tv; checks['candidate_arithmetic_delta']=sum(votes)-tv
 if isinstance(gd.get('ward_values'),list) and all(isinstance(v,int) for v in gd['ward_values']):
  checks['governed_ward_sum_recomputed']=sum(gd['ward_values']); checks['governed_ward_sum_matches_record']=sum(gd['ward_values'])==gd.get('sum')
  if isinstance(rv,int): checks['form_vs_governed_reconciles']=rv==sum(gd['ward_values']); checks['form_minus_governed_delta']=rv-sum(gd['ward_values'])
 clean=checks.get('candidate_arithmetic_reconciles') is True and checks.get('form_vs_governed_reconciles') is True
 if clean: outcome='reconciled_verified_pending_promotion_review'
 elif state=='denominator_mismatch' and checks.get('candidate_arithmetic_reconciles') is True and checks.get('form_vs_governed_reconciles') is False: outcome='confirmed_denominator_mismatch_requires_source_resolution'
 elif state=='arithmetic_mismatch' and checks.get('candidate_arithmetic_reconciles') is False: outcome='confirmed_arithmetic_mismatch_requires_source_resolution'
 else: outcome='confirmed_unresolved_requires_source_recovery'
 return {**base,'cycle1_state':state,'terminal_sources':[x['source'] for x in recs],'deterministic_reconciliation':checks,'cycle2_outcome':outcome,'promotion_eligible':False,'promotion_authorized':False,'canonical_turnout_written':False,'review_contract':{'no_inheritance':True,'no_promotion':True,'required_render_dpi':250,'independent_reconciliation_required':True}}
def main():
 a=argparse.ArgumentParser(); a.add_argument('--shard',type=int); a.add_argument('--output',required=True); x=a.parse_args(); q=queue(); ev=evidence(); rows=[]
 for c in sorted(q):
  recs=ev.get(c,[]); states={z['state'] for z in recs}; assert len(states)==1,(c,recs); s=next(iter(states))
  if s in EXCEPTIONS: rows.append(reconcile(q[c],recs,s))
 assert len(rows)==54,len(rows)
 if x.shard is not None: assert 0<=x.shard<54; rows=[rows[x.shard]]
 d={'schema_version':'kda.p23.cycle2-54way-exception-reconciliation.v1','workers':54,'rows':rows,'governance':{'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False}}
 Path(x.output).write_text(json.dumps(d,indent=2)+'\n'); print('P23_CYCLE2_RECONCILIATION',len(rows),'no_promotion=true')
if __name__=='__main__': main()
