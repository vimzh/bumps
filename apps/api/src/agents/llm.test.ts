import { afterEach, describe, expect, mock, test } from 'bun:test'
import { runOpenRouterTurn } from './llm'

const originalKey = process.env.OPENROUTER_API_KEY
const originalFetch = globalThis.fetch

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = originalKey
  globalThis.fetch = originalFetch
})

describe('OpenRouter model turn', () => {
  test('sends the selected multimodal model without exposing provider logic to agents', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = mock(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return Response.json({
        choices: [{ message: { content: '{"ok":true}' } }],
      })
    }) as unknown as typeof fetch

    const result = await runOpenRouterTurn({
      agentName: 'Test agent',
      instruction: 'Return JSON.',
      model: 'google/gemini-3.7-flash',
      parts: [
        { text: 'Inspect this.' },
        { inlineData: { data: 'aW1hZ2U=', mimeType: 'image/png' } },
      ],
    })

    expect(result).toBe('{"ok":true}')
    expect(requestBody?.model).toBe('google/gemini-3.7-flash')
    expect(JSON.stringify(requestBody)).toContain(
      'data:image/png;base64,aW1hZ2U=',
    )
  })
})
