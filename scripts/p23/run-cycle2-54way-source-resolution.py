#!/usr/bin/env python3
"""Build one governed source-resolution task for each of the 54 P23 Cycle-2 exceptions.

This is the next remediation stage after deterministic reconciliation. It routes every
exception to the strongest permitted independent source-resolution action without
inheriting results, authorizing promotion, or writing canonical turnout values.
"""
from __future__ import annotations
import argparse, importlib.util, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'scripts'/'p23'/'run-cycle2-54way-exception-resolution.py'
spec=importlib.util.spec_from_file_location('p23reconcile',BASE); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def route(r):
 state=r['cycle1_state']; c=r['deterministic_reconciliation']; sources=r['terminal_sources']
 if state=='denominator_mismatch':
  action='independent_denominator_source_resolution'
  requirements=['recompute pinned ward denominator','recheck exact Form 34B registered-voter field','seek independent authoritative IEBC denominator evidence','do not substitute Form 34B denominator without governed authorization']
 elif state=='arithmetic_mismatch':
  action='independent_arithmetic_source_resolution'
  requirements=['recheck exact 250-DPI source image','retranscribe all candidate totals and total-valid field independently','seek alternate official Form 34B copy if discrepancy persists','do not repair official arithmetic by inference']
 else:
  action='independent_source_recovery'
  requirements=['recover exact official constituency-level results artifact','render recovered source at >=250 DPI','independently transcribe only visible constituency summary fields','do not aggregate or inherit missing result values']
 return {'geo_code':r['geo_code'],'name':r['name'],'queue':r['queue'],'cycle1_state':state,'cycle2_reconciliation_outcome':r['cycle2_outcome'],'terminal_sources':sources,'known_checks':c,'resolution_action':action,'requirements':requirements,'resolution_status':'pending_independent_source_resolution','governance':{'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False,'required_render_dpi':250}}

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--shard',type=int); ap.add_argument('--output',required=True); a=ap.parse_args()
 q=m.queue(); ev=m.evidence(); rows=[]
 for code in sorted(q):
  recs=ev.get(code,[]); states={x['state'] for x in recs}; assert len(states)==1,(code,recs); state=next(iter(states))
  if state in m.EXCEPTIONS: rows.append(route(m.reconcile(q[code],recs,state)))
 assert len(rows)==54 and len({x['geo_code'] for x in rows})==54
 if a.shard is not None: assert 0<=a.shard<54; rows=[rows[a.shard]]
 out={'schema_version':'kda.p23.cycle2-54way-source-resolution.v1','workers':54,'rows':rows,'governance':{'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False}}
 Path(a.output).write_text(json.dumps(out,indent=2)+'\n'); print('P23_CYCLE2_SOURCE_RESOLUTION',len(rows),'no_promotion=true')
if __name__=='__main__': main()
