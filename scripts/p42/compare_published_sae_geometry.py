#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path
import geopandas as gpd
from shapely.geometry import Polygon, MultiPolygon

SCRIPT_RE=re.compile(r'<script type="application/json" data-for="([^"]+)">(.*?)</script>', re.S)

def rings_to_geom(x):
    # leaflet R htmlwidgets encodes polygon(s) as nested [[[{"lng":[...],"lat":[...]}]]].
    polys=[]
    def walk(node):
        if isinstance(node,dict) and isinstance(node.get("lng"),list) and isinstance(node.get("lat"),list):
            coords=list(zip(node["lng"],node["lat"]))
            if len(coords)>=3:
                if coords[0]!=coords[-1]: coords.append(coords[0])
                try:
                    p=Polygon(coords)
                    if not p.is_valid: p=p.buffer(0)
                    if not p.is_empty:
                        if p.geom_type=="Polygon": polys.append(p)
                        elif p.geom_type=="MultiPolygon": polys.extend(list(p.geoms))
                except Exception:
                    pass
        elif isinstance(node,list):
            for child in node: walk(child)
    walk(x)
    if not polys: return None
    if len(polys)==1: return polys[0]
    return MultiPolygon(polys)

def label_fields(label):
    region=re.search(r'Region:\s*([^<]+)',label or "")
    upper=re.search(r'Upper Admin:\s*([^<]+)',label or "")
    return (region.group(1).strip() if region else None, upper.group(1).strip() if upper else None)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--html",required=True)
    ap.add_argument("--output",required=True)
    args=ap.parse_args()
    raw=Path(args.html).read_text(encoding="utf-8")
    widgets=[]
    for wid,payload in SCRIPT_RE.findall(raw):
        j=json.loads(payload)
        calls=j.get("x",{}).get("calls",[])
        poly=next((c for c in calls if c.get("method")=="addPolygons" and isinstance(c.get("args"),list) and len(c["args"][0])==290),None)
        if poly: widgets.append((wid,poly))
    if len(widgets)<2: raise AssertionError(f"expected at least 2 Admin2 map widgets, found {len(widgets)}")
    # HTML order is baseline (2014) then latest (2022); use final Admin2 widget.
    wid,call=widgets[-1]
    shapes=call["args"][0]
    labels=call["args"][6]
    if len(shapes)!=290 or len(labels)!=290: raise AssertionError("Admin2 shapes/labels must both have 290 records")
    src_rows=[]
    for i,(shape,label) in enumerate(zip(shapes,labels)):
        geom=rings_to_geom(shape)
        if geom is None or geom.is_empty: raise AssertionError(f"source polygon {i} has no geometry")
        region,upper=label_fields(label)
        src_rows.append({"source_index":i,"source_region":region,"source_parent":upper,"geometry":geom})
    src=gpd.GeoDataFrame(src_rows,crs="EPSG:4326").to_crs("EPSG:32637")
    kda=gpd.read_file("data/geography/geometry/constituencies.geojson").to_crs("EPSG:32637")
    if len(kda)!=290: raise AssertionError(f"KDA constituency count {len(kda)} != 290")
    # Candidate intersections only; calculate IoU and source/kda coverage.
    pairs=gpd.sjoin(src,kda[["geography_id","geo_code","name","geometry"]],how="inner",predicate="intersects")
    results=[]
    for sidx,grp in pairs.groupby("source_index"):
        sgeom=src.loc[src.source_index==sidx].iloc[0].geometry
        candidates=[]
        for _,p in grp.iterrows():
            krow=kda.loc[p["index_right"]]
            kg=krow.geometry
            inter=sgeom.intersection(kg).area
            union=sgeom.union(kg).area
            iou=0 if union<=0 else inter/union
            scov=0 if sgeom.area<=0 else inter/sgeom.area
            kcov=0 if kg.area<=0 else inter/kg.area
            candidates.append({
              "geo_code":str(krow.geo_code),"kda_name":str(krow["name"]),
              "intersection_over_union":round(iou,6),
              "source_area_covered":round(scov,6),
              "kda_area_covered":round(kcov,6)
            })
        candidates.sort(key=lambda x:(-x["intersection_over_union"],x["geo_code"]))
        row=src.loc[src.source_index==sidx].iloc[0]
        best=candidates[0] if candidates else None
        results.append({
          "source_index":int(sidx),"source_region":row.source_region,"source_parent":row.source_parent,
          "best_match":best,"runner_up":candidates[1] if len(candidates)>1 else None
        })
    best_codes=[r["best_match"]["geo_code"] for r in results if r["best_match"]]
    duplicate_best=sorted([c for c in set(best_codes) if best_codes.count(c)>1])
    def n_at(t): return sum(1 for r in results if r["best_match"] and r["best_match"]["intersection_over_union"]>=t)
    low=sorted(results,key=lambda r:r["best_match"]["intersection_over_union"] if r["best_match"] else -1)[:30]
    out={
      "schema_version":"kda.p42.published-sae-geometry-crosswalk.v1",
      "assessed_on":"2026-09-23",
      "source_map":"UW-Statistics gatesweb_html1 Kenya CN_NUTS_C_HA2 2022 Admin2 widget",
      "source_widget_id":wid,
      "source_polygons":len(src),
      "kda_constituencies":len(kda),
      "unique_best_match_codes":len(set(best_codes)),
      "duplicate_best_match_codes":duplicate_best,
      "threshold_counts":{
        "iou_ge_0_99":n_at(.99),"iou_ge_0_98":n_at(.98),"iou_ge_0_95":n_at(.95),
        "iou_ge_0_90":n_at(.90),"iou_ge_0_80":n_at(.80),"iou_ge_0_50":n_at(.50)
      },
      "minimum_best_iou":min(r["best_match"]["intersection_over_union"] for r in results if r["best_match"]),
      "median_best_iou":sorted(r["best_match"]["intersection_over_union"] for r in results if r["best_match"])[len(results)//2],
      "lowest_overlap_examples":low,
      "rows":results
    }
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:out[k] for k in ["source_polygons","unique_best_match_codes","duplicate_best_match_codes","threshold_counts","minimum_best_iou","median_best_iou"]},indent=2))

if __name__=="__main__": main()
