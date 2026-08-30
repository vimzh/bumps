#!/bin/bash
# Publishes every completed study venue (tactile done + valid) to the web
# gallery: exports the STL (deterministic — works even with zero AI quota)
# copies the plan image, and saves the parsed SVG. Prints the assets to add
# to data/gallery.ts.
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
  curl -s -o "$GAL/study-$slug-design.svg" "$API/projects/$id/model/svg"
  # web-sized jpeg (source scans can be 7MB+)
  sips --resampleWidth 1600 -s format jpeg -s formatOptions 80 "outputs/$slug-input.png" --out "$GAL/study-$slug-plan.jpg" >/dev/null 2>&1
  size=$(stat -f%z "$GAL/study-$slug.stl" 2>/dev/null || echo 0)
  echo "PUBLISHED $slug (stl ${size}B) -> source + design SVG + STL"
done
