import * as mupdf from 'mupdf'

const RASTER_DPI = 200

export function pdfFirstPageToPng(pdfBytes: Uint8Array): Uint8Array {
  const doc = mupdf.Document.openDocument(pdfBytes, 'application/pdf')
  try {
    const page = doc.loadPage(0)
    const zoom = RASTER_DPI / 72
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(zoom, zoom),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    )
    const png = pixmap.asPNG()
    pixmap.destroy()
    page.destroy()
    return png
  } finally {
    doc.destroy()
  }
}
