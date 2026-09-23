#!/usr/bin/env python3
import argparse, json, math
from pathlib import Path
import geopandas as gpd
from exactextract import exact_extract

def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def rankdata(vals):
    order=sorted(range(len(vals)), key=lambda i: vals[i])
    ranks=[0.0]*len(vals)
    i=0
    while i<len(order):
        j=i
        while j+1<len(order) and vals[order[j+1]]==vals[order[i]]:
            j+=1
        r=(i+j+2)/2.0
        for k in range(i,j+1): ranks[order[k]]=r
        i=j+1
    return ranks

def spearman(x,y):
    if len(x)!=len(y) or len(x)<2: return None
    rx,ry=rankdata(x),rankdata(y)
    mx=sum(rx)/len(rx); my=sum(ry)/len(ry)
    num=sum((a-mx)*(b-my) for a,b in zip(rx,ry))
    denx=math.sqrt(sum((a-mx)**2 for a in rx)); deny=math.sqrt(sum((b-my)**2 for b in ry))
    return None if denx==0 or deny==0 else num/(denx*deny)

def zonal(gdf, raster):
    # Fractional pixel/polygon coverage avoids false zeros for small KDA geographies
    # when the economic raster is much coarser than constituency/ward geometry.
    s=exact_extract(raster, gdf, ["sum"], output="geojson")
    out=[]
    for feature in s:
        v=(feature.get("properties") or {}).get("sum")
        out.append(0.0 if v is None else float(v))
    return out

def official_controls(subset, year):
    out={}
    for o in subset.get("observations",[]):
        if o.get("indicator_code")!="IND-AGRICULTURE-GVA": continue
        if str(o.get("period_start",""))[:4]!=str(year): continue
        if o.get("source_class")!="official": continue
        code=str(o.get("geo_code",""))
        if not code.startswith("KEN-C") or "-CON" in code or "-W" in code: continue
        out[code]=float(o["value"])
    return out

def profile_level(name,path,rasters):
    g=gpd.read_file(path)
    result={"level":name,"geographies":len(g),"rasters":{}}
    for key,raster in rasters.items():
        sums=zonal(g,raster)
        result["rasters"][key]={
            "positive_geographies":sum(1 for v in sums if v>0),
            "zero_geographies":sum(1 for v in sums if v<=0),
            "min_sum":min(sums) if sums else None,
            "max_sum":max(sums) if sums else None,
            "total_sum":sum(sums)
        }
    return result

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--contract",required=True)
    ap.add_argument("--aggdp",required=True)
    ap.add_argument("--crop",required=True)
    ap.add_argument("--livestock",required=True)
    ap.add_argument("--fish",required=True)
    ap.add_argument("--forest",required=True)
    ap.add_argument("--figshare-manifest",required=True)
    ap.add_argument("--output",required=True)
    args=ap.parse_args()

    c=read_json(args.contract)
    rasters={"aggdp":args.aggdp,"crop_prior":args.crop,"livestock_prior":args.livestock,"fish_prior":args.fish,"forest_prior":args.forest}
    county=gpd.read_file(c["geography"]["county_geometry"])
    if len(county)!=47: raise AssertionError(f"county geometry count {len(county)}")
    agg=zonal(county,args.aggdp)

    subset=read_json(c["sources"]["official_agriculture_control"]["repo_path"])
    controls=official_controls(subset,c["sources"]["official_agriculture_control"]["reference_year"])
    if len(controls)!=47: raise AssertionError(f"official agriculture controls {len(controls)}")

    raw=[]; official=[]
    county_rows=[]
    for i,row in enumerate(county.itertuples()):
        code=str(row.geo_code)
        if code not in controls: raise AssertionError(f"missing official control {code}")
        raw.append(agg[i]); official.append(controls[code])
        county_rows.append({"geo_code":code,"name":str(row.name),"aggdp2010_raw_sum":agg[i],"knbs_agriculture_gva_2024_kes_mn":controls[code]})

    rho=spearman(raw,official)
    gates=c["predeclared_probe_gates"]
    ag_pass=(sum(1 for v in agg if v>0)==gates["county_positive_aggdp_cells"] and rho is not None and rho>=gates["minimum_county_rank_spearman_vs_knbs_2024_agriculture_gva"])

    manifest=read_json(args.figshare_manifest)
    files=manifest if isinstance(manifest,list) else manifest.get("items",manifest.get("files",[]))
    intended=str(c["sources"]["total_gdp_manifest"]["intended_probe_year"])
    candidates=[]
    for f in files:
        name=str(f.get("name",""))
        if intended in name and any(t in name.lower() for t in ["gdp","gross"]):
            candidates.append({"id":f.get("id"),"name":name,"size":f.get("size"),"download_url":f.get("download_url")})
    candidates=sorted(candidates,key=lambda x:(x["size"] if isinstance(x.get("size"),(int,float)) else 10**30,x["name"]))
    total_gdp_runnable=bool(candidates and isinstance(candidates[0].get("size"),(int,float)) and candidates[0]["size"]<=gates["max_total_gdp_probe_download_bytes"])

    out={
      "schema_version":"kda.p42.economic-gridded-source-probe.v1",
      "status":"probe_only_no_promotion",
      "agriculture":{
        "county_spearman_raw_aggdp2010_vs_knbs_agriculture_gva_2024":round(rho,6) if rho is not None else None,
        "county_positive_aggdp":sum(1 for v in agg if v>0),
        "passes_predeclared_spatial_prior_gate":ag_pass,
        "county_rows":county_rows,
        "level_profiles":[
          profile_level("county",c["geography"]["county_geometry"],rasters),
          profile_level("constituency",c["geography"]["constituency_geometry"],rasters),
          profile_level("ward",c["geography"]["ward_geometry"],rasters)
        ]
      },
      "total_gdp":{
        "figshare_2019_candidates":candidates,
        "probe_download_runnable_under_size_gate":total_gdp_runnable,
        "size_gate_bytes":gates["max_total_gdp_probe_download_bytes"]
      },
      "conclusion":"agriculture_spatial_prior_feasible" if ag_pass else "agriculture_spatial_prior_not_yet_validated"
    }
    Path(args.output).write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
      "agriculture_pass":ag_pass,
      "spearman":out["agriculture"]["county_spearman_raw_aggdp2010_vs_knbs_agriculture_gva_2024"],
      "county_positive":out["agriculture"]["county_positive_aggdp"],
      "total_gdp_candidate_count":len(candidates),
      "total_gdp_runnable":total_gdp_runnable
    },indent=2))

if __name__=="__main__":
    main()
