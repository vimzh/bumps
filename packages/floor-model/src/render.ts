import type { FloorModel, Point, Room } from './schema'

// Pure floor model -> SVG string. Used by the edit canvas (interactive layer
// goes on top) and by the critique loop (render-and-compare against the plan).

const COLORS = {
  wall: '#1c1917',
  roomFill: '#f5f5f4',
  roomStroke: '#d6d3d1',
  door: '#0d9488',
  window: '#0ea5e9',
  feature: '#7c3aed',
  label: '#44403c',
}

const FEATURE_GLYPH: Record<string, string> = {
  elevator: 'E',
  entrance: '→',
  exit: 'X',
  'info-point': 'i',
  ramp: 'R',
  reception: 'RC',
  restroom: 'WC',
  seating: 'ST',
  stairs: 'S',
  'you-are-here': '●',
}

function centroid(polygon: Point[]): Point {
  const total = polygon.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  )
  return { x: total.x / polygon.length, y: total.y / polygon.length }
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function polygonPoints(polygon: Point[]): string {
  return polygon.map((point) => `${point.x},${point.y}`).join(' ')
}

function renderRoom(room: Room): string {
  const parts = [
    `<polygon data-id="${room.id}" points="${polygonPoints(room.polygon)}" fill="${COLORS.roomFill}" stroke="${COLORS.roomStroke}" stroke-width="1"/>`,
  ]
  if (room.label) {
    const center = centroid(room.polygon)
    parts.push(
      `<text x="${center.x}" y="${center.y}" font-family="monospace" font-size="20" fill="${COLORS.label}" text-anchor="middle" dominant-baseline="middle">${escapeXml(room.label)}</text>`,
    )
  }
  return parts.join('\n')
}

export function renderFloorModelSvg(model: FloorModel): string {
  const { widthPx, heightPx } = model.plan
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}">`,
    `<rect width="${widthPx}" height="${heightPx}" fill="white"/>`,
  ]

  for (const road of model.roads ?? []) {
    parts.push(
      `<polyline data-id="${road.id}" points="${polygonPoints(road.points)}" fill="none" stroke="#78716c" stroke-width="${road.widthPx}" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`,
    )
    if (road.label) {
      const mid = road.points[Math.floor(road.points.length / 2)]!
      parts.push(
        `<text x="${mid.x}" y="${mid.y - road.widthPx}" font-family="monospace" font-size="16" fill="#57534e" text-anchor="middle">${escapeXml(road.label)}</text>`,
      )
    }
  }
  for (const room of model.rooms) {
    parts.push(renderRoom(room))
  }
  for (const path of model.paths ?? []) {
    parts.push(
      `<polyline data-id="${path.id}" points="${polygonPoints(path.points)}" fill="none" stroke="#b45309" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round"/>`,
    )
  }
  for (const item of model.furniture) {
    const center = centroid(item.polygon)
    parts.push(
      `<polygon data-id="${item.id}" points="${polygonPoints(item.polygon)}" fill="#d6d3d1" stroke="#a8a29e" stroke-width="2"/>`,
      `<text x="${center.x}" y="${center.y}" font-family="monospace" font-size="16" fill="${COLORS.label}" text-anchor="middle" dominant-baseline="middle">${escapeXml(item.label)}</text>`,
    )
  }
  for (const wall of model.walls) {
    parts.push(
      `<line data-id="${wall.id}" x1="${wall.a.x}" y1="${wall.a.y}" x2="${wall.b.x}" y2="${wall.b.y}" stroke="${COLORS.wall}" stroke-width="${wall.thickness}" stroke-linecap="square"/>`,
    )
  }
  for (const opening of model.openings) {
    const color = opening.kind === 'door' ? COLORS.door : COLORS.window
    const half = opening.width / 2
    parts.push(
      `<circle data-id="${opening.id}" cx="${opening.at.x}" cy="${opening.at.y}" r="${half}" fill="none" stroke="${color}" stroke-width="3"/>`,
    )
  }
  for (const feature of model.features) {
    const glyph = FEATURE_GLYPH[feature.kind] ?? '?'
    parts.push(
      `<g data-id="${feature.id}" transform="translate(${feature.at.x} ${feature.at.y}) rotate(${feature.rotation})">`,
      `<rect x="-16" y="-16" width="32" height="32" fill="white" stroke="${COLORS.feature}" stroke-width="3"/>`,
      `<text font-family="monospace" font-size="18" fill="${COLORS.feature}" text-anchor="middle" dominant-baseline="middle">${escapeXml(glyph)}</text>`,
      `</g>`,
    )
  }

  parts.push('</svg>')
  return parts.join('\n')
}

export function renderFloorTopologyOverlaySvg(
  model: FloorModel,
  sourceDataUri: string,
): string {
  const { widthPx, heightPx } = model.plan
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}">`,
    `<image href="${escapeXml(sourceDataUri)}" x="0" y="0" width="${widthPx}" height="${heightPx}" preserveAspectRatio="none"/>`,
  ]

  for (const wall of model.walls) {
    const width = Math.max(wall.thickness, 4)
    const radius = Math.max(width / 3, 2)
    parts.push(
      `<line data-id="${wall.id}" x1="${wall.a.x}" y1="${wall.a.y}" x2="${wall.b.x}" y2="${wall.b.y}" stroke="#dc2626" stroke-width="${width}" stroke-linecap="round" opacity="0.8"/>`,
      `<circle cx="${wall.a.x}" cy="${wall.a.y}" r="${radius}" fill="#dc2626"/>`,
      `<circle cx="${wall.b.x}" cy="${wall.b.y}" r="${radius}" fill="#dc2626"/>`,
    )
  }
  for (const opening of model.openings) {
    parts.push(
      `<circle data-id="${opening.id}" cx="${opening.at.x}" cy="${opening.at.y}" r="${Math.max(opening.width / 2, 5)}" fill="none" stroke="${opening.kind === 'door' ? '#0891b2' : '#2563eb'}" stroke-width="4"/>`,
    )
  }

  parts.push('</svg>')
  return parts.join('\n')
}
