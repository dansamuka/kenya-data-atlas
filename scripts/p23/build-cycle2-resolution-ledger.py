#!/usr/bin/env python3
"""Build the governed Cycle-2 resolution ledger for all 54 exception rows.

The ledger is planning/provenance state only. It cannot promote, inherit, or write
canonical turnout values. A row remains pending until independent source evidence
is separately reviewed and committed under the P23 governance contract.
"""
from __future__ import annotations
import argparse, importlib.util, json
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'scripts'/'p23'/'run-cycle2-54way-source-resolution.py'
spec=importlib.util.spec_from_file_location('p23source',SRC)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--output',required=True); a=ap.parse_args()
 q=m.m.queue(); ev=m.m.evidence(); rows=[]
 for code in sorted(q):
  recs=ev.get(code,[]); states={x['state'] for x in recs}; assert len(states)==1,(code,recs)
  state=next(iter(states))
  if state not in m.m.EXCEPTIONS: continue
  task=m.route(m.m.reconcile(q[code],recs,state))
  rows.append({
   'geo_code':task['geo_code'],'name':task['name'],'cycle1_state':task['cycle1_state'],
   'resolution_action':task['resolution_action'],'resolution_status':task['resolution_status'],
   'terminal_sources':task['terminal_sources'],'requirements':task['requirements'],
   'governance':task['governance']})
 assert len(rows)==54 and len({r['geo_code'] for r in rows})==54
 states=Counter(r['cycle1_state'] for r in rows); actions=Counter(r['resolution_action'] for r in rows)
 assert states=={'denominator_mismatch':41,'arithmetic_mismatch':6,'partial_unresolved':4,'source_unreadable':2,'official_pdf_missing_results_pages':1},states
 assert actions=={'independent_denominator_source_resolution':41,'independent_arithmetic_source_resolution':6,'independent_source_recovery':7},actions
 assert all(r['resolution_status']=='pending_independent_source_resolution' for r in rows)
 assert all(r['governance']=={'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False,'required_render_dpi':250} for r in rows)
 out={'schema_version':'kda.p23.cycle2-resolution-ledger.v1','row_count':54,'state_counts':dict(states),'action_counts':dict(actions),'rows':rows,
      'governance':{'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False,'required_render_dpi':250}}
 Path(a.output).write_text(json.dumps(out,indent=2)+'\n')
 print('P23_CYCLE2_RESOLUTION_LEDGER',len(rows),dict(actions),'no_promotion=true')
if __name__=='__main__': main()
