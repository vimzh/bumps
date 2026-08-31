export {
  allElements,
  featureKinds,
  featureSchema,
  findElement,
  floorModelSchema,
  furnitureSchema,
  openingSchema,
  pointSchema,
  roomSchema,
  wallSchema,
} from './schema'
export {
  brailleLabelSchema,
  compositeSize,
  legendEntrySchema,
  plateSchema,
  RELIEF_MM,
  tactileAreaSchema,
  tactileDesignSchema,
  tactileElementSchema,
  tactileLineSchema,
  tactileSymbolSchema,
  validationViolationSchema,
} from './tactile'
export type {
  BrailleLabel,
  LegendEntry,
  Plate,
  PlateGrid,
  TactileArea,
  TactileDesign,
  TactileElement,
  TactileLine,
  TactileSymbol,
  ValidationViolation,
} from './tactile'
export type {
  Feature,
  FloorElement,
  FloorModel,
  Furniture,
  Opening,
  Point,
  Room,
  Wall,
} from './schema'
export {
  applyOperation,
  applyOperations,
  EditOperationError,
  editOperationSchema,
} from './operations'
export type { EditOperation } from './operations'
export { renderFloorModelSvg, renderFloorTopologyOverlaySvg } from './render'
export { sampleFloorModel } from './fixture'
export {
  aggregateConfidence,
  elementsNeedingReview,
  NEEDS_REVIEW_THRESHOLD,
  PARSE_TARGET_CONFIDENCE,
} from './confidence'
export {
  BRAILLE_MM,
  cellDotCenters,
  paginateBrailleRows,
  textBrailleSize,
  textDotCenters,
  textToBrailleCells,
} from './braille'
export type { BrailleCell } from './braille'
export {
  assignKeys,
  convertToTactile,
  planToPlateTransform,
  PLATE,
} from './tactile-convert'
export type { ConversionNote, ConversionResult } from './tactile-convert'
export { resolveMechanicalViolations } from './mechanical-fixes'
export {
  auditFloorModel,
  elementPosition,
  FURNITURE_CAP,
  isBlockPlan,
  normalizeFloorModel,
  orthogonalizeNearRectangle,
} from './structure'
export type {
  NormalizedFloorModel,
  StructuralFinding,
  StructuralFindingKind,
} from './structure'
export {
  adjacentRectPosition,
  fitRectInPolygon,
  pointInPolygon,
} from './fit'
export {
  buildValidationContext,
  CLEARANCE_MM,
  MIN_DOOR_OPENING_MM,
  MIN_SYMBOL_MM,
  MOVABLE_RULES,
  SIMILAR_SYMBOL_CLEARANCE_MM,
  validateTactileDesign,
} from './validate'
export type { ValidationContext } from './validate'
