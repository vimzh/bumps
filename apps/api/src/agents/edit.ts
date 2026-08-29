import { z } from 'zod'
import { LlmAgent, InMemorySessionService, Runner } from '@google/adk'
import {
  featureKinds,
  type EditOperation,
  type FloorModel,
} from '@bumps/floor-model'
import { MODEL_FAST } from './parser'
import { withModelRetry } from './retry'

// Flat operation shape for the LLM: Gemini's response-schema subset cannot
// express our discriminated union, so the agent emits this and code converts
// it into real EditOperations (rejecting anything malformed wholesale).
const llmPoint = z.object({ x: z.number(), y: z.number() })

const llmEditOp = z.object({
  op: z.enum(['add', 'move', 'reshape', 'delete', 'relabel', 'merge', 'confirm']),
  id: z.string().nullable(),
  ids: z.array(z.string()).nullable(),
  dx: z.number().nullable(),
  dy: z.number().nullable(),
  points: z.array(llmPoint).nullable(),
  label: z.string().nullable(),
  elementKind: z
    .enum(['wall', 'door', 'window', 'room', ...featureKinds])
    .nullable(),
  at: llmPoint.nullable(),
  a: llmPoint.nullable(),
  b: llmPoint.nullable(),
  polygon: z.array(llmPoint).nullable(),
  width: z.number().nullable(),
})

const editAgentOutputSchema = z.object({
  action: z.enum(['apply', 'clarify']),
  operations: z.array(llmEditOp),
  // Past-tense plain-words account of what was done (action=apply).
  summary: z.string(),
  // Exactly one clarifying question (action=clarify).
  question: z.string().nullable(),
})

export type EditAgentResult =
  | { action: 'apply'; operations: EditOperation[]; summary: string }
  | { action: 'clarify'; question: string }

export class EditConversionError extends Error {}

type LlmEditOp = z.infer<typeof llmEditOp>

function require<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new EditConversionError(message)
  }
  return value
}

function newId(kind: string): string {
  return `a-${kind}-${crypto.randomUUID().slice(0, 4)}`
}

function convertOne(flat: LlmEditOp, model: FloorModel): EditOperation {
  switch (flat.op) {
    case 'move':
      return {
        op: 'move',
        id: require(flat.id, 'move needs id'),
        dx: require(flat.dx, 'move needs dx'),
        dy: require(flat.dy, 'move needs dy'),
      }
    case 'reshape':
      return {
        op: 'reshape',
        id: require(flat.id, 'reshape needs id'),
        points: require(flat.points, 'reshape needs points'),
      }
    case 'delete':
      return { op: 'delete', id: require(flat.id, 'delete needs id') }
    case 'confirm':
      return { op: 'confirm', id: require(flat.id, 'confirm needs id') }
    case 'relabel':
      return {
        op: 'relabel',
        id: require(flat.id, 'relabel needs id'),
        label: flat.label,
      }
    case 'merge': {
      const ids = require(flat.ids, 'merge needs ids')
      if (ids.length !== 2) {
        throw new EditConversionError('merge needs exactly 2 ids')
      }
      return { op: 'merge', ids, label: flat.label }
    }
    case 'add': {
      const kind = require(flat.elementKind, 'add needs elementKind')
      const defaultWidth = Math.max(24, Math.round(model.plan.widthPx * 0.04))
      if (kind === 'door' || kind === 'window') {
        return {
          op: 'add',
          element: {
            at: require(flat.at, `add ${kind} needs at`),
            confidence: 1,
            id: newId(kind),
            kind,
            wallId: null,
            width: flat.width ?? defaultWidth,
          },
        }
      }
      if (kind === 'wall') {
        return {
          op: 'add',
          element: {
            a: require(flat.a, 'add wall needs a'),
            b: require(flat.b, 'add wall needs b'),
            confidence: 1,
            id: newId(kind),
            kind,
            thickness: Math.max(6, Math.round(model.plan.widthPx * 0.008)),
          },
        }
      }
      if (kind === 'room') {
        const polygon = require(flat.polygon, 'add room needs polygon')
        if (polygon.length < 3) {
          throw new EditConversionError('add room polygon needs 3+ points')
        }
        return {
          op: 'add',
          element: {
            confidence: 1,
            id: newId(kind),
            kind,
            label: flat.label,
            polygon,
          },
        }
      }
      return {
        op: 'add',
        element: {
          at: require(flat.at, `add ${kind} needs at`),
          confidence: 1,
          id: newId(kind),
          kind,
          rotation: 0,
        },
      }
    }
  }
}

