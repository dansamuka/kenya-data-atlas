#!/usr/bin/env python3
import argparse, json, math
from pathlib import Path
import geopandas as gpd
import pandas as pd

def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def load_worldbank(path):
    raw=read_json(path)
    if isinstance(raw,dict) and isinstance(raw.get("features"),list):
        g=gpd.GeoDataFrame.from_features(raw["features"], crs="EPSG:4326")
    elif isinstance(raw,list):
        df=pd.DataFrame(raw)
        lat=next((c for c in df.columns if c.lower() in ["latitude","lat","y_coord","y","ycoord"]),None)
        lon=next((c for c in df.columns if c.lower() in ["longitude","lon","lng","x_coord","x","xcoord"]),None)
        if not lat or not lon: raise AssertionError(f"World Bank source has no obvious coordinate fields: {list(df.columns)}")
        g=gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(pd.to_numeric(df[lon],errors="coerce"),pd.to_numeric(df[lat],errors="coerce")),crs="EPSG:4326")
    else:
        raise AssertionError("unexpected World Bank JSON shape")
    g=g[g.geometry.notna() & ~g.geometry.is_empty].copy()
    return g.to_crs("EPSG:4326")

def load_osm(path):
    g=gpd.read_file(path)
    if g.crs is None: g=g.set_crs("EPSG:4326")
    g=g.to_crs("EPSG:4326")
    g=g[g.geometry.notna() & ~g.geometry.is_empty].copy()
    # Polygon/line health features become representative points only for allocation counting.
    g["geometry"]=g.geometry.representative_point()
    return g

def county_map(registry):
    by={str(x["geography_id"]):x for x in registry}
    out={}
    for x in registry:
        gid=str(x["geography_id"])
        level=x.get("level")
        if level=="county": out[gid]=gid
        elif level=="constituency": out[gid]=str(x["parent_id"])
        elif level=="ward":
            p=by.get(str(x["parent_id"]))
            if p: out[gid]=str(p["parent_id"])
    return out

def assign(points, geo_path, level, cby):
    geo=gpd.read_file(geo_path).to_crs("EPSG:4326")
    cols=["geography_id","geo_code","name","geometry"]
    geo=geo[cols]
    # intersects is deliberate: boundary points may match >1 polygon; resolve deterministically by geo_code.
    joined=gpd.sjoin(points[["geometry"]],geo,how="inner",predicate="intersects")
    joined=joined.sort_values(["index_left","geo_code"]).drop_duplicates("index_left",keep="first")
    counts=joined.groupby(["geography_id","geo_code","name"]).size().reset_index(name="points")
    rows=[]
    for r in geo.drop(columns="geometry").itertuples():
        gid=str(r.geography_id)
        found=counts[counts.geography_id==gid]
        n=0 if found.empty else int(found.iloc[0]["points"])
        rows.append({"geography_id":gid,"geo_code":str(r.geo_code),"name":str(r.name),"county_geography_id":cby[gid],"points":n})
    return rows, len(joined), len(points)-len(joined)

def allocate(total, rows):
    weights={r["geography_id"]:r["points"] for r in rows}
    s=sum(weights.values())
    if s<=0: return None
    exact={k:total*v/s for k,v in weights.items()}
    base={k:int(math.floor(v)) for k,v in exact.items()}
    residual=total-sum(base.values())
    order=sorted(exact,key=lambda k:(-(exact[k]-base[k]),k))
    for k in order[:residual]: base[k]+=1
    return base

def controls(path):
    j=read_json(path)
    return {str(o["geography_id"]):int(round(float(o["value"]))) for o in j.get("observations",[]) if str(o.get("geo_code","")).startswith("KEN-C")}

