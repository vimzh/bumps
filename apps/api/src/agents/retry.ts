const TRANSIENT_PATTERNS = [
  'high demand',
  'overloaded',
  'temporarily',
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  '429',
  '503',
  // Free-tier RPM limits recover within a minute; daily caps still fail
  // after the last delay, which is the right outcome.
  'quota',
  'rate limit',
]

const DELAYS_MS = [5000, 20000, 45000]

export async function withModelRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const transient = TRANSIENT_PATTERNS.some((p) => message.includes(p))
      if (!transient || attempt === DELAYS_MS.length) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[attempt]))
    }
  }
  throw lastError
}
