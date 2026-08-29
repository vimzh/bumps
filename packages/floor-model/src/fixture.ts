import type { FloorModel } from './schema'

// Hand-written sample: a small office floor (~20 x 16 m at 50 px/m).
// Corridor across the middle, four rooms, entrance at the bottom,
// stairs top-left, restroom top-right. Test data for every later phase.

export const sampleFloorModel: FloorModel = {
  schemaVersion: 1,
  title: 'Sample office floor',
  plan: { widthPx: 1000, heightPx: 800, pixelsPerMeter: 50, north: 0 },
  walls: [
    // Outer shell
    { id: 'w-top', kind: 'wall', a: { x: 40, y: 40 }, b: { x: 960, y: 40 }, thickness: 10, confidence: 0.98 },
    { id: 'w-right', kind: 'wall', a: { x: 960, y: 40 }, b: { x: 960, y: 760 }, thickness: 10, confidence: 0.98 },
    { id: 'w-bottom', kind: 'wall', a: { x: 960, y: 760 }, b: { x: 40, y: 760 }, thickness: 10, confidence: 0.98 },
    { id: 'w-left', kind: 'wall', a: { x: 40, y: 760 }, b: { x: 40, y: 40 }, thickness: 10, confidence: 0.98 },
    // Corridor walls (horizontal band y=380..480)
    { id: 'w-corridor-n', kind: 'wall', a: { x: 40, y: 380 }, b: { x: 960, y: 380 }, thickness: 8, confidence: 0.9 },
    { id: 'w-corridor-s', kind: 'wall', a: { x: 40, y: 480 }, b: { x: 960, y: 480 }, thickness: 8, confidence: 0.9 },
    // Room dividers
    { id: 'w-div-top', kind: 'wall', a: { x: 500, y: 40 }, b: { x: 500, y: 380 }, thickness: 8, confidence: 0.85 },
    { id: 'w-div-bottom', kind: 'wall', a: { x: 500, y: 480 }, b: { x: 500, y: 760 }, thickness: 8, confidence: 0.62 },
  ],
  openings: [
    { id: 'd-nw', kind: 'door', at: { x: 250, y: 380 }, width: 45, wallId: 'w-corridor-n', confidence: 0.9 },
    { id: 'd-ne', kind: 'door', at: { x: 730, y: 380 }, width: 45, wallId: 'w-corridor-n', confidence: 0.88 },
    { id: 'd-sw', kind: 'door', at: { x: 250, y: 480 }, width: 45, wallId: 'w-corridor-s', confidence: 0.55 },
    { id: 'd-se', kind: 'door', at: { x: 730, y: 480 }, width: 45, wallId: 'w-corridor-s', confidence: 0.92 },
    { id: 'd-entry', kind: 'door', at: { x: 500, y: 760 }, width: 60, wallId: 'w-bottom', confidence: 0.95 },
    { id: 'win-n', kind: 'window', at: { x: 250, y: 40 }, width: 80, wallId: 'w-top', confidence: 0.7 },
  ],
  rooms: [
    { id: 'r-nw', kind: 'room', polygon: [{ x: 40, y: 40 }, { x: 500, y: 40 }, { x: 500, y: 380 }, { x: 40, y: 380 }], label: 'Studio', confidence: 0.9 },
    { id: 'r-ne', kind: 'room', polygon: [{ x: 500, y: 40 }, { x: 960, y: 40 }, { x: 960, y: 380 }, { x: 500, y: 380 }], label: 'Lab', confidence: 0.86 },
    { id: 'r-corridor', kind: 'room', polygon: [{ x: 40, y: 380 }, { x: 960, y: 380 }, { x: 960, y: 480 }, { x: 40, y: 480 }], label: 'Corridor', confidence: 0.95 },
    { id: 'r-sw', kind: 'room', polygon: [{ x: 40, y: 480 }, { x: 500, y: 480 }, { x: 500, y: 760 }, { x: 40, y: 760 }], label: 'Workshop', confidence: 0.58 },
    { id: 'r-se', kind: 'room', polygon: [{ x: 500, y: 480 }, { x: 960, y: 480 }, { x: 960, y: 760 }, { x: 500, y: 760 }], label: 'Lobby', confidence: 0.93 },
  ],
  features: [
    { id: 'f-stairs', kind: 'stairs', at: { x: 90, y: 100 }, rotation: 90, confidence: 0.85 },
    { id: 'f-restroom', kind: 'restroom', at: { x: 910, y: 100 }, rotation: 0, confidence: 0.8 },
    { id: 'f-entrance', kind: 'entrance', at: { x: 500, y: 720 }, rotation: 270, confidence: 0.95 },
    { id: 'f-elevator', kind: 'elevator', at: { x: 90, y: 430 }, rotation: 0, confidence: 0.45 },
  ],
  paths: [
    // Guide path along the corridor from the entrance to the stairs.
    { id: 'path-1', kind: 'path', points: [{ x: 500, y: 740 }, { x: 500, y: 430 }, { x: 120, y: 430 }, { x: 120, y: 80 }], confidence: 0.85 },
  ],
  furniture: [
    // A clubbed row of chairs in the Studio and a sofa in the Lobby.
    { id: 'fur-chairs', kind: 'furniture', polygon: [{ x: 120, y: 250 }, { x: 400, y: 250 }, { x: 400, y: 330 }, { x: 120, y: 330 }], label: 'chairs', confidence: 0.75 },
    { id: 'fur-sofa', kind: 'furniture', polygon: [{ x: 700, y: 660 }, { x: 900, y: 660 }, { x: 900, y: 730 }, { x: 700, y: 730 }], label: 'sofa', confidence: 0.88 },
  ],
}
