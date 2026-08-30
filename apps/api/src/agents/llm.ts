import { Gemini, LlmAgent, InMemorySessionService, Runner } from '@google/adk'
import { z } from 'zod'

const providerSchema = z.enum(['gemini', 'openrouter'])
export const MODEL_PROVIDER = providerSchema.parse(
  process.env.MODEL_PROVIDER ?? 'gemini',
)

// Model tiers, env-selectable. Default is gemini-3.6-flash on the GA
// Interactions API: newer than the hackathon's 3.5-flash floor, and its
// quota bucket is separate from the legacy generateContent endpoint's.
// Set USE_INTERACTIONS_API=false to run e.g. gemini-3.5-flash on the
// legacy endpoint (where response schemas are enforced server-side).
const DEFAULT_MODEL =
  MODEL_PROVIDER === 'openrouter'
    ? 'google/gemini-3.7-flash'
    : 'gemini-3.6-flash'
export const MODEL_CRITICAL = process.env.MODEL_CRITICAL ?? DEFAULT_MODEL
export const MODEL_FAST = process.env.MODEL_FAST ?? DEFAULT_MODEL
// Role-specific Gemini models can be selected independently when needed.
export const MODEL_LAYOUT = process.env.MODEL_LAYOUT ?? MODEL_CRITICAL
export const MODEL_COMPARE = process.env.MODEL_COMPARE ?? MODEL_CRITICAL

const USE_INTERACTIONS = (process.env.USE_INTERACTIONS_API ?? 'true') === 'true'

export function modelConfiguration() {
  return {
    compare: MODEL_COMPARE,
    critical: MODEL_CRITICAL,
    fast: MODEL_FAST,
    interactionsApi: MODEL_PROVIDER === 'gemini' && USE_INTERACTIONS,
    layout: MODEL_LAYOUT,
    provider: MODEL_PROVIDER,
  }
}

export function makeModel(name: string): Gemini | string {
  return MODEL_PROVIDER === 'gemini' && USE_INTERACTIONS
    ? new Gemini({ model: name, useInteractionsApi: true })
    : name
}

// The Interactions API path does not enforce response schemas server-side,
// so agents also carry an explicit JSON-only instruction and we tolerate a
// stray prose wrapper by extracting the outermost JSON object.
// Models on the unenforced Interactions path strongly prefer compact
// [x, y] coordinate arrays; accept both dialects and normalize to {x, y}.
export const llmPointSchema = z.union([
  z.object({ x: z.number(), y: z.number() }).strict(),
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

export type MessagePart =
  | { inlineData: { data: string; mimeType: string } }
  | { text: string }

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

export async function runOpenRouterTurn(options: {
  agentName: string
  instruction: string
  model: string
  parts: MessagePart[]
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is required when MODEL_PROVIDER=openrouter',
    )
  }
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      messages: [
        { content: options.instruction, role: 'system' },
        {
          content: options.parts.map((part) =>
            'text' in part
              ? { text: part.text, type: 'text' }
              : {
                  image_url: {
                    url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                  },
                  type: 'image_url',
                },
          ),
          role: 'user',
        },
      ],
      model: options.model,
      temperature: 0.1,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(10 * 60_000),
  })
  const result = (await response.json().catch(() => ({}))) as OpenRouterResponse
  if (!response.ok) {
    throw new Error(
      `${options.agentName} OpenRouter error ${response.status}: ${result.error?.message ?? response.statusText}`,
    )
  }
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error(`${options.agentName} returned no output`)
  return text
}

/** Runs one configured model turn and returns its final text output. */
export async function runAgentTurn(options: {
  adkAgent: LlmAgent
  agentName: string
  instruction: string
  parts: MessagePart[]
}): Promise<string> {
  if (MODEL_PROVIDER === 'openrouter') {
    const configuredModel = options.adkAgent.model
    const model =
      typeof configuredModel === 'string'
        ? configuredModel
        : configuredModel?.model
    if (!model) throw new Error(`${options.agentName} has no configured model`)
    return runOpenRouterTurn({ ...options, model })
  }
  const runner = new Runner({
    agent: options.adkAgent,
    appName: 'bumps',
    sessionService: new InMemorySessionService(),
  })
  let finalText = ''
  for await (const event of runner.runEphemeral({
    newMessage: { parts: options.parts },
    userId: 'bumps',
  })) {
    if (event.errorMessage) {
      throw new Error(`${options.agentName} error: ${event.errorMessage}`)
    }
    const text = event.content?.parts?.map((p) => p.text ?? '').join('')
    if (text) finalText = text
  }
  if (!finalText) throw new Error(`${options.agentName} returned no output`)
  return finalText
}