def compare_level(level, central_rows, sensitivity_rows, control_map, threshold):
    cidx={r["geography_id"]:r for r in central_rows}
    sidx={r["geography_id"]:r for r in sensitivity_rows}
    bycounty={}
    for gid,r in cidx.items(): bycounty.setdefault(r["county_geography_id"],[]).append(gid)
    out=[]
    county_issues=[]
    for cid,gids in sorted(bycounty.items()):
        if cid not in control_map:
            county_issues.append({"county_geography_id":cid,"reason":"missing_official_control"}); continue
        crows=[cidx[g] for g in gids]; srows=[sidx[g] for g in gids]
        ca=allocate(control_map[cid],crows); sa=allocate(control_map[cid],srows)
        if ca is None or sa is None:
            county_issues.append({"county_geography_id":cid,"reason":"one_source_has_zero_county_points","central_points":sum(x["points"] for x in crows),"sensitivity_points":sum(x["points"] for x in srows)})
            continue
        for gid in gids:
            c=ca[gid]; s=sa[gid]
            mean=(c+s)/2
            spread=0.0 if mean==0 else abs(c-s)/mean*100
            stable=spread<=threshold
            out.append({
              "geography_id":gid,"geo_code":cidx[gid]["geo_code"],"name":cidx[gid]["name"],
              "level":level,"county_geography_id":cid,
              "central_source_points":cidx[gid]["points"],"sensitivity_source_points":sidx[gid]["points"],
              "central_allocated_control":c,"sensitivity_allocated_control":s,
              "model_structure_spread_pct":round(spread,4),"stable":stable
            })
    return out,county_issues

def summary(rows):
    vals=sorted(r["model_structure_spread_pct"] for r in rows)
    def q(p):
        if not vals:return None
        return vals[min(len(vals)-1,round((len(vals)-1)*p))]
    return {
      "cells_compared":len(rows),"stable_cells":sum(r["stable"] for r in rows),
      "median_spread_pct":q(.5),"p90_spread_pct":q(.9),"max_spread_pct":max(vals) if vals else None,
      "both_sources_zero_point_cells":sum(r["central_source_points"]==0 and r["sensitivity_source_points"]==0 for r in rows),
      "central_zero_point_cells":sum(r["central_source_points"]==0 for r in rows),
      "sensitivity_zero_point_cells":sum(r["sensitivity_source_points"]==0 for r in rows)
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--worldbank",required=True); ap.add_argument("--osm",required=True); ap.add_argument("--output",required=True)
    ap.add_argument("--threshold",type=float,default=50.0)
    args=ap.parse_args()
    registry=read_json("data/geography/registry/geographies.json"); cby=county_map(registry)
    central=load_worldbank(args.worldbank); sensitivity=load_osm(args.osm)
    stock=controls("data/distribution/subsets/indicators/IND-HEALTH-FACILITY-STOCK.json")
    assessed=controls("data/distribution/subsets/indicators/IND-HEALTH-FACILITY-COUNT.json")
    if len(stock)!=47 or len(assessed)!=47: raise AssertionError("expected 47 county controls for both health facility indicators")

    result={"schema_version":"kda.p42.health-spatial-probe.v1","as_of":"2026-09-23",
      "central_source":{"name":"World Bank / Government of Kenya healthcare facility locations","records":len(central)},
      "sensitivity_source":{"name":"OpenStreetMap via Geofabrik Kenya extract","records":len(sensitivity)},
      "predeclared_max_model_structure_spread_pct":args.threshold,
      "levels":{}}
    for level,path in [("constituency","data/geography/geometry/constituencies.geojson"),("ward","data/geography/geometry/wards.geojson")]:
        cr,cmatched,cunmatched=assign(central,path,level,cby)
        sr,smatched,sunmatched=assign(sensitivity,path,level,cby)
        stock_rows,stock_issues=compare_level(level,cr,sr,stock,args.threshold)
        assessed_rows,assessed_issues=compare_level(level,cr,sr,assessed,args.threshold)
        result["levels"][level]={
          "central_matched_points":cmatched,"central_unmatched_points":cunmatched,
          "sensitivity_matched_points":smatched,"sensitivity_unmatched_points":sunmatched,
          "stock":summary(stock_rows),"assessed":summary(assessed_rows),
          "stock_county_issues":stock_issues,"assessed_county_issues":assessed_issues,
          "rows":stock_rows
        }
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:{m:v[m] for m in ["stock","assessed"]} for k,v in result["levels"].items()},indent=2))

if __name__=="__main__": main()
