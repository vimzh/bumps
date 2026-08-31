import { imageSize } from 'image-size'
import { z } from 'zod'
import { LlmAgent } from '@google/adk'
import type { FloorModel, Opening } from '@bumps/floor-model'
import { cropPlanImage } from '../lib/rasterize'
import {
  JSON_ONLY,
  llmPointSchema,
  makeModel,
  MODEL_CRITICAL,
  parseAgentJson,
  runAgentTurn,
  type MessagePart,
} from './llm'
import { withModelRetry } from './retry'

// Final doors-and-gates verification pass, run once after the parse loop
// accepts a model. Doors are the most consequential detail on a tactile
// map (each one is a gap a blind reader searches for), and whole-plan
// views blur exactly them — so this agent re-examines every opening and
// perimeter gate against magnified crops, and its verdict is applied by
// code with strict guards: it may only adjust openings, never geometry.

const auditOpSchema = z.object({
  op: z.enum(['keep', 'move', 'delete', 'add']),
  // keep/move/delete: the opening's id. add: null.
  id: z.string().nullable().optional(),
  kind: z.enum(['door', 'window']).optional(),
  at: llmPointSchema.nullable().optional(),
  width: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string(),
}).strict()

export const openingsAuditSchema = z.object({
  ops: z.array(auditOpSchema),
}).strict()

export type OpeningsAuditOp = z.infer<typeof auditOpSchema>

const OPENINGS_AUDIT_INSTRUCTION = `You are the final doors-and-gates verifier for a floor plan extraction that becomes a tactile map for blind readers. You verify ONLY openings (doors/windows) and perimeter gates — never walls, rooms, or other geometry.

You receive the full source plan, then magnified ZOOM views, each labeled with its full-plan pixel bounds, then the list of extracted openings and entrance/exit features with their coordinates. All coordinates you emit must be FULL PLAN pixels.

For EVERY listed opening, emit exactly one op:
- "keep": the source clearly draws an opening (gap, leaf+arc, sliding panels) at that position. You may include a corrected confidence.
- "move": the source draws the opening on that wall, but the extracted center or width is off (e.g. the door was reported at the wall's corner while the drawn gap is mid-wall). Give the corrected "at" (center of the drawn gap) and "width".
- "delete": the source shows a continuous wall there — no gap, no leaf, no passage. A duplicate of another opening you kept is also "delete".

For every listed entrance/exit feature: check its zoom for a drawn gate — a gap or open passage in the perimeter wall at the arrow. If a gate is drawn and no kept/moved opening covers it, emit "add" with kind "door", the gap's center and width, and confidence. NEVER add an opening anywhere else, and never add one that is not visibly drawn.

Be conservative and evidence-driven: when a zoom is ambiguous, keep with lowered confidence rather than guessing a move or delete. In "reason", cite what you saw ("gap with threshold line at x=325", "wall continuous, no gap").

Output: {"ops": [{"op": "keep", "id": "d-1", "confidence": 0.95, "reason": "..."}, {"op": "move", "id": "d-4", "at": [325, 1750], "width": 46, "confidence": 0.85, "reason": "..."}, {"op": "delete", "id": "d-5", "reason": "..."}, {"op": "add", "kind": "door", "at": [155, 500], "width": 60, "confidence": 0.8, "reason": "entrance gate drawn open"}]}` + JSON_ONLY

export const openingsAuditAgent = new LlmAgent({
  name: 'openings_auditor',
  description: 'Verifies extracted doors and gates against magnified plan crops',
  model: makeModel(MODEL_CRITICAL),
  instruction: OPENINGS_AUDIT_INSTRUCTION,
  outputSchema: openingsAuditSchema,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: -1 },
  },
})

type Box = { x0: number; y0: number; x1: number; y1: number; labels: string[] }

/** Merged magnified crops around every opening and entrance/exit feature. */
export function buildAuditTargets(model: FloorModel): Box[] {
  const targets: { at: { x: number; y: number }; label: string; span: number }[] = [
    ...model.openings.map((o) => ({
      at: o.at,
      label: `${o.id} (${o.kind} at (${Math.round(o.at.x)}, ${Math.round(o.at.y)}), width ${Math.round(o.width)}, confidence ${o.confidence})`,
      span: o.width,
    })),
    ...model.features
      .filter((f) => f.kind === 'entrance' || f.kind === 'exit')
      .map((f) => ({
        at: f.at,
        label: `${f.id} (${f.kind} feature at (${Math.round(f.at.x)}, ${Math.round(f.at.y)}))`,
        span: 60,
      })),
  ]
  const boxes: Box[] = []
  for (const target of targets) {
    const half = Math.max(1.8 * target.span, 150)
    const box: Box = {
      labels: [target.label],
      x0: target.at.x - half,
      x1: target.at.x + half,
      y0: target.at.y - half,
      y1: target.at.y + half,
    }
    const overlapping = boxes.find(
      (other) =>
        Math.min(box.x1, other.x1) > Math.max(box.x0, other.x0) - 60 &&
        Math.min(box.y1, other.y1) > Math.max(box.y0, other.y0) - 60,
    )
    if (overlapping) {
      overlapping.x0 = Math.min(overlapping.x0, box.x0)
      overlapping.y0 = Math.min(overlapping.y0, box.y0)
      overlapping.x1 = Math.max(overlapping.x1, box.x1)
      overlapping.y1 = Math.max(overlapping.y1, box.y1)
      overlapping.labels.push(...box.labels)
    } else {
      boxes.push(box)
    }
  }
  return boxes.slice(0, 12)
}

