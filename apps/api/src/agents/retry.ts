const TRANSIENT_PATTERNS = [
  'high demand',
  'overloaded',
  'temporarily',
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  '429',
  '503',
  // Free-tier RPM limits recover within a minute; daily caps still fail
  // after the last attempt, which is the right outcome.
  'quota',
  'rate limit',
  // Schema/JSON misses on the Interactions path are nondeterministic;
  // a bounded re-ask usually lands.
  'invalid JSON output',
  'schema-invalid output',
  'returned no output',
]

const FALLBACK_DELAYS_MS = [5000, 20000, 45000, 60000]
const MAX_DELAY_MS = 90000

// Rate-limit errors state their own recovery time ("Please retry in 55.1s");
// honoring it beats guessing.
function retryAfterMs(message: string): number | null {
  const match = /retry in ([\d.]+)\s*s/i.exec(message)
  if (!match) return null
  return Math.min(MAX_DELAY_MS, Math.ceil(Number(match[1]) * 1000) + 2000)
}

export async function withModelRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= FALLBACK_DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const transient = TRANSIENT_PATTERNS.some((p) => message.includes(p))
      if (!transient || attempt === FALLBACK_DELAYS_MS.length) {
        throw error
      }
      const delay = retryAfterMs(message) ?? FALLBACK_DELAYS_MS[attempt]!
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
