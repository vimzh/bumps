import type { Point } from './schema'

// Grade 1 (uncontracted) UEB, lowercase letters, digits, and space.
// Dot numbering: 1,2,3 = left column top→bottom; 4,5,6 = right column.
const LETTER_DOTS: Record<string, number[]> = {
  a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5],
  f: [1, 2, 4], g: [1, 2, 4, 5], h: [1, 2, 5], i: [2, 4], j: [2, 4, 5],
  k: [1, 3], l: [1, 2, 3], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5],
  p: [1, 2, 3, 4], q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5], s: [2, 3, 4], t: [2, 3, 4, 5],
  u: [1, 3, 6], v: [1, 2, 3, 6], w: [2, 4, 5, 6], x: [1, 3, 4, 6], y: [1, 3, 4, 5, 6],
  z: [1, 3, 5, 6],
}

const NUMBER_SIGN = [3, 4, 5, 6]
// Digits 1-9,0 reuse a-j after a number sign.
const DIGIT_LETTER = ['j', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const

// ADA §703.3 braille geometry, millimeters.
export const BRAILLE_MM = {
  cellPitch: 6.1, // center-to-center between cells in a word
  dotDiameter: 1.5,
  dotHeight: 0.7, // dome height above surface
  dotPitchX: 2.3, // between the two columns within a cell
  dotPitchY: 2.5, // between rows within a cell
  linePitch: 10, // between lines of braille
} as const

// A cell is the list of raised dot numbers (1-6); empty = space.
export type BrailleCell = number[]

export function textToBrailleCells(text: string): BrailleCell[] {
  const cells: BrailleCell[] = []
  let inNumber = false
  for (const raw of text.toLowerCase()) {
    if (raw === ' ') {
      cells.push([])
      inNumber = false
      continue
    }
    if (raw >= '0' && raw <= '9') {
      if (!inNumber) {
        cells.push([...NUMBER_SIGN])
        inNumber = true
      }
      cells.push([...LETTER_DOTS[DIGIT_LETTER[Number(raw)]!]!])
      continue
    }
    inNumber = false
    const dots = LETTER_DOTS[raw]
    if (dots) {
      cells.push([...dots])
    }
    // Unsupported characters are dropped: keys/legend text are generated
    // from sanitized labels, so this only ever skips punctuation.
  }
  return cells
}

// Dot centers for one cell, cell origin = center of dot 1 (top-left).
export function cellDotCenters(cell: BrailleCell, origin: Point): Point[] {
  return cell.map((dot) => {
    const column = dot <= 3 ? 0 : 1
    const row = (dot - 1) % 3
    return {
      x: origin.x + column * BRAILLE_MM.dotPitchX,
      y: origin.y + row * BRAILLE_MM.dotPitchY,
    }
  })
}

// Dot centers for a whole text run starting at origin (top-left dot of the
// first cell), left-to-right on one line.
export function textDotCenters(text: string, origin: Point): Point[] {
  return textToBrailleCells(text).flatMap((cell, index) =>
    cellDotCenters(cell, {
      x: origin.x + index * BRAILLE_MM.cellPitch,
      y: origin.y,
    }),
  )
}

// Footprint of a text run in mm (for spacing/collision checks).
export function textBrailleSize(text: string): { widthMm: number; heightMm: number } {
  const cells = textToBrailleCells(text).length
  if (cells === 0) return { heightMm: 0, widthMm: 0 }
  return {
    heightMm: 2 * BRAILLE_MM.dotPitchY + BRAILLE_MM.dotDiameter,
    widthMm:
      (cells - 1) * BRAILLE_MM.cellPitch +
      BRAILLE_MM.dotPitchX +
      BRAILLE_MM.dotDiameter,
  }
}

export function paginateBrailleRows(
  rows: string[],
  plate: { heightMm: number; marginMm: number; widthMm: number },
): string[][] {
  const maxCells = Math.floor(
    (plate.widthMm - 2 * plate.marginMm) / BRAILLE_MM.cellPitch,
  )
  const rowHeight = textBrailleSize('a').heightMm
  const maxRows =
    Math.floor(
      (plate.heightMm - 2 * plate.marginMm - rowHeight) /
        BRAILLE_MM.linePitch,
    ) + 1
  if (maxCells < 1 || maxRows < 1) {
    throw new Error('Legend plate is too small for one braille cell')
  }
  const fitted = rows.map((row) => {
    let text = row
    while (text.length > 0 && textToBrailleCells(text).length > maxCells) {
      text = text.slice(0, -1)
    }
    return text
  })
  return Array.from(
    { length: Math.ceil(fitted.length / maxRows) },
    (_, index) => fitted.slice(index * maxRows, (index + 1) * maxRows),
  )
}
