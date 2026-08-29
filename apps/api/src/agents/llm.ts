import { Gemini } from '@google/adk'
import { z } from 'zod'

// Model tiers, env-selectable. Default is gemini-3.6-flash on the GA
// Interactions API: newer than the hackathon's 3.5-flash floor, and its
// quota bucket is separate from the legacy generateContent endpoint's.
// Set USE_INTERACTIONS_API=false to run e.g. gemini-3.5-flash on the
// legacy endpoint (where response schemas are enforced server-side).
export const MODEL_CRITICAL = process.env.MODEL_CRITICAL ?? 'gemini-3.6-flash'
export const MODEL_FAST = process.env.MODEL_FAST ?? 'gemini-3.6-flash'

const USE_INTERACTIONS = (process.env.USE_INTERACTIONS_API ?? 'true') === 'true'

export function makeModel(name: string): Gemini | string {
  return USE_INTERACTIONS
    ? new Gemini({ model: name, useInteractionsApi: true })
    : name
}

// The Interactions API path does not enforce response schemas server-side,
// so agents also carry an explicit JSON-only instruction and we tolerate a
// stray prose wrapper by extracting the outermost JSON object.
// Models on the unenforced Interactions path strongly prefer compact
// [x, y] coordinate arrays; accept both dialects and normalize to {x, y}.
export const llmPointSchema = z.union([
  z.object({ x: z.number(), y: z.number() }),
  z
    .tuple([z.number(), z.number()])
    .transform(([x, y]) => ({ x, y })),
])

export const JSON_ONLY =
  '\n\nRespond with ONLY the JSON object matching the required schema — no markdown fences, no prose before or after.'

export function parseAgentJson<T extends z.ZodType>(
  schema: T,
  text: string,
  agentName: string,
): z.infer<T> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error(`${agentName} returned invalid JSON output`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(`${agentName} returned invalid JSON output`)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    console.error(
      `[${agentName}] schema-invalid output (${issues}). Raw head/tail:`,
      text.slice(0, 300),
      '…',
      text.slice(-200),
    )
    throw new Error(`${agentName} returned schema-invalid output: ${issues}`)
  }
  return result.data
}
