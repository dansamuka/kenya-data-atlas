#!/usr/bin/env python3
import csv, json, math, re
from pathlib import Path

CONTRACT=Path("data/p42/published-sae-promotion-contract.json")
SRC=Path("/tmp/KEN_combined_estimates.csv")
OUT=Path("data/p42/published-sae-county-validation.json")

def norm(s):
    s=str(s or "").lower().replace("&"," and ")
    s=re.sub(r"[^a-z0-9]+"," ",s)
    return " ".join(s.split())

contract=json.loads(CONTRACT.read_text(encoding="utf-8"))
with SRC.open(encoding="utf-8-sig",newline="") as f:
    rows=list(csv.DictReader(f))
registry=json.loads(Path("data/geography/registry/geographies.json").read_text(encoding="utf-8"))
counties=[x for x in registry if x.get("level")=="county"]
county_by_norm={norm(x["name"]):x for x in counties}

# source naming aliases only for punctuation/spelling variants; never geography changes.
ALIASES={
  "elgeyo marakwet":"elgeyo marakwet",
  "taita taveta":"taita taveta",
  "tharaka nithi":"tharaka nithi",
  "murang a":"murang a"
}

def official_values(indicator):
    j=json.loads(Path(f"data/distribution/subsets/indicators/{indicator}.json").read_text(encoding="utf-8"))
    out={}
    for o in j.get("observations",[]):
        if str(o.get("geo_code","")).startswith("KEN-C") and o.get("source_class")=="official":
            out[str(o["geography_id"])]=float(o["value"])
    return out

results=[]
for m in contract["mappings"]:
    src=[r for r in rows if r["Year"]=="2022" and r["Admin"]=="1" and r["Indicator"]==m["source_indicator"]]
    off=official_values(m["kda_indicator"])
    pairs=[]
    unmatched=[]
    for r in src:
        n=norm(r["Region_Name"])
        k=county_by_norm.get(ALIASES.get(n,n))
        if not k:
            unmatched.append(r["Region_Name"]); continue
        gid=str(k["geography_id"])
        if gid not in off:
            unmatched.append(r["Region_Name"]); continue
        mean=float(r["Mean"])*100
        lo=float(r["Lower_CI"])*100
        hi=float(r["Upper_CI"])*100
        observed=off[gid]
        pairs.append({
          "geo_code":k["geo_code"],"county":k["name"],
          "model_mean":round(mean,4),"model_lower_90":round(lo,4),"model_upper_90":round(hi,4),
          "official_value":observed,"error_pp":round(mean-observed,4),
          "official_inside_model_interval":lo<=observed<=hi
        })
    errors=[p["error_pp"] for p in pairs]
    mae=sum(abs(e) for e in errors)/len(errors) if errors else None
    rmse=math.sqrt(sum(e*e for e in errors)/len(errors)) if errors else None
    bias=sum(errors)/len(errors) if errors else None
    cov=100*sum(p["official_inside_model_interval"] for p in pairs)/len(pairs) if pairs else None
    g=contract["predeclared_county_coherence_gate"]
    pass_gate=(
      len(pairs)==47 and not unmatched and
      mae<=g["max_mae_pp"] and rmse<=g["max_rmse_pp"] and abs(bias)<=g["max_absolute_mean_bias_pp"] and
      cov>=g["min_official_points_inside_published_90_interval_pct"]
    )
    results.append({
      **m,
      "county_pairs":len(pairs),"unmatched_source_counties":unmatched,
      "mae_pp":round(mae,4) if mae is not None else None,
      "rmse_pp":round(rmse,4) if rmse is not None else None,
      "mean_bias_pp":round(bias,4) if bias is not None else None,
      "official_inside_model_90_interval_pct":round(cov,4) if cov is not None else None,
      "pass_county_coherence_gate":pass_gate,
      "largest_absolute_errors":sorted(pairs,key=lambda p:-abs(p["error_pp"]))[:10]
    })
out={
  "schema_version":"kda.p42.published-sae-county-validation.v1",
  "validated_on":"2026-09-23",
  "contract":"data/p42/published-sae-promotion-contract.json",
  "thresholds":contract["predeclared_county_coherence_gate"],
  "results":results,
  "passing_indicators":[x["kda_indicator"] for x in results if x["pass_county_coherence_gate"]],
  "failing_indicators":[x["kda_indicator"] for x in results if not x["pass_county_coherence_gate"]]
}
OUT.write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
print(json.dumps([{k:x[k] for k in ["kda_indicator","county_pairs","mae_pp","rmse_pp","mean_bias_pp","official_inside_model_90_interval_pct","pass_county_coherence_gate"]} for x in results],indent=2))