export function buildAuditParts(
  planBytes: Uint8Array,
  mimeType: string,
  model: FloorModel,
): MessagePart[] {
  const { height, width } = imageSize(planBytes)
  if (!width || !height) throw new Error('Could not read plan dimensions')
  const parts: MessagePart[] = [
    { text: `FULL PLAN — coordinate space x=0..${width}, y=0..${height}:` },
    { inlineData: { data: Buffer.from(planBytes).toString('base64'), mimeType } },
  ]
  for (const box of buildAuditTargets(model)) {
    const x0 = Math.max(0, Math.round(box.x0))
    const y0 = Math.max(0, Math.round(box.y0))
    const x1 = Math.min(width, Math.round(box.x1))
    const y1 = Math.min(height, Math.round(box.y1))
    if (x1 - x0 < 20 || y1 - y0 < 20) continue
    const crop = cropPlanImage(
      planBytes,
      mimeType,
      {
        height: (y1 - y0) / height,
        left: x0 / width,
        top: y0 / height,
        width: (x1 - x0) / width,
      },
      900,
    )
    parts.push(
      {
        text: `ZOOM — full-plan pixel bounds x=${x0}..${x1}, y=${y0}..${y1}; contains: ${box.labels.join('; ')}`,
      },
      { inlineData: { data: Buffer.from(crop).toString('base64'), mimeType: 'image/png' } },
    )
  }
  const entranceList = model.features
    .filter((f) => f.kind === 'entrance' || f.kind === 'exit')
    .map((f) => `${f.id}: ${f.kind} at (${Math.round(f.at.x)}, ${Math.round(f.at.y)})`)
  parts.push({
    text:
      `Extracted openings to verify (one op each):\n` +
      model.openings
        .map(
          (o) =>
            `${o.id}: ${o.kind} at (${Math.round(o.at.x)}, ${Math.round(o.at.y)}), width ${Math.round(o.width)}, wallId ${o.wallId}, confidence ${o.confidence}`,
        )
        .join('\n') +
      (entranceList.length > 0
        ? `\n\nEntrance/exit features to check for drawn gates:\n${entranceList.join('\n')}`
        : ''),
  })
  return parts
}

/**
 * Applies audit ops with guards: only openings change; moves are bounded;
 * adds must sit at a listed entrance gate; a mass-delete voids the audit.
 */
export function applyOpeningsAudit(
  model: FloorModel,
  ops: OpeningsAuditOp[],
): { model: FloorModel; notes: string[] } {
  const notes: string[] = []
  const deletes = ops.filter((op) => op.op === 'delete').length
  if (deletes > Math.max(2, model.openings.length / 2)) {
    return {
      model,
      notes: [`openings audit rejected: it deleted ${deletes} of ${model.openings.length} openings`],
    }
  }
  const byId = new Map(ops.filter((op) => op.id).map((op) => [op.id!, op]))
  const openings: Opening[] = []
  for (const opening of model.openings) {
    const op = byId.get(opening.id)
    if (!op || op.op === 'keep') {
      openings.push(
        op?.confidence !== undefined
          ? { ...opening, confidence: op.confidence }
          : opening,
      )
      continue
    }
    if (op.op === 'delete') {
      notes.push(`removed ${opening.id}: ${op.reason.slice(0, 120)}`)
      continue
    }
    if (op.op === 'move' && op.at) {
      const moved = Math.hypot(op.at.x - opening.at.x, op.at.y - opening.at.y)
      if (moved > 260) {
        openings.push(opening)
        notes.push(`ignored implausible ${opening.id} move of ${Math.round(moved)}px`)
        continue
      }
      openings.push({
        ...opening,
        at: op.at,
        confidence: op.confidence ?? opening.confidence,
        width: op.width && op.width > 4 ? op.width : opening.width,
      })
      notes.push(`moved ${opening.id} to (${Math.round(op.at.x)}, ${Math.round(op.at.y)})`)
      continue
    }
    openings.push(opening)
  }

  const gates = model.features.filter(
    (f) => f.kind === 'entrance' || f.kind === 'exit',
  )
  let added = 0
  for (const op of ops) {
    if (op.op !== 'add' || !op.at) continue
    const at = op.at
    const nearGate = gates.some(
      (gate) => Math.hypot(gate.at.x - at.x, gate.at.y - at.y) <= 220,
    )
    if (!nearGate) {
      notes.push(`ignored add away from any entrance (${Math.round(at.x)}, ${Math.round(at.y)})`)
      continue
    }
    const duplicate = openings.some(
      (o) => Math.hypot(o.at.x - at.x, o.at.y - at.y) < Math.max(60, o.width),
    )
    if (duplicate) continue
    added += 1
    openings.push({
      at,
      confidence: op.confidence ?? 0.6,
      id: `gate-${added}`,
      kind: op.kind ?? 'door',
      wallId: null,
      width: op.width && op.width > 4 ? op.width : 60,
    })
    notes.push(`added gate opening at (${Math.round(at.x)}, ${Math.round(at.y)})`)
  }

  return { model: { ...model, openings }, notes }
}

export async function runOpeningsAudit(params: {
  planBytes: Uint8Array
  mimeType: string
  model: FloorModel
}): Promise<OpeningsAuditOp[]> {
  if (params.model.openings.length === 0) return []
  const parts = buildAuditParts(params.planBytes, params.mimeType, params.model)
  const finalText = await withModelRetry(() =>
    runAgentTurn({
      adkAgent: openingsAuditAgent,
      agentName: 'OpeningsAudit',
      instruction: OPENINGS_AUDIT_INSTRUCTION,
      parts,
    }),
  )
  return parseAgentJson(openingsAuditSchema, finalText, 'OpeningsAudit').ops
}
