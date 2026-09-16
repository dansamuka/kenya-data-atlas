#!/usr/bin/env python3
"""Derive exact Cycle-2 candidate and exception cohorts from the governed 109-way manifest.

No promotion is authorized here. Candidate workers perform deterministic deep checks on
pinned Cycle-1 evidence; exception workers produce governed remediation tasks without
inventing or inheriting replacement values.
"""
import json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; P23=ROOT/'data'/'p23'
M=P23/'p23-cycle2-109way-promotion-review.json'

def load():
    p=json.load(open(M)); rows=p['packets']
    assert len(rows)==109 and len({r['geo_code'] for r in rows})==109
    assert not p['governance']['promotion_authorized'] and not p['governance']['canonical_turnout_written']
    cand=[r for r in rows if r['promotion_candidate']]; exc=[r for r in rows if not r['promotion_candidate']]
    assert len(cand)==55 and len(exc)==54
    return cand,exc

def main():
    cand,exc=load(); mode=sys.argv[1] if len(sys.argv)>1 else 'summary'
    if mode=='candidate':
        i=int(sys.argv[2]); r=cand[i]; assert r['cycle1_terminal_state']=='verified'
        req=set(r['required_revalidation']); expected={'source_provenance','source_pdf_sha256','review_context_image_sha256','render_dpi_250','candidate_arithmetic','governed_denominator','target_geo_mapping'}
        assert req==expected and r['cycle1_sources']
        g=r['governance']; assert g['no_inheritance'] and g['no_promotion'] and not g['promotion_authorized'] and not g['canonical_turnout_written']
        print(json.dumps({'worker':i,'geo_code':r['geo_code'],'name':r['name'],'state':'deep_revalidation_dispatched','checks':sorted(req),'promotion_authorized':False,'canonical_turnout_written':False}))
    elif mode=='exception':
        i=int(sys.argv[2]); r=exc[i]; state=r['cycle1_terminal_state']; assert state!='verified'
        remediation={'denominator_mismatch':['recompute_governed_denominator','compare_official_registered_voters','inspect_special_facility_rows'], 'arithmetic_mismatch':['recompute_candidate_sum','compare_official_total_valid','inspect_source_image'], 'partial_unresolved':['inspect_source_image','locate_missing_summary_fields','retain_nulls_if_unresolved'], 'source_unreadable':['seek_alternate_official_copy','render_250_dpi','retain_unreadable_if_not_resolved'], 'official_pdf_missing_results_pages':['seek_official_results_pages','verify_source_provenance','retain_missing_if_not_found']}[state]
        g=r['governance']; assert g['no_inheritance'] and g['no_promotion'] and not g['promotion_authorized'] and not g['canonical_turnout_written']
        print(json.dumps({'worker':i,'geo_code':r['geo_code'],'name':r['name'],'exception':state,'remediation':remediation,'promotion_authorized':False,'canonical_turnout_written':False}))
    else:
        from collections import Counter
        print(json.dumps({'candidates':len(cand),'exceptions':len(exc),'exception_states':Counter(r['cycle1_terminal_state'] for r in exc),'promotion_authorized':False,'canonical_turnout_written':False},default=dict))
if __name__=='__main__': main()
