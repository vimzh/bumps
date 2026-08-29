#!/bin/bash
# Fabric-upgrade rerun: re-parse QC+PSU (paths/north/footprints), tactile-only for the rest.
set -u
cd "$(dirname "$0")"
API=http://localhost:3003
OUT=outputs
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$OUT/results.txt"; }

reparse() {
  local slug="$1"; local id; id=$(cat "$OUT/$slug.project")
  log "=== fabric reparse $slug"
  curl -s -X POST "$API/projects/$id/parse" > /dev/null
  local i status=""
  for i in $(seq 1 90); do
    sleep 8
    status=$(curl -s "$API/projects/$id" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    [ "$status" = "parsed" ] && break; [ "$status" = "failed" ] && break
  done
  if [ "$status" != "parsed" ]; then
    log "$slug REPARSE $status: $(curl -s "$API/projects/$id" | python3 -c "import json,sys; print((json.load(sys.stdin).get('parseError') or '')[:120])")"
    return 1
  fi
  log "$slug REPARSED $(curl -s "$API/projects/$id/model" | python3 -c "
import json,sys
d=json.load(sys.stdin); m=d['model']
print(f\"v{d['version']} rooms={len(m['rooms'])} paths={len(m.get('paths') or [])} north={m['plan'].get('north')} walls={len(m['walls'])}\")")"
}

tactile() {
  local slug="$1"; local id; id=$(cat "$OUT/$slug.project")
  curl -s -X POST "$API/projects/$id/tactile" > /dev/null
  local i status=""
  for i in $(seq 1 60); do
    sleep 6
    status=$(curl -s "$API/projects/$id/tactile" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    [ "$status" = "done" ] && break; [ "$status" = "failed" ] && break
  done
  log "$slug $(curl -s "$API/projects/$id/tactile" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('status')!='done':
  print('TACTILE', d.get('status'), (d.get('error') or '')[:100])
else:
  des=d['design']; k={}
  for e in des['elements']: k[e['kind']]=k.get(e['kind'],0)+1
  dashed=sum(1 for e in des['elements'] if e['kind']=='line' and e.get('style')=='dashed')
  title=any(e['id']=='t-title' for e in des['elements'])
  north=any(e['id']=='t-north' for e in des['elements'])
  print(f\"TACTILE valid={d['valid']} grid={des.get('grid')} passes={[it['violations'] for it in d['iterations']]} paths={dashed} title={title} north={north}\")")"
  (cd ../apps/api && bun scripts/render-design.ts "$id" "../../pipeline_tests/$OUT/$slug-ours.png" >> "../../pipeline_tests/$OUT/results.txt" 2>&1)
}

reparse queenscollege && tactile queenscollege
reparse psu && tactile psu
for s in cch-2f getty met-historic queenmary; do tactile "$s"; done
log "FABRIC RERUN COMPLETE"
