#!/usr/bin/env python3
import argparse, json, math
from pathlib import Path
import geopandas as gpd
from rasterstats import zonal_stats

def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def official_controls(pop_subset):
    rows={}
    for o in pop_subset.get("observations",[]):
        if o.get("indicator_code")!="IND-POPULATION": continue
        if not str(o.get("geo_code","")).startswith("KEN-C"): continue
        if o.get("period_start")!="2019-08-24": continue
        if o.get("source_class")!="official": continue
        rows[o["geography_id"]]={
            "value":int(round(float(o["value"]))),
            "geo_code":o["geo_code"]
        }
    return rows

def allocate_integer(total, weights_by_id):
    if total < 0: raise ValueError("negative official total")
    s=sum(max(0.0,float(v)) for v in weights_by_id.values())
    if s<=0: raise ValueError("all spatial weights are zero")
    exact={k: total*max(0.0,float(v))/s for k,v in weights_by_id.items()}
    base={k:int(math.floor(v)) for k,v in exact.items()}
    residual=total-sum(base.values())
    order=sorted(exact, key=lambda k:(-(exact[k]-base[k]), k))
    for k in order[:residual]:
        base[k]+=1
    if sum(base.values())!=total: raise AssertionError("largest remainder failed")
    return base, exact

def zonal_sums(gdf, raster_path):
    stats=zonal_stats(gdf.geometry, raster_path, stats=["sum"], all_touched=False)
    return [0.0 if r.get("sum") is None else float(r["sum"]) for r in stats]

def build_level(level, geo_path, central_raster, sensitivity_raster, controls, registry, spread_limit):
    g=gpd.read_file(geo_path)
    if len(g)!=(290 if level=="constituency" else 1450):
        raise AssertionError(f"{level} geometry count {len(g)}")
    central_raw=zonal_sums(g, central_raster)
    sensitivity_raw=zonal_sums(g, sensitivity_raster)

    if level=="constituency":
        county_by_child={str(row.geography_id):str(row.parent_id) for row in g.itertuples()}
    else:
        constituency_parent={}
        # Registry is authoritative for hierarchy; ward parent is constituency.
        by_id={str(x["geography_id"]):x for x in registry}
        for row in g.itertuples():
            ward_parent=str(row.parent_id)
            parent=by_id.get(ward_parent)
            if not parent: raise AssertionError(f"missing constituency parent {ward_parent}")
            county_by_child[str(row.geography_id)]=str(parent["parent_id"])

    records=[]
    grouped={}
    for i,row in enumerate(g.itertuples()):
        gid=str(row.geography_id)
        county_id=county_by_child[gid]
        if county_id not in controls: raise AssertionError(f"no official county control for {gid} -> {county_id}")
        grouped.setdefault(county_id,[]).append((i,gid,row))

    for county_id,items in grouped.items():
        total=controls[county_id]["value"]
        cweights={gid:central_raw[i] for i,gid,_ in items}
        uweights={gid:sensitivity_raw[i] for i,gid,_ in items}
        if sum(cweights.values())<=0 or sum(uweights.values())<=0:
            raise AssertionError(f"{level}/{county_id}: a WorldPop variant has zero county weight")
        calloc,_=allocate_integer(total,cweights)
        ualloc,_=allocate_integer(total,uweights)
        for i,gid,row in items:
            c=calloc[gid]; u=ualloc[gid]
            denom=(c+u)/2
            spread=0.0 if denom==0 else abs(c-u)/denom*100
            positive=(c>0 and u>0)
            eligible=positive and spread<=spread_limit
            rec={
                "indicator_id":"IND-POPULATION",
                "geography_id":gid,
                "geo_code":str(row.geo_code),
                "name":str(row.name),
                "level":level,
                "county_geography_id":county_id,
                "county_geo_code":controls[county_id]["geo_code"],
                "period_start":"2019-08-24",
                "period_end":"2019-08-25",
                "boundary_version":"2012-01",
                "value":c,
                "sensitivity_value":u,
                "lower_bound":min(c,u),
                "upper_bound":max(c,u),
                "model_structure_spread_pct":round(spread,4),
                "raw_constrained_sum":round(central_raw[i],6),
                "raw_unconstrained_sum":round(sensitivity_raw[i],6),
                "source_tier":"S5",
                "geographic_method":"county_constrained_worldpop_spatial_allocation",
                "public_label":"Modelled estimate",
                "uncertainty_type":"model_structure_sensitivity_envelope",
                "publish_eligible":eligible,
                "ineligibility_reason":None if eligible else ("non_positive_variant" if not positive else "worldpop_variant_spread_above_threshold")
            }
            records.append(rec)

    # Exact reconciliation is mandatory after integer allocation.
    by_county={}
    for r in records:
        by_county.setdefault(r["county_geography_id"],0)
        by_county[r["county_geography_id"]]+=r["value"]
    for cid,total in by_county.items():
        if total!=controls[cid]["value"]:
            raise AssertionError(f"{level}/{cid}: central allocation {total} != official {controls[cid]['value']}")
    return sorted(records,key=lambda r:r["geo_code"])

