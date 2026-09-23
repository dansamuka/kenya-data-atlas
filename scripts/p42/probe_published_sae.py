#!/usr/bin/env python3
import csv, json, re
from collections import Counter, defaultdict
from pathlib import Path

SRC=Path("/tmp/KEN_combined_estimates.csv")
OUT=Path("data/p42/published-sae-source-probe.json")

def norm(s):
    s=str(s or "").lower().strip()
    s=re.sub(r"[^a-z0-9]+"," ",s)
    return " ".join(s.split())

with SRC.open(encoding="utf-8-sig", newline="") as f:
    reader=csv.DictReader(f)
    rows=list(reader)
fields=reader.fieldnames or []

# Profile low-cardinality columns; this identifies level/year/indicator columns without assuming schema.
profiles={}
for field in fields:
    vals=[str(r.get(field,"")).strip() for r in rows if str(r.get(field,"")).strip()!=""]
    uniq=Counter(vals)
    if len(uniq)<=100:
        profiles[field]={
          "unique_count":len(uniq),
          "top_values":uniq.most_common(100)
        }

# Capture non-sensitive first rows for schema understanding.
sample=[{k:r.get(k) for k in fields} for r in rows[:8]]

# Heuristically locate likely semantic columns.
def find_field(terms):
    for f in fields:
        n=norm(f)
        if all(t in n for t in terms): return f
    return None
indicator_field=find_field(["indicator"])
year_field=find_field(["year"])
level_field=find_field(["level"])
county_field=find_field(["county"])
subcounty_field=next((f for f in fields if "sub" in norm(f) and "county" in norm(f)),None)

# Compare 2022 Admin=2 region names against KDA's 290 constituency names.
registry=json.loads(Path("data/geography/registry/geographies.json").read_text(encoding="utf-8"))
constituencies=[x for x in registry if x.get("level")=="constituency"]
kda_by_norm=defaultdict(list)
for x in constituencies:
    kda_by_norm[norm(x.get("name"))].append({"geography_id":x.get("geography_id"),"geo_code":x.get("geo_code"),"name":x.get("name"),"parent_id":x.get("parent_id")})
admin2_2022=sorted({str(r.get("Region_Name","")).strip() for r in rows if str(r.get("Year"))=="2022" and str(r.get("Admin"))=="2"})
sae_by_norm=defaultdict(list)
for name in admin2_2022: sae_by_norm[norm(name)].append(name)
exact_matches=[]
ambiguous=[]
unmatched=[]
for n,names in sorted(sae_by_norm.items()):
    ks=kda_by_norm.get(n,[])
    if len(names)==1 and len(ks)==1:
        exact_matches.append({"source_name":names[0],**ks[0]})
    elif ks:
        ambiguous.append({"normalized":n,"source_names":names,"kda_matches":ks})
    else:
        unmatched.extend(names)
matched_kda_codes={x["geo_code"] for x in exact_matches}
missing_kda=[{"geo_code":x.get("geo_code"),"name":x.get("name")} for x in constituencies if x.get("geo_code") not in matched_kda_codes]

out={
  "schema_version":"kda.p42.published-sae-source-probe.v1",
  "probed_on":"2026-09-23",
  "source":{
    "publisher":"Multi-Indicator Small Area Estimation Resource / University of Washington Statistics",
    "release":"v2025.11.20",
    "asset":"KEN_combined_estimates.csv",
    "asset_size_bytes":SRC.stat().st_size,
    "model_reference":"Kenya 2014/2022 DHS small-area estimates; Bayesian spatial models with population-weighted aggregation"
  },
  "row_count":len(rows),
  "field_names":fields,
  "low_cardinality_profiles":profiles,
  "detected_fields":{
    "indicator":indicator_field,
    "year":year_field,
    "level":level_field,
    "county":county_field,
    "subcounty":subcounty_field
  },
  "sample_rows":sample,
  "admin2_2022_geography_crosswalk":{
    "source_unique_regions":len(admin2_2022),
    "kda_constituencies":len(constituencies),
    "exact_name_matches":len(exact_matches),
    "ambiguous_source_name_groups":len(ambiguous),
    "unmatched_source_names":unmatched,
    "missing_kda_constituencies":missing_kda,
    "ambiguous_examples":ambiguous[:30],
    "exact_match_examples":exact_matches[:20]
  },
  "raw_source_committed":False,
  "conclusion":"reachable_machine_readable_with_uncertainty" if len(rows)>0 else "not_usable"
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
print(json.dumps(out,indent=2))
