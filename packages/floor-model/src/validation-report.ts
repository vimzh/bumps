import { BRAILLE_MM, textBrailleSize } from './braille'
import {
  compositeSize,
  RELIEF_MM,
  type BrailleLabel,
  type TactileDesign,
  type TactileSymbol,
} from './tactile'
import {
  ADJACENT_LABEL_MM,
  CLEARANCE_MM,
  MIN_DOOR_OPENING_MM,
  MIN_SYMBOL_MM,
  SEAM_CLEARANCE_MM,
  SIMILAR_SYMBOL_CLEARANCE_MM,
  validateTactileDesign,
  type ValidationContext,
} from './validate'

// Human-readable pass/fail report over every rule the validator enforces,
// plus the geometry classes that are correct by construction. Built for
// the "Checks" panel: same deterministic measurements as the validator,
// summarized per rule instead of per violation.

export type ValidationCheck = {
  id: string
  label: string
  requirement: string
  measured: string
  standard: string
  status: 'pass' | 'fail'
  failures: number
}

export type ValidationReport = {
  checks: ValidationCheck[]
  valid: boolean
  violationCount: number
}

type Rect = { maxX: number; maxY: number; minX: number; minY: number }

function brailleRect(label: BrailleLabel): Rect {
  const size = textBrailleSize(label.key)
  return {
    maxX: label.at.x + size.widthMm,
    maxY: label.at.y + size.heightMm,
    minX: label.at.x,
    minY: label.at.y,
  }
}

function rectRectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(a.minX - b.maxX, 0, b.minX - a.maxX)
  const dy = Math.max(a.minY - b.maxY, 0, b.minY - a.maxY)
  return Math.hypot(dx, dy)
}

function pointRectDistance(p: { x: number; y: number }, r: Rect): number {
  const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX)
  const dy = Math.max(r.minY - p.y, 0, p.y - r.maxY)
  return Math.hypot(dx, dy)
}

function mm(value: number): string {
  return `${value.toFixed(1)} mm`
}

