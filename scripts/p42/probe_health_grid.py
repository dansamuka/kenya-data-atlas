#!/usr/bin/env python3
import argparse, json, math, tempfile
from pathlib import Path
import numpy as np
import geopandas as gpd
import rasterio
from rasterio.warp import reproject, Resampling
from rasterstats import zonal_stats

def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def official_controls(path, indicator, year):
    d=read_json(path)
    out={}
    for o in d.get("observations",[]):
        if o.get("indicator_code")!=indicator: continue
        code=str(o.get("geo_code",""))
        if not code.startswith("KEN-C") or "-CON" in code or "-W" in code: continue
        if str(o.get("period_start",""))[:4]!=str(year): continue
        if o.get("source_class")!="official": continue
        if o.get("value") is None: continue
        out[code]=float(o["value"])
    return out

def scale_percent(a):
    finite=a[np.isfinite(a)]
    if finite.size==0: raise AssertionError("raster has no finite values")
    # Released surfaces may be proportions or percentages; normalize deterministically.
    return a*100.0 if float(np.nanmax(finite))<=1.5 else a

def load_surface(path):
    with rasterio.open(path) as src:
        a=src.read(1,masked=True).filled(np.nan).astype("float64")
        return scale_percent(a), src.transform, src.crs, src.width, src.height

def population_to_grid(pop_path, dst_transform, dst_crs, width, height):
    out=np.zeros((height,width),dtype="float64")
    with rasterio.open(pop_path) as src:
        srca=src.read(1,masked=True).filled(0).astype("float64")
        reproject(
            source=srca,destination=out,
            src_transform=src.transform,src_crs=src.crs,
            dst_transform=dst_transform,dst_crs=dst_crs,
            src_nodata=src.nodata,dst_nodata=0,
            resampling=Resampling.sum
        )
    out[~np.isfinite(out)]=0
    out[out<0]=0
    return out

def weighted_polygon_stats(gdf, value, lower, upper, pop, transform):
    valid=np.isfinite(value)&(pop>0)
    den=np.where(valid,pop,0.0)
    num=np.where(valid,value*pop,0.0)
    lo=np.where(np.isfinite(lower)&(pop>0),lower*pop,0.0)
    hi=np.where(np.isfinite(upper)&(pop>0),upper*pop,0.0)
    kwargs=dict(affine=transform,stats=["sum"],all_touched=False,nodata=np.nan)
    ds=zonal_stats(gdf.geometry,den,**kwargs)
    ns=zonal_stats(gdf.geometry,num,**kwargs)
    ls=zonal_stats(gdf.geometry,lo,**kwargs)
    hs=zonal_stats(gdf.geometry,hi,**kwargs)
    rows=[]
    for i,r in enumerate(gdf.itertuples()):
        d=float(ds[i].get("sum") or 0)
        if d<=0:
            mean=l=h=None
        else:
            mean=float(ns[i].get("sum") or 0)/d
            l=float(ls[i].get("sum") or 0)/d
            h=float(hs[i].get("sum") or 0)/d
        rows.append({
            "geo_code":str(r.geo_code),"name":str(r.name),
            "population_weight":d,
            "model_mean_pct":None if mean is None else round(mean,4),
            "diagnostic_weighted_grid_lower_pct":None if l is None else round(l,4),
            "diagnostic_weighted_grid_upper_pct":None if h is None else round(h,4)
        })
    return rows

def coherence(rows, controls, gate):
    pairs=[]
    for r in rows:
        if r["geo_code"] in controls and r["model_mean_pct"] is not None:
            err=r["model_mean_pct"]-controls[r["geo_code"]]
            pairs.append({**r,"official_value_pct":controls[r["geo_code"]],"error_pp":round(err,4)})
    if not pairs:
        return {"pairs":0,"pass":False}
    errs=[p["error_pp"] for p in pairs]
    mae=sum(abs(e) for e in errs)/len(errs)
    rmse=math.sqrt(sum(e*e for e in errs)/len(errs))
    bias=sum(errs)/len(errs)
    ok=(len(pairs)==gate["expected_counties"] and mae<=gate["max_mae_pp"] and rmse<=gate["max_rmse_pp"] and abs(bias)<=gate["max_absolute_mean_bias_pp"])
    return {"pairs":len(pairs),"mae_pp":round(mae,4),"rmse_pp":round(rmse,4),"mean_bias_pp":round(bias,4),"pass":ok,"rows":pairs}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--contract",required=True)
    ap.add_argument("--population",required=True)
    ap.add_argument("--surface-dir",required=True)
    ap.add_argument("--output",required=True)
    args=ap.parse_args()
    c=read_json(args.contract)
    gate=c["predeclared_county_gate"]
    geos={k:gpd.read_file(v) for k,v in c["geography"].items()}
    expected={"county":47,"constituency":290,"ward":1450}
    for k,g in geos.items():
        if len(g)!=expected[k]: raise AssertionError(f"{k} geometry count {len(g)}")

    results=[]
    for m in c["mappings"]:
        p=Path(args.surface_dir)
        mean,transform,crs,w,h=load_surface(p/f'{m["source_prefix"]}_round2.tif')
        lower,t2,c2,w2,h2=load_surface(p/f'{m["source_prefix"]}_round2_lower.tif')
        upper,t3,c3,w3,h3=load_surface(p/f'{m["source_prefix"]}_round2_upper.tif')
        if (transform,crs,w,h)!=(t2,c2,w2,h2) or (transform,crs,w,h)!=(t3,c3,w3,h3):
            raise AssertionError(m["kda_indicator"]+" surface grids differ")
        pop=population_to_grid(args.population,transform,crs,w,h)
        level_rows={k:weighted_polygon_stats(g,mean,lower,upper,pop,transform) for k,g in geos.items()}
        controls=official_controls(f'data/distribution/subsets/indicators/{m["kda_indicator"]}.json',m["kda_indicator"],m["official_control_year"])
        if len(controls)!=47: raise AssertionError(f'{m["kda_indicator"]}: controls={len(controls)}')
        coh=coherence(level_rows["county"],controls,gate)
        results.append({
          "indicator_id":m["kda_indicator"],"source_prefix":m["source_prefix"],
          "county_coherence":coh,
          "coverage":{k:{"geographies":len(v),"positive_population_weight":sum(1 for x in v if x["population_weight"]>0),"numeric_model_means":sum(1 for x in v if x["model_mean_pct"] is not None)} for k,v in level_rows.items()},
          "levels":level_rows
        })
    out={
      "schema_version":"kda.p42.health-grid-source-probe.v1",
      "status":"probe_only_no_promotion",
      "source":c["source"],
      "county_gate":gate,
      "results":results,
      "passing_indicators":[r["indicator_id"] for r in results if r["county_coherence"]["pass"]],
      "notes":[
        "Point estimates are population-weighted custom KDA polygon aggregations of published 2022 WorldPop grid predictions.",
        "Weighted grid-level lower/upper surfaces are retained only as diagnostics and are not polygon-level credible intervals.",
        "No values are promoted by this probe."
      ]
    }
    Path(args.output).write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
      "passing":out["passing_indicators"],
      "metrics":{r["indicator_id"]:r["county_coherence"] for r in results}
    },indent=2))

if __name__=="__main__":
    main()
