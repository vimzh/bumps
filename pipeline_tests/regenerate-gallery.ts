// Regenerates every public gallery artifact through a fresh API project.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const API = process.env.API_URL ?? 'http://localhost:3003'
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? '/tmp/bumps-gallery-regeneration'

const cases = [
  ['fountain-hills-community-center', 'fountain-hills-source.png', 'fountain-hills-design.svg', 'fountain-hills-map.stl'],
  ['burke-museum', 'burke-museum-source.png', 'burke-museum-design.svg', 'burke-museum-map.stl'],
  ['buffalo-downtown-central-library', 'buffalo-library-source.png', 'buffalo-library-design.svg', 'buffalo-library-map.stl'],
  ['yonkers-riverfront-library', 'yonkers-library-source.png', 'yonkers-library-design.svg', 'yonkers-library-map.stl'],
  ['caa-ed-mirvish-theatre', 'ed-mirvish-source.png', 'ed-mirvish-design.svg', 'ed-mirvish-map.stl'],
  ['test-library-fourth-story', 'test-library-fourth-story-source.jpg', 'test-library-fourth-story-design.svg', 'test-library-fourth-story.stl'],
  ['test-library-floor-plan', 'test-library-floor-plan-source.png', 'test-library-floor-plan-design.svg', 'test-library-floor-plan.stl'],
  ['test-public-restrooms', 'test-public-restrooms-source.png', 'test-public-restrooms-design.svg', 'test-public-restrooms.stl'],
  ['test-courtyard-museum', 'test-courtyard-museum-source.jpg', 'test-courtyard-museum-design.svg', 'test-courtyard-museum.stl'],
  ['test-museum-floor-plan', 'test-museum-floor-plan-source.png', 'test-museum-floor-plan-design.svg', 'test-museum-floor-plan.stl'],
  ['office-plan', 'office-plan.png', 'office-design.svg', 'office-map.stl'],
] as const

type Json = Record<string, any>

async function requestJson(url: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(url, init)
  const text = await response.text()
  let body: Json
  try {
    body = text ? JSON.parse(text) as Json : {}
  } catch {
    throw new Error(`${response.status} ${text.slice(0, 200)}`)
  }
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`)
  return body
}

async function poll(
  url: string,
  timeoutMinutes: number,
  describe: (body: Json) => string,
): Promise<Json> {
  const deadline = Date.now() + timeoutMinutes * 60_000
  let previous = ''
  while (Date.now() < deadline) {
    const body = await requestJson(url)
    const summary = describe(body)
    if (summary !== previous) {
      console.log(`  ${summary}`)
      previous = summary
    }
    if (body.status === 'parsed' || body.status === 'done') return body
    if (body.status === 'failed') {
      throw new Error(String(body.parseError ?? body.error ?? 'pipeline failed'))
    }
    await Bun.sleep(8_000)
  }
  throw new Error(`Timed out after ${timeoutMinutes} minutes`)
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Artifact download failed: ${response.status} ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

await mkdir(OUTPUT_DIR, { recursive: true })
const galleryDir = path.resolve('apps/web/public/gallery')
const selected = process.env.ONLY
  ? cases.filter(([slug]) => slug === process.env.ONLY)
  : cases
if (selected.length === 0) throw new Error(`Unknown gallery slug: ${process.env.ONLY}`)
if (process.env.PROJECT_ID && selected.length !== 1) {
  throw new Error('PROJECT_ID requires exactly one ONLY gallery slug')
}

const report: Json[] = []
for (const [slug, sourceName, svgName, stlName] of selected) {
  console.log(`\nSTART ${slug}`)
  try {
    let projectId = process.env.PROJECT_ID
    if (projectId) {
      const project = await requestJson(`${API}/projects/${projectId}`)
      if (project.status !== 'parsed') throw new Error(`Existing project is ${project.status}`)
    } else {
      const sourcePath = path.join(galleryDir, sourceName)
      const source = Bun.file(sourcePath)
      const form = new FormData()
      form.set('file', new File([await source.bytes()], sourceName, { type: source.type }))
      const created = await requestJson(`${API}/projects`, { body: form, method: 'POST' })
      projectId = String(created.id)

      await requestJson(`${API}/projects/${projectId}/parse`, { method: 'POST' })
      await poll(
        `${API}/projects/${projectId}`,
        35,
        (body) => {
          const progress = body.parseProgress
          return progress
            ? `${body.status}: ${progress.stage} ${progress.iteration}/${progress.maxIterations}`
            : String(body.status)
        },
      )
    }

    const modelResult = await requestJson(`${API}/projects/${projectId}/model`)
    const model = modelResult.model
    await requestJson(`${API}/projects/${projectId}/tactile`, { method: 'POST' })
    const tactile = await poll(
      `${API}/projects/${projectId}/tactile`,
      20,
      (body) => `${body.status}${body.iterations ? `: ${body.iterations.length} layout passes` : ''}`,
    )
    if (tactile.valid !== true) {
      throw new Error(`Tactile output is invalid: ${JSON.stringify(tactile.violations)}`)
    }

    const exported = await requestJson(`${API}/projects/${projectId}/export`, { method: 'POST' })
    const [svg, stl] = await Promise.all([
      download(`${API}/projects/${projectId}/model/svg`),
      download(`${API}/projects/${projectId}/export/map.stl`),
    ])
    await Promise.all([
      Bun.write(path.join(OUTPUT_DIR, svgName), svg),
      Bun.write(path.join(OUTPUT_DIR, stlName), stl),
    ])

    const result = {
      slug,
      projectId,
      rooms: model.rooms.length,
      walls: model.walls.length,
      openings: model.openings.length,
      features: (model.features ?? []).length,
      furniture: (model.furniture ?? []).length,
      grid: exported.grid,
      layoutPasses: tactile.iterations?.length ?? 0,
      triangles: exported.files.find((file: Json) => file.kind === 'map')?.triangles ?? null,
      svgName,
      stlName,
    }
    report.push(result)
    await Bun.write(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`DONE ${slug}: ${result.rooms} rooms, ${result.walls} walls, ${result.openings} openings, ${result.grid.cols}x${result.grid.rows}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    report.push({ slug, error: message })
    await Bun.write(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    console.error(`FAILED ${slug}: ${message}`)
  }
}

const failures = report.filter((item) => item.error)
if (failures.length > 0) {
  throw new Error(`${failures.length} gallery regeneration${failures.length === 1 ? '' : 's'} failed`)
}
console.log(`\nSTAGED ${report.length} gallery examples in ${OUTPUT_DIR}`)
