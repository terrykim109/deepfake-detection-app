/* Client-side upload validation (SDS FR-06–08).
   Rejects bad files before analysis / provider submission. */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const FORMAT_HELP =
  'Please choose a JPG, JPEG, PNG, or WEBP image under 10 MB.'

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function normalizeMime(type: string): string {
  const raw = type.split(';')[0].trim().toLowerCase()
  return MIME_ALIASES[raw] || raw
}

function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function looksLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

function looksLikeWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
  return riff === 'RIFF' && webp === 'WEBP'
}

function inferMime(bytes: Uint8Array): string | null {
  if (looksLikeJpeg(bytes)) return 'image/jpeg'
  if (looksLikePng(bytes)) return 'image/png'
  if (looksLikeWebp(bytes)) return 'image/webp'
  return null
}

async function readHeader(file: File, length = 16): Promise<Uint8Array> {
  const slice = file.slice(0, length)
  const buffer = await slice.arrayBuffer()
  return new Uint8Array(buffer)
}

/** Decode check — rejects corrupted / non-image payloads (FR-08). */
async function canDecodeImage(file: File): Promise<boolean> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      bitmap.close()
      return true
    }
  } catch {
    /* fall through to HTMLImageElement */
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(true)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(false)
    }
    img.src = url
  })
}

export type UploadValidationResult =
  | { ok: true; file: File }
  | { ok: false; message: string }

/**
 * Validate a single picked/dropped file list.
 * Enforces one image, format, size, and decodability.
 */
export async function validateUploadSelection(
  files: FileList | File[] | null | undefined,
): Promise<UploadValidationResult> {
  const list = !files ? [] : Array.from(files as FileList | File[])

  if (list.length === 0) {
    return { ok: false, message: `No image selected. ${FORMAT_HELP}` }
  }

  if (list.length > 1) {
    return {
      ok: false,
      message: 'Please upload one image at a time. Remove the extras and try again.',
    }
  }

  const file = list[0]

  if (file.size <= 0) {
    return { ok: false, message: `That file looks empty. ${FORMAT_HELP}` }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message:
        'That image is larger than 10 MB. Please choose a smaller JPG, JPEG, PNG, or WEBP file and try again.',
    }
  }

  const ext = extensionOf(file.name)
  const mime = normalizeMime(file.type || '')

  if (ext && !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, message: `That file type is not supported. ${FORMAT_HELP}` }
  }

  if (mime && mime !== 'application/octet-stream' && !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, message: `That file type is not supported. ${FORMAT_HELP}` }
  }

  if (!ext && !mime) {
    return { ok: false, message: `That file type is not supported. ${FORMAT_HELP}` }
  }

  const header = await readHeader(file)
  const inferred = inferMime(header)
  if (!inferred) {
    return {
      ok: false,
      message: `We could not read that image. It may be damaged or not a real image file. ${FORMAT_HELP}`,
    }
  }

  if (ext) {
    const expected: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }
    if (expected[ext] && expected[ext] !== inferred) {
      return { ok: false, message: `That file does not match its type. ${FORMAT_HELP}` }
    }
  }

  const decodable = await canDecodeImage(file)
  if (!decodable) {
    return {
      ok: false,
      message: `We could not open that image. It may be damaged. ${FORMAT_HELP}`,
    }
  }

  return { ok: true, file }
}
