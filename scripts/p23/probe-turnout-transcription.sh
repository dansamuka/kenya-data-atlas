#!/usr/bin/env bash
set -euo pipefail

item_id='9c12cc5d3d244a8bad34bce09a28540b'
item_url="https://www.arcgis.com/sharing/rest/content/items/${item_id}?f=json"
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 KenyaDataAtlas/1.0'

curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 45 \
  -A "$ua" "$item_url" -o /tmp/p23-turnout-item.json

service_url="$(python - <<'PY'
import json
p=json.load(open('/tmp/p23-turnout-item.json'))
print(p.get('url',''))
PY
)"
if test -z "$service_url"; then
  echo 'TURNOUT_TRANSCRIPTION_NO_SERVICE_URL=1' >&2
  cat /tmp/p23-turnout-item.json >&2
  exit 1
fi

echo "TRANSCRIPTION_ITEM_ID=$item_id"
python - <<'PY'
import json,datetime
p=json.load(open('/tmp/p23-turnout-item.json'))
print('TRANSCRIPTION_TITLE='+str(p.get('title')))
print('TRANSCRIPTION_TYPE='+str(p.get('type')))
print('TRANSCRIPTION_OWNER='+str(p.get('owner')))
print('TRANSCRIPTION_MODIFIED='+str(p.get('modified')))
print('TRANSCRIPTION_SERVICE='+str(p.get('url')))
PY

curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 45 \
  -A "$ua" "${service_url}?f=json" -o /tmp/p23-turnout-service.json

layer_id="$(python - <<'PY'
import json
p=json.load(open('/tmp/p23-turnout-service.json'))
layers=p.get('layers') or []
if layers:
    print(layers[0].get('id',0))
else:
    print('0')
PY
)"
layer_url="${service_url%/}/${layer_id}"

curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 45 \
  -A "$ua" "${layer_url}?f=json" -o /tmp/p23-turnout-layer.json

query_url="${layer_url}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=2000&f=json"
curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 60 \
  -A "$ua" "$query_url" -o /tmp/p23-turnout-transcription.json

python - <<'PY'
import json
item=json.load(open('/tmp/p23-turnout-item.json'))
layer=json.load(open('/tmp/p23-turnout-layer.json'))
data=json.load(open('/tmp/p23-turnout-transcription.json'))
if data.get('error'):
    raise SystemExit(f"ArcGIS query error: {data['error']}")
features=data.get('features') or []
fields=[f.get('name') for f in layer.get('fields') or []]
print('TRANSCRIPTION_LAYER='+str(layer.get('name')))
print('TRANSCRIPTION_FIELDS='+','.join(str(x) for x in fields))
print('TRANSCRIPTION_FEATURES='+str(len(features)))
for i,f in enumerate(features[:5]):
    print('TRANSCRIPTION_SAMPLE_'+str(i+1)+'='+json.dumps(f.get('attributes') or {},sort_keys=True))
print('TRANSCRIPTION_LAST='+json.dumps((features[-1].get('attributes') if features else {}),sort_keys=True))
# Retain a compact provenance envelope around the raw query response.
out={
  'item_id': item.get('id'),
  'item_title': item.get('title'),
  'item_owner': item.get('owner'),
  'item_modified': item.get('modified'),
  'item_type': item.get('type'),
  'service_url': item.get('url'),
  'layer_id': layer.get('id',0),
  'layer_name': layer.get('name'),
  'fields': fields,
  'features': features,
}
json.dump(out,open('/tmp/p23-turnout-transcription-envelope.json','w'),indent=2)
open('/tmp/p23-turnout-transcription-envelope.json','a').write('\n')
PY

sha256sum /tmp/p23-turnout-transcription-envelope.json
