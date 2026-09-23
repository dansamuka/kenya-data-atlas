#!/usr/bin/env python3
import csv, json, re
from pathlib import Path

SRC=Path("/tmp/KEN_combined_estimates.csv")
CONTRACT=Path("data/p42/published-sae-promotion-contract.json")
COUNTY=Path("data/p42/published-sae-county-validation.json")
GEOM=Path("data/p42/published-sae-geometry-crosswalk.json")
OUT=Path("data/p42/published-sae-constituency-candidate.json")

def norm(s):
    s=str(s or "").lower().replace("&"," and ")
    s=re.sub(r"[^a-z0-9]+"," ",s)
    return " ".join(s.split())

def fnum(v):
    s=str(v or "").strip()
    if not s or s.upper() in {"NA","N/A","NULL","NONE","NAN"}: return None
    try: return float(s)
    except ValueError: return None

contract=json.loads(CONTRACT.read_text(encoding="utf-8"))
county=json.loads(COUNTY.read_text(encoding="utf-8"))
geom=json.loads(GEOM.read_text(encoding="utf-8"))
with SRC.open(encoding="utf-8-sig",newline="") as f:
    rows=list(csv.DictReader(f))

passing=set(county["passing_indicators"])
gate=contract["geography_gate"]
eligible_geos=[]
seen=set()
for r in geom["rows"]:
    b=r.get("best_match")
    if not b: continue
    ok=(b["intersection_over_union"]>=gate["direct_assignment_min_iou"] and
        b["source_area_covered"]>=gate["direct_assignment_min_source_coverage"] and
        b["kda_area_covered"]>=gate["direct_assignment_min_kda_coverage"])
    if not ok or b["geo_code"] in seen: continue
    seen.add(b["geo_code"])
    eligible_geos.append({
      "source_region":r["source_region"],"source_parent":r["source_parent"],
      "geo_code":b["geo_code"],"kda_name":b["kda_name"],
      "iou":b["intersection_over_union"],
      "source_area_covered":b["source_area_covered"],
      "kda_area_covered":b["kda_area_covered"]
    })

candidates=[]
rejected=[]
for m in contract["mappings"]:
    if m["kda_indicator"] not in passing: continue
    for g in eligible_geos:
        target_parent=norm(g["source_parent"]); target_region=norm(g["source_region"])
        matches=[]
        for r in rows:
            if r.get("Year")!="2022" or r.get("Admin")!="2" or r.get("Indicator")!=m["source_indicator"]: continue
            name=str(r.get("Region_Name",""))
            if "_" in name:
                parent,region=name.split("_",1)
            else:
                parent,region="",name
            if norm(parent)==target_parent and norm(region)==target_region:
                matches.append(r)
        if len(matches)!=1:
            rejected.append({**m,**g,"reason":f"source_row_count_{len(matches)}"})
            continue
        r=matches[0]
        mean,lo,hi=(fnum(r.get("Mean")),fnum(r.get("Lower_CI")),fnum(r.get("Upper_CI")))
        if mean is None or lo is None or hi is None:
            rejected.append({**m,**g,"reason":"missing_point_or_interval"})
            continue
        candidates.append({
          "indicator_id":m["kda_indicator"],"source_indicator":m["source_indicator"],
          "geo_code":g["geo_code"],"geography_name":g["kda_name"],
          "source_region":g["source_region"],"source_parent":g["source_parent"],
          "value":round(mean*100,4),"lower_bound":round(lo*100,4),"upper_bound":round(hi*100,4),
          "reference_year":2022,"source_tier":"S5","public_label":"Modelled estimate",
          "geographic_method":"published_external_small_area_estimate",
          "iou":g["iou"],"source_area_covered":g["source_area_covered"],"kda_area_covered":g["kda_area_covered"]
        })

out={
 "schema_version":"kda.p42.published-sae-constituency-candidate.v1",
 "built_on":"2026-09-23",
 "source_release":contract["source"],
 "county_gate_passing_indicators":sorted(passing),
 "geometry_eligible_constituencies":eligible_geos,
 "candidate_count":len(candidates),
 "candidates":candidates,
 "rejected_after_gates":rejected,
 "status":"candidate_only_not_yet_promoted"
}
OUT.write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"passing_indicators":sorted(passing),"eligible_geographies":len(eligible_geos),"candidate_count":len(candidates),"rejected":len(rejected)},indent=2))
