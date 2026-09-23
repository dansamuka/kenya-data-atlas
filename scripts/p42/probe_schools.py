#!/usr/bin/env python3
import json, ssl, urllib.request
from pathlib import Path

URL="https://energydata.info/dataset/2fda191d-c3c6-4002-8c82-daa02008a9e3/resource/129b8c79-de8b-4b7b-8310-cdd207e46863/download/schools.json"
OUT=Path("data/p42/schools-source-probe.json")

req=urllib.request.Request(URL, headers={"User-Agent":"Kenya-Data-Atlas-P42/1.0","Accept":"application/json"})
with urllib.request.urlopen(req, timeout=120, context=ssl.create_default_context()) as r:
    raw=r.read()
    status=r.status
payload=json.loads(raw.decode("utf-8"))
if isinstance(payload,dict) and isinstance(payload.get("features"),list):
    features=payload["features"]
elif isinstance(payload,list):
    features=payload
else:
    raise RuntimeError("unexpected schools JSON shape")
props=[]
valid_points=0
for x in features:
    if isinstance(x,dict) and isinstance(x.get("properties"),dict):
        props.append(x["properties"])
    elif isinstance(x,dict):
        props.append(x)
    geom=x.get("geometry") if isinstance(x,dict) else None
    if isinstance(geom,dict) and geom.get("type")=="Point" and isinstance(geom.get("coordinates"),list) and len(geom["coordinates"])>=2:
        valid_points+=1
fields=sorted({k for p in props for k in p.keys()})
category_fields=[f for f in fields if any(t in f.lower() for t in ["type","level","primary","secondary","school","public","private","sponsor","owner"])]
geo_fields=[f for f in fields if any(t in f.lower() for t in ["county","constitu","ward","district","location","lat","lon","long"])]
profiles={}
for f in category_fields:
    vals=[str(p.get(f)).strip() for p in props if p.get(f) not in (None,"")]
    uniq={}
    for v in vals: uniq[v]=uniq.get(v,0)+1
    profiles[f]=sorted(uniq.items(), key=lambda kv:(-kv[1],kv[0]))[:30]
out={
  "schema_version":"kda.p42.schools-source-probe.v1",
  "probed_on":"2026-09-23",
  "url":URL,
  "http_status":status,
  "records":len(features),
  "valid_point_geometries":valid_points,
  "field_names":fields,
  "category_fields":category_fields,
  "geography_fields":geo_fields,
  "category_value_profiles":profiles,
  "source_statement":"World Bank EnergyData dataset states that school locations were provided by Kenya Ministry of Education and comprise primary and secondary schools.",
  "license":"CC BY 4.0",
  "raw_records_committed":False,
  "conclusion":"reachable_and_spatial" if status==200 and valid_points>0 else "not_usable"
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
print(json.dumps(out,indent=2))
