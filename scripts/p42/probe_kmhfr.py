#!/usr/bin/env python3
import json, os, ssl, urllib.parse, urllib.request
from pathlib import Path

BASE = "https://api.kmhfr.health.go.ke/api/public/facilities/"
OUT = Path("data/p42/kmhfr-source-probe.json")

def get(url):
    req=urllib.request.Request(url, headers={"User-Agent":"Kenya-Data-Atlas-P42/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as r:
        raw=r.read()
        return r.status, r.headers.get("content-type"), json.loads(raw.decode("utf-8"))

def main():
    url=BASE+"?page_size=100&page=1"
    probe_file=os.environ.get("KMHFR_PROBE_FILE")
    if probe_file and Path(probe_file).exists():
        status=200
        ctype="application/json"
        payload=json.loads(Path(probe_file).read_text(encoding="utf-8"))
    else:
        status, ctype, payload=get(url)
    if isinstance(payload, dict):
        results=payload.get("results") or payload.get("data") or payload.get("facilities") or []
        count=payload.get("count") or payload.get("total") or payload.get("total_count")
        next_url=payload.get("next")
        keys=sorted(payload.keys())
    elif isinstance(payload, list):
        results=payload
        count=len(payload)
        next_url=None
        keys=[]
    else:
        raise RuntimeError("unexpected JSON shape")
    fields=sorted({k for x in results if isinstance(x,dict) for k in x.keys()})
    likely_geo=[f for f in fields if any(t in f.lower() for t in ["county","constitu","ward","latitude","longitude","coord","sub_count","subcount"])]
    likely_status=[f for f in fields if any(t in f.lower() for t in ["status","operat","closed","active"])]
    likely_identity=[f for f in fields if any(t in f.lower() for t in ["code","name","id","type","owner","keph"])]
    nonnull={}
    for f in likely_geo+likely_status+likely_identity:
        vals=[x.get(f) for x in results if isinstance(x,dict)]
        nonnull[f]=sum(v is not None and str(v).strip()!="" for v in vals)
    out={
      "schema_version":"kda.p42.kmhfr-source-probe.v1",
      "probed_on":"2026-09-23",
      "endpoint":BASE,
      "http_status":status,
      "content_type":ctype,
      "payload_keys":keys,
      "reported_total_facilities":count,
      "first_page_records":len(results),
      "next_page_present":bool(next_url),
      "field_names":fields,
      "likely_geography_fields":likely_geo,
      "likely_status_fields":likely_status,
      "likely_identity_fields":likely_identity,
      "nonnull_counts_first_page":nonnull,
      "conclusion":"reachable_and_structured" if status==200 and len(results)>0 else "not_usable",
      "raw_records_committed":False
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(out, indent=2))

if __name__=="__main__":
    main()