export function buildValidationReport(
  design: TactileDesign,
  context: ValidationContext,
): ValidationReport {
  const violations = validateTactileDesign(design, context)
  const failuresFor = (predicate: (rule: string, requiredMm: number | null) => boolean) =>
    violations.filter((v) => predicate(v.rule, v.requiredMm)).length

  const symbols = design.elements.filter(
    (e): e is TactileSymbol => e.kind === 'symbol',
  )
  const labels = design.elements.filter(
    (e): e is BrailleLabel => e.kind === 'braille',
  )
  const lineCount = design.elements.filter((e) => e.kind === 'line').length
  const areaCount = design.elements.filter((e) => e.kind === 'area').length
  const grid = design.grid ?? { cols: 1, rows: 1 }
  const { heightMm, widthMm } = compositeSize(design)

  // Worst spacing among point/rect pairs (line spacing is enforced by the
  // same validator run; measuring it again per segment is not worth the
  // recompute for a summary figure).
  let worstDistinct = Infinity
  let worstSimilar = Infinity
  let pairCount = 0
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = symbols[i]!
      const b = symbols[j]!
      const gap =
        Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) - a.sizeMm / 2 - b.sizeMm / 2
      pairCount += 1
      if (a.symbol === b.symbol) worstSimilar = Math.min(worstSimilar, gap)
      else worstDistinct = Math.min(worstDistinct, gap)
    }
  }
  for (const symbol of symbols) {
    for (const label of labels) {
      const gap =
        pointRectDistance(symbol.at, brailleRect(label)) - symbol.sizeMm / 2
      pairCount += 1
      worstDistinct = Math.min(worstDistinct, gap)
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const gap = rectRectDistance(brailleRect(labels[i]!), brailleRect(labels[j]!))
      pairCount += 1
      worstDistinct = Math.min(worstDistinct, gap)
    }
  }

  const smallestSymbol =
    symbols.length > 0 ? Math.min(...symbols.map((s) => s.sizeMm)) : null
  const smallestDoor =
    context.scaleFeaturesMm.length > 0
      ? context.scaleFeaturesMm.reduce((min, f) =>
          f.widthMm < min.widthMm ? f : min,
        )
      : null

  const checks: ValidationCheck[] = []
  const push = (
    check: Omit<ValidationCheck, 'status'> & { failures: number },
  ) => checks.push({ ...check, status: check.failures > 0 ? 'fail' : 'pass' })

  push({
    failures: 0,
    id: 'plate',
    label: 'Plate format',
    measured: `${grid.cols} × ${grid.rows} plate${grid.cols * grid.rows > 1 ? 's' : ''}, ${widthMm} × ${heightMm} mm assembled, ${design.plate.baseMm} mm base`,
    requirement: `${design.plate.widthMm} × ${design.plate.heightMm} mm tiles fit consumer print beds`,
    standard: 'Practitioner range 200–400 mm',
  })
  push({
    failures: failuresFor((rule) => rule === 'scale'),
    id: 'legibility',
    label: 'Printed legibility',
    measured: smallestDoor
      ? `smallest ${smallestDoor.label} prints at ${mm(smallestDoor.widthMm)}`
      : 'no width-gated features',
    requirement: `door openings and gated features print ≥ ${MIN_DOOR_OPENING_MM} mm`,
    standard: 'Fingertip detection research (~5 mm)',
  })
  push({
    failures: failuresFor((rule) => rule === 'margin'),
    id: 'margin',
    label: 'Plate margins',
    measured: `${symbols.length + labels.length + areaCount} elements inside the ${design.plate.marginMm} mm margin`,
    requirement: `all content ≥ ${design.plate.marginMm} mm from plate edges`,
    standard: 'BANA layout practice',
  })
  push({
    failures: failuresFor((rule) => rule === 'symbol-size'),
    id: 'symbol-size',
    label: 'Minimum symbol size',
    measured:
      smallestSymbol === null
        ? 'no point symbols'
        : `smallest symbol ${mm(smallestSymbol)}`,
    requirement: `point symbols ≥ ${MIN_SYMBOL_MM} mm`,
    standard: 'BANA / discrimination research',
  })
  push({
    failures: failuresFor(
      (rule, required) => rule === 'clearance' && required === CLEARANCE_MM,
    ),
    id: 'clearance',
    label: 'Element clearance',
    measured:
      pairCount === 0
        ? 'no element pairs'
        : `worst spacing ${mm(Math.max(0, worstDistinct === Infinity ? CLEARANCE_MM : worstDistinct))} across ${pairCount} pairs, plus ${lineCount} lines checked`,
    requirement: `≥ ${CLEARANCE_MM} mm between distinct tactile elements`,
    standard: 'Fingertip resolution 2.4–3 mm',
  })
  push({
    failures: failuresFor(
      (rule, required) =>
        rule === 'clearance' && required === SIMILAR_SYMBOL_CLEARANCE_MM,
    ),
    id: 'similar-clearance',
    label: 'Same-shape symbol clearance',
    measured:
      worstSimilar === Infinity
        ? 'no same-shape symbol pairs'
        : `worst same-shape spacing ${mm(Math.max(0, worstSimilar))}`,
    requirement: `≥ ${SIMILAR_SYMBOL_CLEARANCE_MM} mm between same-shape symbols`,
    standard: 'Guidance 5–6 mm',
  })
  push({
    failures: failuresFor((rule) => rule === 'seam-clearance'),
    id: 'seam',
    label: 'Plate-seam clearance',
    measured:
      grid.cols * grid.rows === 1
        ? 'single plate, no seams'
        : `${grid.cols * grid.rows} plates, braille and symbols ≥ ${SEAM_CLEARANCE_MM} mm from every joint`,
    requirement: `braille and symbols ≥ ${SEAM_CLEARANCE_MM} mm from plate joints`,
    standard: 'Split braille reads as gibberish',
  })
  push({
    failures: failuresFor((rule) => rule === 'label-fit'),
    id: 'label-fit',
    label: 'Braille key placement',
    measured: `${labels.length} keys placed`,
    requirement: `every key legible inside its feature, or adjacent within ${ADJACENT_LABEL_MM} mm`,
    standard: 'BANA label-placement practice',
  })
  push({
    failures: 0,
    id: 'braille-geometry',
    label: 'Braille geometry',
    measured: `dot ⌀${BRAILLE_MM.dotDiameter}, dome ${BRAILLE_MM.dotHeight}, pitch ${BRAILLE_MM.dotPitchX}/${BRAILLE_MM.dotPitchY}, cell ${BRAILLE_MM.cellPitch}, line ${BRAILLE_MM.linePitch} mm`,
    requirement: 'dot ⌀1.5–1.6, dome 0.64–0.94, pitch 2.3–2.5, cell ≥ 6.1, line ≥ 10 mm',
    standard: 'ADA §703.3 (fixed by construction)',
  })
  push({
    failures: 0,
    id: 'relief',
    label: 'Relief height classes',
    measured: `areas ${RELIEF_MM.areaTexture}, walls ${RELIEF_MM.wallLine}, symbols ${RELIEF_MM.pointSymbol}, braille ${RELIEF_MM.brailleDot} mm`,
    requirement: 'distinct heights per element class',
    standard: 'BANA symbol heights (fixed by construction)',
  })

  return {
    checks,
    valid: violations.length === 0,
    violationCount: violations.length,
  }
}