const INSTRUCTION = `You edit extracted floor plan models for a tactile-map product. You never touch geometry directly — you emit edit operations that code applies.

You receive the current model as JSON (every element has an id), the plan's pixel dimensions, optionally the id of the element the user has selected, and the user's request.

Operations (set unused fields to null):
- move: id, dx, dy (pixels)
- reshape: id, points (walls: [a,b]; rooms: full polygon; point elements: [at])
- delete: id
- relabel: id, label (rooms only; null clears the label)
- merge: ids (exactly two room ids), optional label
- confirm: id (marks an element as verified correct)
- add: elementKind plus geometry — door/window: at (+ optional width); wall: a, b; room: polygon (+ optional label); features: at

Rules:
- Reference ONLY ids present in the model JSON. Never invent ids.
- Coordinates are pixels in the plan's coordinate space, origin top-left. Place additions sensibly relative to the rooms the user names.
- Prefer the fewest operations that satisfy the request.
- "this", "it", "the selected one" refer to the selected element id when provided.
- If the request is ambiguous (several plausible targets, unclear intent) or asks for something outside these operations, set action="clarify" and ask ONE short question. Do not guess.
- action="apply": operations non-empty, summary = one past-tense sentence in plain words (e.g. "Renamed Lobby to Entrance Hall and deleted 2 windows."). action="clarify": operations empty, question set.`

export const editAgent = new LlmAgent({
  name: 'floor_plan_editor',
  description: 'Turns natural-language edit requests into floor model operations',
  model: MODEL_FAST,
  instruction: INSTRUCTION,
  outputSchema: editAgentOutputSchema,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: 0 },
  },
})

export async function runEditAgent(params: {
  model: FloorModel
  prompt: string
  selectedId: string | null
}): Promise<EditAgentResult> {
  return withModelRetry(() => runEditAgentOnce(params))
}

async function runEditAgentOnce(params: {
  model: FloorModel
  prompt: string
  selectedId: string | null
}): Promise<EditAgentResult> {
  const runner = new Runner({
    appName: 'bumps',
    agent: editAgent,
    sessionService: new InMemorySessionService(),
  })

  const context = [
    `Model JSON:\n${JSON.stringify(params.model)}`,
    `Plan dimensions: ${params.model.plan.widthPx}x${params.model.plan.heightPx} pixels.`,
    params.selectedId ? `Selected element id: ${params.selectedId}` : 'No element is selected.',
    `User request: ${params.prompt}`,
  ].join('\n\n')

  let finalText = ''
  for await (const event of runner.runEphemeral({
    userId: 'bumps',
    newMessage: { parts: [{ text: context }] },
  })) {
    if (event.errorMessage) {
      throw new Error(`Edit model error: ${event.errorMessage}`)
    }
    const text = event.content?.parts?.map((part) => part.text ?? '').join('')
    if (text) {
      finalText = text
    }
  }
  if (!finalText) {
    throw new Error('Edit agent returned no output')
  }

  const output = editAgentOutputSchema.parse(JSON.parse(finalText))
  if (output.action === 'clarify') {
    return {
      action: 'clarify',
      question: output.question ?? 'Could you say more precisely what to change?',
    }
  }
  if (output.operations.length === 0) {
    throw new EditConversionError('Edit agent applied nothing')
  }
  return {
    action: 'apply',
    operations: output.operations.map((op) => convertOne(op, params.model)),
    summary: output.summary,
  }
}
