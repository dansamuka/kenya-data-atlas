#!/usr/bin/env python3
import json
from pathlib import Path
import numpy as np
import xarray as xr

URL="https://digital-atlas.s3.amazonaws.com/cdh/data/mapspam2020-v2r2/spam2020-v2r2.zarr"
OUT=Path("data/p42/mapspam-maize-source-probe.json")

ds=xr.open_zarr(URL, consolidated=None)
dims={k:int(v) for k,v in ds.sizes.items()}
coords={k:[str(x) for x in ds.coords[k].values[:60].tolist()] for k in ds.coords if ds.coords[k].ndim==1 and ds.coords[k].size<=100}
if "crop" not in ds.coords or "technology" not in ds.coords:
    raise AssertionError("MAPSPAM cube is missing crop/technology coordinates")
crop_vals=[str(x) for x in ds["crop"].values.tolist()]
tech_vals=[str(x) for x in ds["technology"].values.tolist()]
if "maiz" not in crop_vals: raise AssertionError(f"maiz not found in crop codes: {crop_vals}")
if "all" not in tech_vals: raise AssertionError(f"all not found in technology codes: {tech_vals}")
# Kenya bounding box with buffer; y ordering may be descending.
xmin,xmax,ymin,ymax=33.5,42.2,-5.2,5.5
x=ds["x"]
y=ds["y"]
yslice=slice(ymax,ymin) if float(y[0])>float(y[-1]) else slice(ymin,ymax)
win=ds.sel(x=slice(xmin,xmax), y=yslice, crop="maiz", technology="all")
stats={}
for v in ["physical_area","harvested_area","production","yield"]:
    if v not in win: raise AssertionError(f"missing MAPSPAM variable {v}")
    arr=win[v].values
    finite=np.isfinite(arr) & (arr!=-9999)
    vals=arr[finite]
    stats[v]={
      "shape":list(arr.shape),
      "finite_cells":int(finite.sum()),
      "positive_cells":int((vals>0).sum()) if vals.size else 0,
      "min":float(vals.min()) if vals.size else None,
      "max":float(vals.max()) if vals.size else None,
      "sum":float(vals.sum()) if vals.size and v!="yield" else None,
      "mean":float(vals.mean()) if vals.size else None
    }
out={
  "schema_version":"kda.p42.mapspam-maize-source-probe.v1",
  "probed_on":"2026-09-23",
  "url":URL,
  "dataset":"MAPSPAM 2020 v2r2",
  "publisher":"International Food Policy Research Institute (IFPRI)",
  "license":"CC-BY-SA-4.0",
  "resolution":"5 arc-minutes (~10 km at equator)",
  "reference_year":2020,
  "dimensions":dims,
  "crop_code":"maiz",
  "technology":"all",
  "variables":["physical_area","harvested_area","production","yield"],
  "coordinate_values":coords,
  "kenya_window":stats,
  "intended_kda_use":"spatial allocation weights only; official KDA 2023 KNBS county maize totals remain the controls",
  "publication_tier_if_used":"S5 modelled",
  "conclusion":"reachable_and_machine_readable"
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
print(json.dumps(out,indent=2))
