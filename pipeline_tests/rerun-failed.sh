#!/bin/bash
# Validation study batch runner: upload -> parse -> tactile -> render, per asset.
# Sequential on purpose (free-tier RPM). Appends one line per stage to results.txt.
set -u
cd "$(dirname "$0")"
API=http://localhost:3003
OUT=outputs
mkdir -p "$OUT"
# append mode for reruns

log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$OUT/results.txt"; }

run_one() {
  local slug="$1" file="$2"
  log "=== $slug: upload $file"
  local id
  id=$(curl -s -X POST -F "file=@assets/$file" "$API/projects" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  if [ -z "$id" ]; then log "$slug UPLOAD FAILED"; return; fi
  echo "$id" > "$OUT/$slug.project"
  curl -s -X POST "$API/projects/$id/parse" > /dev/null
  local i status
  for i in $(seq 1 60); do
    sleep 10
    status=$(curl -s "$API/projects/$id" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    [ "$status" = "parsed" ] && break
    [ "$status" = "failed" ] && break
  done
  if [ "$status" != "parsed" ]; then
    local err
    err=$(curl -s "$API/projects/$id" | python3 -c "import json,sys; print((json.load(sys.stdin).get('parseError') or '')[:120])")
    log "$slug PARSE $status: $err"
    return
  fi
  local summary
  summary=$(curl -s "$API/projects/$id/model" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=d['model']
print(f\"v{d['version']} it={d.get('iteration')} rooms={len(m['rooms'])} walls={len(m['walls'])} doors={sum(1 for o in m['openings'] if o['kind']=='door')} furn={len(m['furniture'])} feats={[f['kind'] for f in m['features']]} labels={[r['label'] for r in m['rooms'] if r['label']]}\"[:400])")
  log "$slug PARSED $summary"
  curl -s "$API/projects/$id/plan" -o "$OUT/$slug-input.png"
  # tactile
  curl -s -X POST "$API/projects/$id/tactile" > /dev/null
  for i in $(seq 1 40); do
    sleep 8
    status=$(curl -s "$API/projects/$id/tactile" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    [ "$status" = "done" ] && break
    [ "$status" = "failed" ] && break
  done
  local tres
  tres=$(curl -s "$API/projects/$id/tactile" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('status')!='done':
  print('TACTILE', d.get('status'), (d.get('error') or '')[:100]); raise SystemExit
k={}
for e in d['design']['elements']: k[e['kind']]=k.get(e['kind'],0)+1
print(f\"TACTILE done valid={d['valid']} passes={[it['violations'] for it in d['iterations']]} elements={k} legend={[e['key']+'='+e['text'] for e in d['design']['legend']][:10]}\"[:400])")
  log "$slug $tres"
  (cd ../apps/api && bun scripts/render-design.ts "$id" "../../pipeline_tests/$OUT/$slug-ours.png" >> "../../pipeline_tests/$OUT/results.txt" 2>&1)
}


run_one queenmary     queenmary-plan.jpg
run_one met-historic  met-plan-historic.jpg





log "RERUN COMPLETE"
