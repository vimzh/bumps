import { z } from 'zod'
import {
  featureSchema,
  findElement,
  openingSchema,
  pointSchema,
  roomSchema,
  wallSchema,
  type FloorModel,
  type Point,
  type Room,
} from './schema'

const elementSchema = z.discriminatedUnion('kind', [
  wallSchema,
  openingSchema,
  roomSchema,
  featureSchema,
])

export const editOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), element: elementSchema }),
  z.object({ op: z.literal('move'), id: z.string(), dx: z.number(), dy: z.number() }),
  z.object({
    op: z.literal('reshape'),
    id: z.string(),
    // Walls take [a, b]; rooms take their full polygon; openings/features take [at].
    points: z.array(pointSchema).min(1),
  }),
  z.object({ op: z.literal('delete'), id: z.string() }),
  z.object({ op: z.literal('relabel'), id: z.string(), label: z.string().nullable() }),
  z.object({
    op: z.literal('merge'),
    ids: z.array(z.string()).length(2),
    label: z.string().nullable().default(null),
  }),
  // User (or critique loop) vouches for an element: confidence becomes 1.
  z.object({ op: z.literal('confirm'), id: z.string() }),
])

export type EditOperation = z.infer<typeof editOperationSchema>

function movePoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy }
}

// Monotone-chain convex hull; merge's fallback geometry for two rooms.
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y)
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const build = (input: Point[]) => {
    const hull: Point[] = []
    for (const point of input) {
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0
      ) {
        hull.pop()
      }
      hull.push(point)
    }
    hull.pop()
    return hull
  }
  return [...build(sorted), ...build(sorted.reverse())]
}

export class EditOperationError extends Error {}

function requireElement(model: FloorModel, id: string) {
  const element = findElement(model, id)
  if (!element) {
    throw new EditOperationError(`No element with id "${id}"`)
  }
  return element
}

function mapElements(model: FloorModel, fn: <T>(element: T) => T): FloorModel {
  return {
    ...model,
    walls: model.walls.map(fn),
    openings: model.openings.map(fn),
    rooms: model.rooms.map(fn),
    features: model.features.map(fn),
  }
}

export function applyOperation(
  model: FloorModel,
  operation: EditOperation,
): FloorModel {
  switch (operation.op) {
    case 'add': {
      if (findElement(model, operation.element.id)) {
        throw new EditOperationError(
          `Element id "${operation.element.id}" already exists`,
        )
      }
      const element = operation.element
      switch (element.kind) {
        case 'wall':
          return { ...model, walls: [...model.walls, element] }
        case 'door':
        case 'window':
          return { ...model, openings: [...model.openings, element] }
        case 'room':
          return { ...model, rooms: [...model.rooms, element] }
        default:
          return { ...model, features: [...model.features, element] }
      }
    }
    case 'move': {
      requireElement(model, operation.id)
      const { id, dx, dy } = operation
      return mapElements(model, (element) => {
        const el = element as { id?: string } & Record<string, unknown>
        if (el.id !== id) return element
        if ('a' in el && 'b' in el) {
          return {
            ...el,
            a: movePoint(el.a as Point, dx, dy),
            b: movePoint(el.b as Point, dx, dy),
          } as typeof element
        }
        if ('polygon' in el) {
          return {
            ...el,
            polygon: (el.polygon as Point[]).map((p) => movePoint(p, dx, dy)),
          } as typeof element
        }
        return { ...el, at: movePoint(el.at as Point, dx, dy) } as typeof element
      })
    }
    case 'reshape': {
      const element = requireElement(model, operation.id)
      const points = operation.points
      if (element.kind === 'wall') {
        if (points.length !== 2) {
          throw new EditOperationError('Reshaping a wall takes exactly 2 points')
        }
        return {
          ...model,
          walls: model.walls.map((wall) =>
            wall.id === element.id ? { ...wall, a: points[0]!, b: points[1]! } : wall,
          ),
        }
      }
      if (element.kind === 'room') {
        if (points.length < 3) {
          throw new EditOperationError('Reshaping a room takes at least 3 points')
        }
        return {
          ...model,
          rooms: model.rooms.map((room) =>
            room.id === element.id ? { ...room, polygon: points } : room,
          ),
        }
      }
      if (points.length !== 1) {
        throw new EditOperationError('Reshaping a point element takes exactly 1 point')
      }
      const at = points[0]!
      return mapElements(model, (el) =>
        (el as { id: string }).id === element.id
          ? ({ ...(el as object), at } as typeof el)
          : el,
      )
    }
    case 'delete': {
      requireElement(model, operation.id)
      const keep = <T extends { id: string }>(items: T[]) =>
        items.filter((item) => item.id !== operation.id)
      return {
        ...model,
        walls: keep(model.walls),
        openings: keep(model.openings),
        rooms: keep(model.rooms),
        features: keep(model.features),
      }
    }
    case 'relabel': {
      const element = requireElement(model, operation.id)
      if (element.kind !== 'room') {
        throw new EditOperationError('Only rooms can be relabeled')
      }
      return {
        ...model,
        rooms: model.rooms.map((room) =>
          room.id === operation.id ? { ...room, label: operation.label } : room,
        ),
      }
    }
    case 'merge': {
      const [firstId, secondId] = operation.ids
      const first = requireElement(model, firstId!)
      const second = requireElement(model, secondId!)
      if (first.kind !== 'room' || second.kind !== 'room') {
        throw new EditOperationError('Only rooms can be merged')
      }
      const firstRoom = first as Room
      const secondRoom = second as Room
      const merged: Room = {
        ...firstRoom,
        label: operation.label ?? firstRoom.label ?? secondRoom.label,
        polygon: convexHull([...firstRoom.polygon, ...secondRoom.polygon]),
        confidence: Math.min(firstRoom.confidence, secondRoom.confidence),
      }
      return {
        ...model,
        rooms: [
          ...model.rooms.filter(
            (room) => room.id !== firstId && room.id !== secondId,
          ),
          merged,
        ],
      }
    }
    case 'confirm': {
      requireElement(model, operation.id)
      return mapElements(model, (element) =>
        (element as { id: string }).id === operation.id
          ? ({ ...(element as object), confidence: 1 } as typeof element)
          : element,
      )
    }
  }
}

export function applyOperations(
  model: FloorModel,
  operations: EditOperation[],
): FloorModel {
  return operations.reduce(applyOperation, model)
}
