// Runs the five selected public floor plans through parse, tactile layout, and STL export serially.
const API = process.env.API_URL ?? 'http://localhost:3003'

const cases = [
  ['board-fountain-hills', 'Fountain Hills Community Center'],
  ['board-burke-museum', 'Burke Museum'],
  ['board-buffalo-library', 'Buffalo Downtown Central Library'],
  ['board-yonkers-library', 'Yonkers Riverfront Library'],
  ['board-ed-mirvish', 'CAA Ed Mirvish Theatre'],
] as const

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error(`${response.status} ${body.slice(0, 200)}`)
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(parsed)}`)
  }
  return parsed as Record<string, any>
}

async function poll(
  url: string,
  terminal: readonly string[],
  describe: (value: Record<string, any>) => string,
  timeoutMinutes: number,
) {
  const deadline = Date.now() + timeoutMinutes * 60_000
  let last = ''
  while (Date.now() < deadline) {
    const value = await requestJson(url)
    const summary = describe(value)
    if (summary !== last) {
      console.log(`  ${summary}`)
      last = summary
    }
    if (terminal.includes(value.status)) return value
    await Bun.sleep(8_000)
  }
  throw new Error(`Timed out after ${timeoutMinutes} minutes`)
}

for (const [slug, title] of cases) {
  const directory = `pipeline_tests/corpus-cache/${slug}`
  const projectId = (await Bun.file(`${directory}/project-id.txt`).text()).trim()
  console.log(`\nSTART ${title} | ${projectId}`)
  try {
    const project = await requestJson(`${API}/projects/${projectId}`)
    if (project.status === 'uploaded' || project.status === 'failed') {
      await requestJson(`${API}/projects/${projectId}/parse`, { method: 'POST' })
    }
    const parsedProject = await poll(
      `${API}/projects/${projectId}`,
      ['parsed', 'failed'],
      (value) => {
        const progress = value.parseProgress
        return progress
          ? `${value.status}: ${progress.stage} ${progress.iteration}/${progress.maxIterations}; history=${progress.history.map((item: any) => `${item.majorCount} major`).join(' -> ') || 'none'}`
          : `${value.status}${value.parseError ? `: ${value.parseError}` : ''}`
      },
      20,
    )
    if (parsedProject.status !== 'parsed') {
      throw new Error(parsedProject.parseError ?? 'Parse failed')
    }

    const model = await requestJson(`${API}/projects/${projectId}/model`)
    await Bun.write(`${directory}/model.json`, JSON.stringify(model, null, 2))
    const floor = model.model
    console.log(
      `  model: ${floor.rooms.length} rooms, ${floor.walls.length} walls, ${floor.openings.length} openings, ${(floor.features ?? []).length} features`,
    )

    await requestJson(`${API}/projects/${projectId}/tactile`, { method: 'POST' })
    const tactile = await poll(
      `${API}/projects/${projectId}/tactile`,
      ['done', 'failed'],
      (value) =>
        `${value.status}${value.iterations ? `: ${value.iterations.length} layout iterations` : ''}${value.error ? `: ${value.error}` : ''}`,
      15,
    )
    await Bun.write(`${directory}/tactile.json`, JSON.stringify(tactile, null, 2))
    if (tactile.status !== 'done' || tactile.valid !== true) {
      throw new Error(
        tactile.error ?? `Tactile layout invalid: ${JSON.stringify(tactile.violations)}`,
      )
    }

    const exported = await requestJson(`${API}/projects/${projectId}/export`, {
      method: 'POST',
    })
    await Bun.write(`${directory}/export.json`, JSON.stringify(exported, null, 2))

    const [svgResponse, stlResponse] = await Promise.all([
      fetch(`${API}/projects/${projectId}/model/svg`),
      fetch(`${API}/projects/${projectId}/export/map.stl`),
    ])
    if (!svgResponse.ok || !stlResponse.ok) {
      throw new Error(`Artifact download failed: SVG ${svgResponse.status}, STL ${stlResponse.status}`)
    }
    await Promise.all([
      Bun.write(`${directory}/design.svg`, await svgResponse.text()),
      Bun.write(`${directory}/board.stl`, await stlResponse.bytes()),
    ])

    const render = Bun.spawn(
      ['bun', 'apps/api/scripts/render-design.ts', projectId, `${directory}/board.png`],
      { stderr: 'inherit', stdout: 'inherit' },
    )
    if ((await render.exited) !== 0) throw new Error('Board preview render failed')

    const grid = exported.grid
    const mapFile = exported.files.find((file: any) => file.kind === 'map')
    console.log(
      `DONE ${title} | grid=${grid.cols}x${grid.rows} | map triangles=${mapFile?.triangles ?? 'unknown'}`,
    )
  } catch (error) {
    console.error(`FAILED ${title} | ${error instanceof Error ? error.message : error}`)
  }
}
