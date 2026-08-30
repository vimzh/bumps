// Compares our rendered design against the venue's real tactile map:
// bun scripts/compare-maps.ts <sourcePng> <oursPng> <realImage> <venueName> [outJson]
import path from 'node:path'
import { imageSize } from 'image-size'
import { compareToRealMap } from '../src/agents/compare'
import { downscalePlanImage } from '../src/lib/rasterize'

const [sourcePath, oursPath, realPath, venueName, outPath] = process.argv.slice(2)
if (!sourcePath || !oursPath || !realPath || !venueName) {
  console.error(
    'usage: bun scripts/compare-maps.ts <sourcePng> <oursPng> <realImage> <venueName> [outJson]',
  )
  process.exit(1)
}

const MIME: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
const originalRealMime = MIME[path.extname(realPath).toLowerCase()]
if (!originalRealMime) {
  console.error(`unsupported real-map image type: ${realPath}`)
  process.exit(1)
}

async function visionImage(imagePath: string) {
  const bytes = await Bun.file(imagePath).bytes()
  const detected = imageSize(bytes).type
  const detectedMime = detected ? MIME[`.${detected}`] : undefined
  if (!detectedMime) throw new Error(`unsupported image data: ${imagePath}`)
  const capped = downscalePlanImage(bytes, detectedMime)
  return {
    base64: Buffer.from(capped ?? bytes).toString('base64'),
    mimeType: capped ? 'image/png' : detectedMime,
  }
}

const source = await visionImage(sourcePath)
const ours = await visionImage(oursPath)
const real = await visionImage(realPath)

const result = await compareToRealMap({
  sourcePngBase64: source.base64,
  sourceMime: source.mimeType,
  oursPngBase64: ours.base64,
  oursMime: ours.mimeType,
  realBase64: real.base64,
  realMime: real.mimeType,
  venueName,
})
const line = `${venueName}: overall=${result.overall} confidence=${result.confidence} plan=${result.scores.planFidelity} real=${result.scores.realMapStructure} selection=${result.scores.informationSelection} symbols=${result.scores.symbols} labels=${result.scores.labels} fabric=${result.scores.fabric} readability=${result.scores.readability}`
console.log(line)
console.log('gaps:', result.gaps.join(' | '))
if (outPath) await Bun.write(outPath, JSON.stringify(result, null, 2))
