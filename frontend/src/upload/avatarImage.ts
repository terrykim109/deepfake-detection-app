/* Profile photo prep: centre-crop to a square and re-encode at avatar size.
   Re-encoding through a canvas drops EXIF (GPS, camera serial), and the
   result is ~20 KB instead of a multi-MB original loaded in every header. */

export const AVATAR_SIZE = 256

export async function toAvatarBlob(file: Blob): Promise<Blob> {
  // createImageBitmap applies EXIF orientation by default, so phone photos stay upright
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    // JPEG has no alpha; paint white so transparent PNGs don't turn black
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    )
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Could not encode the photo.')
    return blob
  } finally {
    bitmap.close()
  }
}
