#!/bin/bash
# Publishes every completed study venue (tactile done + valid) to the web
# gallery: exports the STL (deterministic — works even with zero AI quota)
# and copies the plan image. Prints the entries to add to data/gallery.ts.
set -u
cd "$(dirname "$0")"
API=http://localhost:3003
GAL=../apps/web/public/gallery
mkdir -p "$GAL"

for pf in outputs/*.project; do
  slug=$(basename "$pf" .project)
  id=$(cat "$pf")
  state=$(curl -s "$API/projects/$id/tactile" | python3 -c "import json,sys; d=json.load(sys.stdin); print(('done' if d.get('status')=='done' else d.get('status') or 'none') + ':' + ('valid' if d.get('valid') else 'invalid'))" 2>/dev/null)
  if [ "$state" != "done:valid" ]; then
    echo "SKIP $slug ($state)"
    continue
  fi
  curl -s -X POST "$API/projects/$id/export" > /dev/null
  curl -s -o "$GAL/study-$slug.stl" "$API/projects/$id/export/map.stl"
  # web-sized jpeg (source scans can be 7MB+)
  sips --resampleWidth 1600 -s format jpeg -s formatOptions 80 "outputs/$slug-input.png" --out "$GAL/study-$slug-plan.jpg" >/dev/null 2>&1
  size=$(stat -f%z "$GAL/study-$slug.stl" 2>/dev/null || echo 0)
  echo "PUBLISHED $slug (stl ${size}B) -> /gallery/study-$slug.stl + /gallery/study-$slug-plan.jpg"
done
