#!/usr/bin/env python3
"""Build 109 independent Cycle-2 promotion-review packets from governed Cycle-1 evidence.

This is a review/candidate stage only. It NEVER authorizes promotion and NEVER writes
canonical turnout. Each canonical constituency receives one packet so the workflow can
run a 109-way matrix while only Cycle-1 `verified` records become promotion candidates.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
P23 = ROOT / "data" / "p23"
TERMINAL = {"verified","denominator_mismatch","arithmetic_mismatch","source_unreadable","partial_unresolved","official_pdf_missing_results_pages"}


def load(p): return json.loads(p.read_text())

def canonical_queue():
    rows=[]
    for letter in "abcdefghijk":
        d=load(P23/f"turnout-salvage-tranche-{letter}.json")
        rows += [{"geo_code":r["geo_code"],"name":r["name"],"queue":"salvage"} for r in d["tranche"]["rows"]]
    d=load(P23/"turnout-followup-triage.json")
    rows += [{"geo_code":r["geo_code"],"name":r["name"],"queue":"untouched"} for r in d["genuinely_untouched"]["constituencies"]]
    assert len(rows)==109 and len({r['geo_code'] for r in rows})==109
    return rows

def evidence():
    out={}
    def add(code,state,source,row):
        if code and state in TERMINAL: out.setdefault(code,[]).append((state,source,row))
    p=P23/"turnout-salvage-review-outcomes.json"
    if p.exists():
        for r in load(p).get("outcomes",[]): add(r.get("geo_code"),r.get("reason"),p.name,r)
    for p in sorted(P23.glob("form34b-*-fresh-source-review.json")):
        d=load(p); add(d.get("geo_code"),d.get("verification_state"),p.name,d)
    for p in sorted(P23.glob("p23-cycle1-terminal-classification-*.json")):
        for r in load(p).get("rows",[]): add(r.get("geo_code"),r.get("verification_state"),p.name,r)
    return out

def main():
    q=canonical_queue(); ev=evidence(); canonical={r['geo_code'] for r in q}
    assert not(set(ev)-canonical)
    packets=[]
    for i,item in enumerate(q):
        records=ev.get(item['geo_code'],[])
        states={x[0] for x in records}
        assert len(states)==1, f"missing/conflicting terminal state {item['geo_code']}: {states}"
        state=next(iter(states)); candidate=state=="verified"
        packets.append({
          "worker":i,"geo_code":item["geo_code"],"name":item["name"],"queue":item["queue"],
          "cycle1_terminal_state":state,"cycle1_sources":[x[1] for x in records],
          "promotion_candidate":candidate,
          "required_revalidation":["source_provenance","source_pdf_sha256","review_context_image_sha256","render_dpi_250","candidate_arithmetic","governed_denominator","target_geo_mapping"] if candidate else [],
          "governance":{"no_inheritance":True,"no_promotion":True,"promotion_authorized":False,"canonical_turnout_written":False}
        })
    assert len(packets)==109 and [p['worker'] for p in packets]==list(range(109))
    payload={"schema_version":"kda.p23.cycle2-109way-promotion-review.v1","canonical_queue_count":109,
      "promotion_candidate_count":sum(p['promotion_candidate'] for p in packets),
      "non_candidate_count":sum(not p['promotion_candidate'] for p in packets),
      "governance":{"promotion_authorized":False,"canonical_turnout_written":False,"verified_does_not_auto_promote":True},"packets":packets}
    out=P23/"p23-cycle2-109way-promotion-review.json"; out.write_text(json.dumps(payload,indent=2)+"\n")
    print(json.dumps({k:payload[k] for k in ('canonical_queue_count','promotion_candidate_count','non_candidate_count','governance')},indent=2))

if __name__=="__main__": main()
