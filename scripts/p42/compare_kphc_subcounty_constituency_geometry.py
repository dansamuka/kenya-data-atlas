#!/usr/bin/env python3
import argparse, json, re, unicodedata
from pathlib import Path
import geopandas as gpd
import pandas as pd

def norm(v):
    if v is None:
        return ""
    s=unicodedata.normalize("NFKD", str(v)).encode("ascii","ignore").decode().lower().strip()
    s=s.replace("&"," and ")
    s=re.sub(r"\b(sub[ -]?county|constituency)\b"," ",s)
    return re.sub(r"[^a-z0-9]+","",s)

def load_registry(path):
    obj=json.loads(Path(path).read_text())
    rows=obj if isinstance(obj,list) else obj["geographies"]
    counties=[r for r in rows if r.get("level")=="county"]
    const=[r for r in rows if r.get("level")=="constituency"]
    county_by_code={r["county_code"]:r["name"] for r in counties}
    k=pd.DataFrame([{
        "geo_code":r["geo_code"],"constituency":r["name"],
        "county":county_by_code.get(r.get("county_code"),"")
    } for r in const])
    k["const_norm"]=k["constituency"].map(norm)
    k["county_norm"]=k["county"].map(norm)
    return k

def detect_string_field(gdf, targets):
    best=None
    for col in gdf.columns:
        if col=="geometry": continue
        vals=set(norm(v) for v in gdf[col].dropna().tolist())
        vals.discard("")
        score=len(vals & targets)
        if best is None or score>best[1]:
            best=(col,score,len(vals))
    return best

def safe_valid(gdf):
    gdf=gdf.copy()
    gdf["geometry"]=gdf.geometry.make_valid()
    gdf=gdf[~gdf.geometry.is_empty & gdf.geometry.notna()].copy()
    return gdf

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--subcounty",required=True)
    ap.add_argument("--constituency",required=True)
    ap.add_argument("--registry",default="data/geography/registry/geographies.json")
    ap.add_argument("--contract",default="data/p42/kphc-subcounty-equivalence-sources.json")
    ap.add_argument("--output",default="data/p42/kphc-subcounty-geometry-equivalence.json")
    args=ap.parse_args()

    contract=json.loads(Path(args.contract).read_text())
    gate=contract["equivalence_gate"]
    kda=load_registry(args.registry)
    county_targets=set(kda["county_norm"])
    const_targets=set(kda["const_norm"])

    sub=safe_valid(gpd.read_file(args.subcounty))
    con=safe_valid(gpd.read_file(args.constituency))

    sub_name=detect_string_field(sub,const_targets)
    sub_county=detect_string_field(sub,county_targets)
    con_name=detect_string_field(con,const_targets)
    con_county=detect_string_field(con,county_targets)

    detection={
      "subcounty_name_field":{"field":sub_name[0],"match_score":sub_name[1],"distinct_values":sub_name[2]},
      "subcounty_county_field":{"field":sub_county[0],"match_score":sub_county[1],"distinct_values":sub_county[2]},
      "constituency_name_field":{"field":con_name[0],"match_score":con_name[1],"distinct_values":con_name[2]},
      "constituency_county_field":{"field":con_county[0],"match_score":con_county[1],"distinct_values":con_county[2]}
    }

    if sub_name[1] < contract["field_detection"]["minimum_subcounty_name_matches"]:
        raise SystemExit(f"Subcounty source name-field overlap too low: {sub_name}")
    if con_name[1] < contract["field_detection"]["minimum_constituency_name_matches"]:
        raise SystemExit(f"Constituency source name-field overlap too low: {con_name}")

    def prep(gdf,nf,cf,prefix):
        x=gdf[[nf,cf,"geometry"]].copy()
        x.columns=[f"{prefix}_name",f"{prefix}_county","geometry"]
        x[f"{prefix}_name_norm"]=x[f"{prefix}_name"].map(norm)
        x[f"{prefix}_county_norm"]=x[f"{prefix}_county"].map(norm)
        return x

    s=prep(sub,sub_name[0],sub_county[0],"sub")
    c=prep(con,con_name[0],con_county[0],"con")
    s=s.to_crs(gate["evaluated_crs"])
    c=c.to_crs(gate["evaluated_crs"])

    rows=[]
    for _,sr in s.iterrows():
        hits=c[(c["con_name_norm"]==sr["sub_name_norm"]) & (c["con_county_norm"]==sr["sub_county_norm"])]
        if len(hits)!=1:
            rows.append({
              "source_subcounty":sr["sub_name"],"source_county":sr["sub_county"],
              "normalized_name":sr["sub_name_norm"],"candidate_count":int(len(hits)),
              "status":"unmatched" if len(hits)==0 else "ambiguous","passes":False
            })
            continue
        cr=hits.iloc[0]
        a=sr.geometry
        b=cr.geometry
        inter=a.intersection(b).area
        union=a.union(b).area
        iou=inter/union if union else 0
        acov=inter/a.area if a.area else 0
        bcov=inter/b.area if b.area else 0
        passes=(iou>=gate["iou_min"] and acov>=gate["source_area_coverage_min"] and bcov>=gate["kda_comparator_area_coverage_min"])
        rows.append({
          "source_subcounty":sr["sub_name"],"source_county":sr["sub_county"],
          "matched_constituency":cr["con_name"],"matched_constituency_county":cr["con_county"],
          "normalized_name":sr["sub_name_norm"],"candidate_count":1,
          "iou":round(float(iou),6),"source_area_coverage":round(float(acov),6),
          "constituency_area_coverage":round(float(bcov),6),
          "status":"equivalent" if passes else "geometry_mismatch","passes":bool(passes)
        })

    passed=[r for r in rows if r["passes"]]
    one_to_one=len({(r.get("matched_constituency_county"),r.get("matched_constituency")) for r in passed})==len(passed)
    if gate["one_to_one_required"] and not one_to_one:
        raise SystemExit("Passing geometry matches are not one-to-one.")

    out={
      "schema_version":"kda.p42.kphc-subcounty-geometry-equivalence.v1",
      "contract":args.contract,
      "thresholds":gate,
      "field_detection":detection,
      "source_counts":{"subcounty_features":len(s),"constituency_features":len(c)},
      "summary":{
        "evaluated_subcounties":len(rows),
        "passed_equivalence":len(passed),
        "failed_or_unmatched":len(rows)-len(passed),
        "one_to_one":one_to_one,
        "max_possible_first_wave_cells_if_three_target_indicators":len(passed)*3
      },
      "rows":rows
    }
    Path(args.output).write_text(json.dumps(out,indent=2)+"\n")
    print(json.dumps(out["summary"],indent=2))

if __name__=="__main__":
    main()
