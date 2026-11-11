import { z } from 'zod'
import { getToken, type ForensicsResult } from '../api/client'
import type { AnalysisResult } from '../data/mock'

export const summaryLevelSchema = z.enum(['beginner', 'intermediate', 'technical'])
export type SummaryLevel = z.infer<typeof summaryLevelSchema>

const findingSchema = z.object({
  label: z.string().min(1).max(120),
  explanation: z.string().min(1).max(500),
})

const forensicsSchema = z.object({
  metadata: z.object({
    available: z.boolean(),
    format: z.string().max(40).nullish(),
    software: z.string().max(200).nullish(),
    camera_make: z.string().max(120).nullish(),
    camera_model: z.string().max(120).nullish(),
  }).strict(),
  ela: z.object({
    available: z.boolean(),
    mean_error: z.number().min(0).max(1e9).nullish(),
    max_error: z.number().min(0).max(1e9).nullish(),
    error: z.string().max(300).nullish(),
  }).strict(),
  noise: z.object({
    available: z.boolean(),
    mean_block_variance: z.number().min(0).max(1e9).nullish(),
    std_block_variance: z.number().min(0).max(1e9).nullish(),
    outlier_block_count: z.number().int().min(0).max(1_000_000).nullish(),
    block_size: z.number().int().min(1).max(1024).nullish(),
    total_blocks: z.number().int().min(1).max(1_000_000).nullish(),
    outlier_rule: z.literal('Block variance differs from the mean by more than 2 standard deviations.').nullish(),
    error: z.string().max(300).nullish(),
  }).strict(),
  c2pa: z.object({
    found: z.boolean(),
    detail: z.string().max(500),
    claim_generator: z.string().max(200).nullish(),
  }).strict(),
}).strict()

const evidenceSchema = z.object({
  level: summaryLevelSchema,
  detector: z.object({
    status: z.enum(['available', 'failed']),
    verdict: z.enum(['real', 'warn', 'fake']),
    confidence: z.number().int().min(0).max(100),
    summary: z.string().min(1).max(1000),
    findings: z.array(findingSchema).max(3),
    error: z.string().max(500).nullable(),
  }),
  forensics: forensicsSchema.nullable(),
})

const deltaSchema = z.object({ text: z.string() })
const completeSchema = z.object({ summary: z.string().min(1), level: summaryLevelSchema, truncated: z.boolean() })
const errorSchema = z.object({ message: z.string() })
const contextSchema = z.object({ simulated_detector: z.boolean() })
const apiBase = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:8000' : '')

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, maxLength).trim()
}

function compactForensics(result: ForensicsResult | null): Record<string, unknown> | null {
  if (!result) return null
  const finite = (value: number | null | undefined, minimum: number, maximum: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : undefined
  const finiteInteger = (value: number | null | undefined, minimum: number, maximum: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined
  const rounded = (value: number | null | undefined) => {
    const valid = finite(value, 0, 1e9)
    return valid === undefined ? undefined : Math.round(valid * 100) / 100
  }
  const width = result.metadata.file_info?.width
  const height = result.metadata.file_info?.height
  // Mirrors the 16-pixel block grid in backend/forensics/noise.py.
  const totalBlocks = typeof width === 'number' && typeof height === 'number' &&
    Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? finiteInteger(Math.max(Math.floor(height / 16), 1) * Math.max(Math.floor(width / 16), 1), 1, 1_000_000)
    : undefined
  const metadata = {
    available: result.metadata.available,
    format: cleanText(result.metadata.file_info?.format, 40),
    software: cleanText(result.metadata.software, 200),
    camera_make: cleanText(result.metadata.camera_make, 120),
    camera_model: cleanText(result.metadata.camera_model, 120),
  }
  const ela = {
    available: result.ela.available,
    mean_error: rounded(result.ela.mean_error),
    max_error: rounded(result.ela.max_error),
    error: cleanText(result.ela.error, 300),
  }
  const noise = {
    available: result.noise.available,
    mean_block_variance: rounded(result.noise.mean_block_variance),
    std_block_variance: rounded(result.noise.std_block_variance),
    outlier_block_count: finiteInteger(result.noise.outlier_block_count, 0, 1_000_000),
    block_size: finiteInteger(result.noise.block_size, 1, 1024),
    total_blocks: result.noise.available ? totalBlocks : undefined,
    // Mirrors OUTLIER_THRESHOLD_STD = 2.0 in backend/forensics/noise.py.
    outlier_rule: result.noise.available ? 'Block variance differs from the mean by more than 2 standard deviations.' : undefined,
    error: cleanText(result.noise.error, 300),
  }
  const c2pa = {
    found: result.c2pa.found,
    detail: cleanText(result.c2pa.detail, 500) ?? '',
    claim_generator: cleanText(result.c2pa.claim_generator, 200),
  }
  return { metadata, ela, noise, c2pa }
}

function checkedEvent<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    console.error('Invalid summary stream event', parsed.error.issues)
    throw new Error('The summary response was invalid. Please try again.')
  }
  return parsed.data
}

export async function streamLevelSummary(
  result: AnalysisResult,
  forensics: ForensicsResult | null,
  level: SummaryLevel,
  onDelta: (text: string) => void,
  onContext: (simulated: boolean) => void,
  signal: AbortSignal,
): Promise<{ summary: string; truncated: boolean }> {
  const score = result.confidence
  if (!Number.isFinite(score) || score < 0 || score > 100 || (score > 0 && score < 1)) {
    throw new Error('The detector score is invalid for summarizing.')
  }
  const findings = (result.findings ?? []).map(({ label, explanation }) => ({
    label: cleanText(label, 120),
    explanation: cleanText(explanation, 500),
  })).filter((finding): finding is { label: string; explanation: string } => Boolean(finding.label && finding.explanation)).slice(0, 3)
  const parsedEvidence = evidenceSchema.safeParse({
    level,
    detector: {
      status: result.detectionError ? 'failed' : 'available',
      verdict: result.verdict,
      confidence: Math.round(score),
      summary: cleanText(result.summary, 1000) || '(no explanation supplied)',
      findings,
      error: cleanText(result.detectionError, 500) ?? null,
    },
    forensics: compactForensics(forensics),
  })
  if (!parsedEvidence.success) {
    console.error('Invalid summary evidence', parsedEvidence.error.issues)
    throw new Error('The analysis could not be prepared for summarizing.')
  }
  const token = getToken()
  const response = await fetch(`${apiBase}/api/summary/stream`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(parsedEvidence.data),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `Summary request failed (${response.status}).`)
  }
  if (!response.body) throw new Error('Summary streaming is unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n')
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const lines = frame.split('\n')
        const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        let payload: unknown
        try {
          payload = JSON.parse(data)
        } catch {
          throw new Error('The summary response was invalid. Please try again.')
        }
        if (event === 'context') onContext(checkedEvent(contextSchema, payload).simulated_detector)
        if (event === 'delta') onDelta(checkedEvent(deltaSchema, payload).text)
        if (event === 'error') throw new Error(checkedEvent(errorSchema, payload).message)
        if (event === 'complete') {
          const complete = checkedEvent(completeSchema, payload)
          if (complete.level !== level) throw new Error('The summary level did not match the request.')
          return { summary: complete.summary, truncated: complete.truncated }
        }
      }
      if (done) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  throw new Error('The summary stream ended before completion.')
}
