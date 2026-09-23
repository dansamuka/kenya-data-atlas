#!/usr/bin/env python3
import argparse, json, math, re
from collections import defaultdict
from decimal import Decimal, ROUND_FLOOR
from pathlib import Path
import geopandas as gpd
from exactextract import exact_extract

PARENT_RE=re.compile(r"^(KEN-C\d{3})")

def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def zonal(gdf,raster):
    feats=exact_extract(raster,gdf,["sum"],output="geojson")
    out=[]
    for f in feats:
        v=(f.get("properties") or {}).get("sum")
        out.append(0.0 if v is None else float(v))
    return out

def official_controls(path,year):
    d=read_json(path); out={}
    for o in d.get("observations",[]):
        code=str(o.get("geo_code",""))
        if not code.startswith("KEN-C") or "-CON" in code or "-W" in code: continue
        if str(o.get("period_start",""))[:4]!=str(year): continue
        if o.get("source_class")!="official" or o.get("value") is None: continue
        out[code]=float(o["value"])
    return out

def parent(code):
    m=PARENT_RE.match(code)
    if not m: raise AssertionError("cannot parse county parent "+code)
    return m.group(1)

def allocate_cents(total, weights):
    # Return 2-decimal KES-million allocations summing exactly to 2-decimal county total.
    target=int((Decimal(str(total))*100).quantize(Decimal("1")))
    sw=sum(weights)
    if sw<=0: raise AssertionError("non-positive county weight sum")
    raw=[target*w/sw for w in weights]
    flo=[math.floor(x) for x in raw]
    residual=target-sum(flo)
    order=sorted(range(len(raw)),key=lambda i:(raw[i]-flo[i],-i),reverse=True)
    for i in order[:residual]: flo[i]+=1
    return [v/100.0 for v in flo]

