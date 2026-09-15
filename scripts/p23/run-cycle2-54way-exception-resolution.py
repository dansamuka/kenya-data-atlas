#!/usr/bin/env python3
"""Build the exact 54-row P23 Cycle-2 exception worklist and shard it 54 ways.

This runner is deliberately non-promotional. One worker is assigned to each current
Cycle-1 non-verified terminal record. Workers may reconcile evidence, but cannot
inherit values, authorize promotion, or write canonical turnout values.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
P23=ROOT/'data'/'p23'
TERMINAL={'verified','denominator_mismatch','arithmetic_mismatch','source_unreadable','partial_unresolved','official_pdf_missing_results_pages'}
EXCEPTIONS=TERMINAL-{'verified'}

def load(p): return json.loads(p.read_text())

def canonical_queue():
    rows=[]
    for letter in 'abcdefghijk':
        for r in load(P23/f'turnout-salvage-tranche-{letter}.json')['tranche']['rows']:
            rows.append({'geo_code':r['geo_code'],'name':r['name'],'queue':'salvage'})
    triage=load(P23/'turnout-followup-triage.json')
    rows += [{'geo_code':r['geo_code'],'name':r['name'],'queue':'untouched'} for r in triage['genuinely_untouched']['constituencies']]
    assert len(rows)==109 and len({r['geo_code'] for r in rows})==109
    return {r['geo_code']:r for r in rows}

def evidence():
    out={}
    reg=P23/'turnout-salvage-review-outcomes.json'
    if reg.exists():
        for r in load(reg).get('outcomes',[]):
            s=r.get('reason'); c=r.get('geo_code')
            if c and s in TERMINAL: out.setdefault(c,[]).append({'state':s,'source':reg.name})
    for p in sorted(P23.glob('form34b-*-fresh-source-review.json')):
        d=load(p); c=d.get('geo_code'); s=d.get('verification_state')
        if c and s in TERMINAL: out.setdefault(c,[]).append({'state':s,'source':p.name})
    for p in sorted(P23.glob('p23-cycle1-terminal-classification-*.json')):
        d=load(p)
        for r in d.get('rows',[]):
            c=r.get('geo_code'); s=r.get('verification_state')
            if c and s in TERMINAL: out.setdefault(c,[]).append({'state':s,'source':p.name})
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--shard',type=int); ap.add_argument('--output',required=True); a=ap.parse_args()
    q=canonical_queue(); ev=evidence(); rows=[]
    for code in sorted(q):
        recs=ev.get(code,[]); states={x['state'] for x in recs}
        assert len(states)==1,(code,recs)
        state=next(iter(states))
        if state in EXCEPTIONS:
            rows.append({**q[code],'cycle1_state':state,'terminal_sources':[x['source'] for x in recs],
                'review_contract':{'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False,
                'required_render_dpi':250,'independent_reconciliation_required':True}})
    assert len(rows)==54,len(rows)
    if a.shard is not None:
        assert 0<=a.shard<54
        rows=[rows[a.shard]]
    payload={'schema_version':'kda.p23.cycle2-54way-exception-worklist.v1','workers':54,'rows':rows,
      'governance':{'no_inheritance':True,'no_promotion':True,'promotion_authorized':False,'canonical_turnout_written':False}}
    Path(a.output).write_text(json.dumps(payload,indent=2)+'\n')
    print(f"P23_CYCLE2_EXCEPTION_WORKLIST rows={len(rows)} workers=54 no_promotion=true")
if __name__=='__main__': main()
