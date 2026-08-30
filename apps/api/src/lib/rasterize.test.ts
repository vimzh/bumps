import { expect, test } from 'bun:test'
import { imageSize } from 'image-size'
import { downscalePlanImage, MAX_PLAN_PX, pdfPageToPng } from './rasterize'

test('oversized vision inputs are capped on their longer edge', async () => {
  const bytes = await Bun.file('pipeline_tests/outputs/psu-input.png').bytes()
  const capped = downscalePlanImage(bytes, 'image/png')
  expect(capped).not.toBeNull()
  const { height, width } = imageSize(capped!)
  expect(Math.max(width ?? 0, height ?? 0)).toBeLessThanOrEqual(MAX_PLAN_PX)
})

test('invalid raster input is rejected instead of bypassing the cap', () => {
  expect(() =>
    downscalePlanImage(new TextEncoder().encode('not an image'), 'image/png'),
  ).toThrow()
})

test('PDF page selection rejects an unavailable page', async () => {
  const bytes = await Bun.file('pipeline_tests/assets/psu-plan.pdf').bytes()
  expect(() => pdfPageToPng(bytes, 10_000)).toThrow('out of range')
})

test('PDF crops use the full vision resolution budget', async () => {
  const bytes = await Bun.file('pipeline_tests/assets/psu-plan.pdf').bytes()
  const cropped = pdfPageToPng(bytes, 1, {
    height: 0.01,
    left: 0.4,
    top: 0.4,
    width: 0.01,
  })
  const { height, width } = imageSize(cropped)
  expect(Math.max(width ?? 0, height ?? 0)).toBeGreaterThan(1900)
  expect(Math.max(width ?? 0, height ?? 0)).toBeLessThanOrEqual(MAX_PLAN_PX)
})