def summarize(records):
    spreads=sorted(r["model_structure_spread_pct"] for r in records)
    def pct(q):
        if not spreads:return None
        i=min(len(spreads)-1,max(0,round((len(spreads)-1)*q)))
        return spreads[i]
    return {
        "cells":len(records),
        "promotion_eligible_cells":sum(1 for r in records if r["publish_eligible"]),
        "ineligible_cells":sum(1 for r in records if not r["publish_eligible"]),
        "median_model_structure_spread_pct":pct(0.5),
        "p90_model_structure_spread_pct":pct(0.9),
        "max_model_structure_spread_pct":max(spreads) if spreads else None
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--contract",required=True)
    ap.add_argument("--central-raster",required=True)
    ap.add_argument("--sensitivity-raster",required=True)
    ap.add_argument("--output",required=True)
    args=ap.parse_args()
    contract=read_json(args.contract)
    subset=read_json(contract["sources"]["official_controls"]["repo_path"])
    controls=official_controls(subset)
    expected=contract["sources"]["official_controls"]
    if len(controls)!=expected["expected_counties"]:
        raise AssertionError(f"official controls {len(controls)} != {expected['expected_counties']}")
    national=sum(x["value"] for x in controls.values())
    if national!=expected["expected_national_total"]:
        raise AssertionError(f"official national total {national} != {expected['expected_national_total']}")
    registry=read_json("data/geography/registry/geographies.json")
    limit=float(contract["predeclared_publication_gate"]["max_model_structure_spread_pct"])
    constituency=build_level("constituency",contract["geography"]["constituency_geometry"],args.central_raster,args.sensitivity_raster,controls,registry,limit)
    ward=build_level("ward",contract["geography"]["ward_geometry"],args.central_raster,args.sensitivity_raster,controls,registry,limit)
    rows=constituency+ward
    # National totals must reconcile independently at both local levels.
    if sum(r["value"] for r in constituency)!=national: raise AssertionError("constituency national reconciliation failed")
    if sum(r["value"] for r in ward)!=national: raise AssertionError("ward national reconciliation failed")
    out={
        "schema_version":"kda.p42.worldpop-population-candidate.v1",
        "execution_id":contract["execution_id"],
        "generated_from_contract":args.contract,
        "status":"candidate_only_not_yet_promoted",
        "method":"County-constrained 2019 WorldPop spatial allocation of official KNBS 2019 county census totals.",
        "source_tier":"S5",
        "official_national_total":national,
        "central_surface":contract["sources"]["central_spatial_surface"],
        "sensitivity_surface":contract["sources"]["sensitivity_spatial_surface"],
        "publication_gate":contract["predeclared_publication_gate"],
        "summary":{
            "constituency":summarize(constituency),
            "ward":summarize(ward),
            "total_cells":len(rows),
            "promotion_eligible_cells":sum(1 for r in rows if r["publish_eligible"])
        },
        "rows":rows
    }
    Path(args.output).write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out["summary"],indent=2))

if __name__=="__main__":
    main()
