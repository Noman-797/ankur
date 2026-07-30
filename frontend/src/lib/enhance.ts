/** Client-side whiteboard cleanup before upload (deskew-ish crop + contrast). */

export async function enhanceBoardImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const maxEdge = 1600
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    // Contrast + slight brightness lift for chalkboards / dim photos.
    const contrast = 1.22
    const brightness = 8
    const mid = 128
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = d[i + c]
        v = (v - mid) * contrast + mid + brightness
        d[i + c] = Math.max(0, Math.min(255, v))
      }
    }
    ctx.putImageData(img, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    )
    if (!blob) return file
    const name = file.name.replace(/\.\w+$/, '') + '-enhanced.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
