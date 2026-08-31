import { describe, expect, test } from 'bun:test'
import {
  buildValidationContext,
  buildValidationReport,
  convertToTactile,
  MIN_SYMBOL_MM,
  resolveMechanicalViolations,
  sampleFloorModel,
} from '../src'

describe('buildValidationReport', () => {
  test('reports every check as pass on a repaired sample design', () => {
    const { design } = convertToTactile(sampleFloorModel)
    const context = buildValidationContext(sampleFloorModel)
    const repaired = resolveMechanicalViolations(design, context)
    const report = buildValidationReport(repaired, context)

    expect(report.valid).toBe(true)
    expect(report.violationCount).toBe(0)
    expect(report.checks.length).toBeGreaterThanOrEqual(9)
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true)
    const clearance = report.checks.find((check) => check.id === 'clearance')!
    expect(clearance.measured).toContain('worst spacing')
    const legibility = report.checks.find((check) => check.id === 'legibility')!
    expect(legibility.measured).toContain('prints at')
  })

  test('marks the matching check as failed when a rule is violated', () => {
    const { design } = convertToTactile(sampleFloorModel)
    const context = buildValidationContext(sampleFloorModel)
    const repaired = resolveMechanicalViolations(design, context)
    const broken = {
      ...repaired,
      elements: repaired.elements.map((element) =>
        element.kind === 'symbol'
          ? { ...element, sizeMm: MIN_SYMBOL_MM - 2 }
          : element,
      ),
    }
    const report = buildValidationReport(broken, context)

    expect(report.valid).toBe(false)
    const sizeCheck = report.checks.find((check) => check.id === 'symbol-size')!
    expect(sizeCheck.status).toBe('fail')
    expect(sizeCheck.failures).toBeGreaterThan(0)
    // By-construction rows stay green regardless.
    expect(
      report.checks.find((check) => check.id === 'braille-geometry')!.status,
    ).toBe('pass')
  })
})
