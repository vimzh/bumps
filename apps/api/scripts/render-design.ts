// Renders a project's latest tactile design to a PNG for the validation
// study: bun scripts/render-design.ts <projectId> <outPath>
// Mirrors the web TactileViewer's drawing (same braille module), so the
// comparison images match what users see.
import { Resvg } from '@resvg/resvg-js'
import {
  BRAILLE_MM,
  compositeSize,
  textDotCenters,
  type TactileDesign,
  type TactileSymbol,
} from '@bumps/floor-model'

const [projectId, outPath] = process.argv.slice(2)
if (!projectId || !outPath) {
  console.error('usage: bun scripts/render-design.ts <projectId> <outPath>')
  process.exit(1)
}

const API = process.env.API_URL ?? 'http://localhost:3003'
const res = await fetch(`${API}/projects/${projectId}/tactile`)
if (!res.ok) {
  console.error('no tactile design:', res.status)
  process.exit(1)
}
const { design, status, valid } = (await res.json()) as {
  design: TactileDesign
  status: string
  valid: boolean
}
if (status !== 'done') {
  console.error('design not done:', status)
  process.exit(1)
}

function symbolSvg(s: TactileSymbol): string {
  const z = s.sizeMm
  const h = z / 2
  const k: Record<string, string> = {
    stairs: `<g fill="#333"><rect x="${-h}" y="-2.4" width="${z}" height="1.2"/><rect x="${-h}" y="-0.6" width="${z}" height="1.2"/><rect x="${-h}" y="1.2" width="${z}" height="1.2"/></g>`,
    elevator: `<rect x="${-h}" y="${-h}" width="${z}" height="${z}" fill="none" stroke="#333" stroke-width="0.8"/><circle r="0.9" fill="#333"/>`,
    entrance: `<path d="M 0 ${-h} L ${h} ${h} L ${-h} ${h} Z" fill="#333"/>`,
    exit: `<rect x="${-h}" y="${-h}" width="${z}" height="${z}" fill="none" stroke="#333" stroke-width="0.9"/><line x1="${-h}" y1="${-h}" x2="${h}" y2="${h}" stroke="#333" stroke-width="0.9"/>`,
    restroom: `<circle r="${h}" fill="none" stroke="#333" stroke-width="0.9"/><circle r="1.2" fill="#333"/>`,
    ramp: `<path d="M ${-h} ${h} L ${h} ${h} L ${h} ${-h} Z" fill="#333"/>`,
    'you-are-here': `<circle r="${h}" fill="none" stroke="#b5502a" stroke-width="1"/><circle r="1.4" fill="#b5502a"/>`,
    reception: `<rect x="${-h}" y="0.6" width="${z}" height="1.4" fill="#333"/><circle cy="-1.2" r="1.1" fill="#333"/>`,
    seating: `<rect x="${-h}" y="1" width="${z}" height="1.2" fill="#333"/><rect x="${-h}" y="-2.4" width="1.2" height="3.4" fill="#333"/>`,
    'info-point': `<circle r="${h}" fill="none" stroke="#333" stroke-width="0.8"/><circle cy="-1.4" r="0.7" fill="#333"/><rect x="-0.55" y="-0.4" width="1.1" height="2.6" fill="#333"/>`,
    door: `<rect x="${-h}" y="-1" width="${z}" height="2" fill="#b5502a"/>`,
    north: `<path d="M 0 ${-h} L ${-h * 0.55} ${-h + 3} L ${h * 0.55} ${-h + 3} Z" fill="#333"/><rect x="-0.6" y="${-h + 3}" width="1.2" height="${z - 3}" fill="#333"/>`,
  }
  return `<g transform="translate(${s.at.x} ${s.at.y}) rotate(${s.rotation})">${k[s.symbol] ?? ''}</g>`
}

const { marginMm } = design.plate
const grid = design.grid ?? { cols: 1, rows: 1 }
const { heightMm, widthMm } = compositeSize(design)
const parts: string[] = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}">`,
  `<rect width="${widthMm}" height="${heightMm}" fill="#fbfaf7" stroke="#ccc" stroke-width="0.5"/>`,
  `<rect x="${marginMm}" y="${marginMm}" width="${widthMm - 2 * marginMm}" height="${heightMm - 2 * marginMm}" fill="none" stroke="#ddd" stroke-width="0.3" stroke-dasharray="2 2"/>`,
]
if (grid.cols > 1) {
  parts.push(
    `<line x1="${design.plate.widthMm}" y1="0" x2="${design.plate.widthMm}" y2="${heightMm}" stroke="#b5502a88" stroke-width="0.4" stroke-dasharray="4 3"/>`,
  )
}
if (grid.rows > 1) {
  parts.push(
    `<line x1="0" y1="${design.plate.heightMm}" x2="${widthMm}" y2="${design.plate.heightMm}" stroke="#b5502a88" stroke-width="0.4" stroke-dasharray="4 3"/>`,
  )
}
for (const e of design.elements) {
  if (e.kind === 'area') {
    parts.push(
      `<polygon points="${e.polygon.map((p) => `${p.x},${p.y}`).join(' ')}" fill="#c9b98f88"/>`,
    )
  }
}
for (const e of design.elements) {
  if (e.kind === 'line') {
    const dash = e.style === 'dashed' ? ' stroke-dasharray="3 2"' : ''
    parts.push(
      `<polyline points="${e.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#222" stroke-width="${e.widthMm}" stroke-linecap="${e.style === 'dashed' ? 'butt' : 'square'}"${dash}/>`,
    )
  }
}
for (const e of design.elements) {
  if (e.kind === 'symbol') parts.push(symbolSvg(e))
  if (e.kind === 'braille') {
    for (const dot of textDotCenters(e.key, e.at)) {
      parts.push(
        `<circle cx="${dot.x}" cy="${dot.y}" r="${BRAILLE_MM.dotDiameter / 2}" fill="#1d4ed8"/>`,
      )
    }
  }
}
parts.push('</svg>')

const png = new Resvg(parts.join('\n'), { fitTo: { mode: 'width', value: 1200 } })
  .render()
  .asPng()
await Bun.write(outPath, png)
console.log(
  `rendered ${outPath} | valid=${valid} | grid=${grid.cols}x${grid.rows} | legend=${design.legend.map((l) => `${l.key}=${l.text}`).join(',')}`,
)
