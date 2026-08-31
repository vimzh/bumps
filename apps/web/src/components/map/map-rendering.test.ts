import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as THREE from "three";
import {
  compositeSize,
  convertToTactile,
  sampleFloorModel,
} from "@bumps/floor-model";
import { gridPatternMetrics } from "./canvas-viewport";
import { buildReviewColors } from "./stl-preview";

describe("map rendering", () => {
  test("keeps each STL face a single review color", () => {
    const { design } = convertToTactile(sampleFloorModel);
    const braille = design.elements.find((element) => element.kind === "braille");
    assert.ok(braille?.kind === "braille");

    const x = braille.at.x + 0.5;
    const y = compositeSize(design).heightMm - (braille.at.y + 0.5);
    const baseTop = design.plate.baseMm + 0.02;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          x,
          y,
          baseTop,
          x,
          y,
          baseTop + 0.3,
          x,
          y,
          baseTop + 0.7,
          x - 12,
          y,
          baseTop + 0.3,
          x + 12,
          y,
          baseTop + 0.3,
          x,
          y + 12,
          baseTop + 0.3,
        ],
        3
      )
    );

    const colors = buildReviewColors(geometry, design);
    const first = [colors.getX(0), colors.getY(0), colors.getZ(0)];
    assert.deepEqual(
      [colors.getX(1), colors.getY(1), colors.getZ(1)],
      first
    );
    assert.deepEqual(
      [colors.getX(2), colors.getY(2), colors.getZ(2)],
      first
    );
    assert.notDeepEqual(
      [colors.getX(3), colors.getY(3), colors.getZ(3)],
      first
    );
  });

  test("keeps the viewport grid attached while panning and zooming", () => {
    assert.deepEqual(
      gridPatternMetrics(
        { scale: 2, tx: 10, ty: -5 },
        { originX: 3, originY: 7, step: 20 }
      ),
      { fine: 40, major: 200, x: 16, y: 9 }
    );
  });
});
