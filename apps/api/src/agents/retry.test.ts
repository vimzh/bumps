import { expect, test } from 'bun:test'
import { isTransientModelError } from './retry'

test('Gemini connection wrappers are retried but permanent errors are not', () => {
  expect(isTransientModelError('Unable to connect. Is the computer able to access the url?')).toBe(
    true,
  )
  expect(isTransientModelError('Was there a typo in the URL or port?')).toBe(true)
  expect(isTransientModelError('Layout agent returned invalid JSON output')).toBe(true)
  expect(isTransientModelError('API key is invalid')).toBe(false)
})
