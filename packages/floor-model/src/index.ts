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
export { renderFloorModelSvg } from './render'
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