def level_candidate(level,path,rasters,controls,county_raw,gate):
    g=gpd.read_file(path)
    expected=gate["require_full_child_geometry_counts"][level]
    if len(g)!=expected: raise AssertionError(f"{level} count {len(g)} != {expected}")
    c=zonal(g,rasters["aggdp"])
    crop=zonal(g,rasters["crop"]); livestock=zonal(g,rasters["livestock"])
    fish=zonal(g,rasters["fish"]); forest=zonal(g,rasters["forest"])
    s=[crop[i]+livestock[i]+fish[i]+forest[i] for i in range(len(g))]
    records=[]
    by_county=defaultdict(list)
    for i,row in enumerate(g.itertuples()):
        code=str(row.geo_code); p=parent(code)
        by_county[p].append((i,code,str(row.name)))
    county_diag={}
    for p,items in sorted(by_county.items()):
        if p not in controls: raise AssertionError("missing control "+p)
        idx=[x[0] for x in items]
        cw=[c[i] for i in idx]; sw=[s[i] for i in idx]
        if gate["require_positive_central_and_sensitivity_value"] and (any(x<=0 for x in cw) or any(x<=0 for x in sw)):
            # Retain records but mark cell-level ineligible below.
            pass
        county_c=sum(cw); county_s=sum(sw)
        direct=county_raw[p]
        rel=abs(county_c-direct)/direct if direct>0 else None
        geometry_ok=rel is not None and rel<=gate["max_child_weight_vs_county_weight_relative_error"]
        central_alloc=allocate_cents(controls[p],cw)
        sens_alloc=allocate_cents(controls[p],sw)
        county_diag[p]={
          "official_control_kes_mn":controls[p],
          "direct_county_aggdp_weight":direct,
          "summed_child_aggdp_weight":county_c,
          "child_vs_county_weight_relative_error":rel,
          "geometry_reconciliation_pass":geometry_ok,
          "central_allocated_sum_kes_mn":round(sum(central_alloc),2),
          "sensitivity_allocated_sum_kes_mn":round(sum(sens_alloc),2)
        }
        for j,(i,code,name) in enumerate(items):
            a=central_alloc[j]; b=sens_alloc[j]
            mean=(a+b)/2
            spread=abs(a-b)/mean*100 if mean>0 else None
            positive=(a>0 and b>0)
            eligible=(geometry_ok and positive and spread is not None and spread<=gate["max_model_structure_spread_pct"])
            records.append({
              "geo_code":code,"geography_name":name,"level":level,"county_geo_code":p,
              "value":a,"lower_bound":min(a,b),"upper_bound":max(a,b),
              "central_aggdp_weight":c[i],"sensitivity_component_prior_weight":s[i],
              "model_structure_spread_pct":None if spread is None else round(spread,4),
              "publish_eligible":eligible,
              "rejection_reasons":[
                *([] if geometry_ok else ["child_county_geometry_weight_mismatch"]),
                *([] if positive else ["non_positive_central_or_sensitivity_allocation"]),
                *([] if spread is not None and spread<=gate["max_model_structure_spread_pct"] else ["model_structure_spread_exceeds_gate"])
              ]
            })
    return records,county_diag

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--contract",required=True)
    ap.add_argument("--aggdp",required=True)
    ap.add_argument("--crop",required=True)
    ap.add_argument("--livestock",required=True)
    ap.add_argument("--fish",required=True)
    ap.add_argument("--forest",required=True)
    ap.add_argument("--output",required=True)
    a=ap.parse_args()
    c=read_json(a.contract); gate=c["predeclared_publication_gate"]
    probe=read_json(c["sources"]["feasibility_evidence"])
    rho=float(probe["agriculture"]["county_spearman_raw_aggdp2010_vs_knbs_agriculture_gva_2024"])
    if rho<gate["feasibility_spearman_min"]: raise AssertionError(f"feasibility Spearman {rho}")

    controls=official_controls(c["sources"]["official_controls"]["repo_path"],c["sources"]["official_controls"]["year"])
    if len(controls)!=47: raise AssertionError(f"controls={len(controls)}")
    counties=gpd.read_file("data/geography/geometry/counties.geojson")
    county_weights=zonal(counties,a.aggdp)
    county_raw={str(row.geo_code):county_weights[i] for i,row in enumerate(counties.itertuples())}
    rasters={"aggdp":a.aggdp,"crop":a.crop,"livestock":a.livestock,"fish":a.fish,"forest":a.forest}
    all_rows=[]; level_diag={}
    for level,path in [("constituency",c["geography"]["constituency_geometry"]),("ward",c["geography"]["ward_geometry"])]:
        rows,diag=level_candidate(level,path,rasters,controls,county_raw,gate)
        all_rows.extend(rows); level_diag[level]=diag
    eligible=[r for r in all_rows if r["publish_eligible"]]
    rejected=[r for r in all_rows if not r["publish_eligible"]]
    # Exact reconciliation must hold for eligible-only promotion only if every child in a county passes.
    fully_eligible_counties={}
    for level in ("constituency","ward"):
        level_rows=[r for r in all_rows if r["level"]==level]
        by=defaultdict(list)
        for r in level_rows: by[r["county_geo_code"]].append(r)
        fully_eligible_counties[level]=[p for p,rs in by.items() if all(x["publish_eligible"] for x in rs)]
    out={
      "schema_version":"kda.p42.agriculture-gva-candidate.v1",
      "status":"candidate_only_not_yet_promoted",
      "indicator_id":"IND-AGRICULTURE-GVA",
      "reference_year":2024,
      "source_tier":"S5",
      "public_label":"Modelled estimate — county-constrained agricultural spatial allocation",
      "feasibility_spearman":rho,
      "summary":{
        "candidate_cells":len(all_rows),
        "promotion_eligible_cells":len(eligible),
        "rejected_cells":len(rejected),
        "fully_eligible_counties_by_level":fully_eligible_counties,
        "eligible_by_level":{
          "constituency":sum(1 for r in eligible if r["level"]=="constituency"),
          "ward":sum(1 for r in eligible if r["level"]=="ward")
        }
      },
      "county_diagnostics":level_diag,
      "rows":all_rows,
      "uncertainty":{
        "type":"model-structure sensitivity envelope",
        "caveat":"Lower/upper are the min/max of two county-constrained spatial allocations (optimized AgGDP versus summed raw component priors), not a statistical confidence interval."
      }
    }
    Path(a.output).write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out["summary"],indent=2))

if __name__=="__main__":
    main()
