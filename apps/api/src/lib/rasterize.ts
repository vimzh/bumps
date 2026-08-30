import * as mupdf from 'mupdf'
import { imageSize } from 'image-size'

const RASTER_DPI = 200
// Vision models degrade on huge scans, and plate geometry never needs
// more: cap the longer edge of every stored plan.
export const MAX_PLAN_PX = 2000

export type NormalizedCrop = {
  left: number
  top: number
  width: number
  height: number
}

function renderPage(
  doc: mupdf.Document,
  pageIndex: number,
  crop?: NormalizedCrop,
): Uint8Array {
  const page = doc.loadPage(pageIndex)
  const [x0, y0, x1, y1] = page.getBounds()
  const maxPt = Math.max(
    (x1 - x0) * (crop?.width ?? 1),
    (y1 - y0) * (crop?.height ?? 1),
  )
  const maxPixelZoom = maxPt > 0 ? MAX_PLAN_PX / maxPt : 1
  const zoom = crop ? maxPixelZoom : Math.min(RASTER_DPI / 72, maxPixelZoom)
  if (crop) {
    const cropX = x0 + (x1 - x0) * crop.left
    const cropY = y0 + (y1 - y0) * crop.top
    const width = Math.max(1, Math.round((x1 - x0) * crop.width * zoom))
    const height = Math.max(1, Math.round((y1 - y0) * crop.height * zoom))
    const pixmap = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, width, height],
      false,
    )
    pixmap.clear(255)
    const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap)
    try {
      page.run(device, [zoom, 0, 0, zoom, -cropX * zoom, -cropY * zoom])
      device.close()
      return pixmap.asPNG()
    } finally {
      device.destroy()
      pixmap.destroy()
      page.destroy()
    }
  }
  const pixmap = page.toPixmap(
    mupdf.Matrix.scale(zoom, zoom),
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
  )
  try {
    return pixmap.asPNG()
  } finally {
    pixmap.destroy()
    page.destroy()
  }
}

export function pdfFirstPageToPng(pdfBytes: Uint8Array): Uint8Array {
  return pdfPageToPng(pdfBytes, 1)
}

/** Renders a one-based PDF page; -1 selects the final page. */
export function pdfPageToPng(
  pdfBytes: Uint8Array,
  pageNumber: number,
  crop?: NormalizedCrop,
): Uint8Array {
  const doc = mupdf.Document.openDocument(pdfBytes, 'application/pdf')
  try {
    const pageIndex = pageNumber === -1 ? doc.countPages() - 1 : pageNumber - 1
    if (pageIndex < 0 || pageIndex >= doc.countPages()) {
      throw new Error(`PDF page ${pageNumber} is out of range`)
    }
    return renderPage(doc, pageIndex, crop)
  } finally {
    doc.destroy()
  }
}

/**
 * Downscales an oversized raster plan to MAX_PLAN_PX on its longer edge
 * (as PNG). Returns null only when the image is already small enough;
 * undecodable input throws so callers can reject it at the upload boundary.
 */
export function downscalePlanImage(
  bytes: Uint8Array,
  mimeType: string,
): Uint8Array | null {
  const { height, width } = imageSize(bytes)
  if (!width || !height) throw new Error('Could not read image dimensions')
  if (Math.max(width, height) <= MAX_PLAN_PX) return null
  const doc = mupdf.Document.openDocument(bytes, mimeType)
  try {
    return renderPage(doc, 0)
  } finally {
    doc.destroy()
  }
}

/** Crops a raster plan and expands that detail view to the vision budget. */
export function cropPlanImage(
  bytes: Uint8Array,
  mimeType: string,
  crop: NormalizedCrop,
): Uint8Array {
  const doc = mupdf.Document.openDocument(bytes, mimeType)
  try {
    return renderPage(doc, 0, crop)
  } finally {
    doc.destroy()
  }
}
