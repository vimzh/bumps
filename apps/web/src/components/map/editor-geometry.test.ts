import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  constrainWallEnd,
  fitEditorLabel,
  gridOriginForWall,
  gridOriginForWalls,
  nearestWall,
  polygonArea,
  polygonSelfIntersects,
  resizePolygonEdge,
  resizePolygonVertex,
  snapPoint,
  wallOpeningFromDrag,
  wallOpeningSpan,
  wallAngleDegrees,
} from "./editor-geometry";

describe("editor geometry", () => {
  test("snaps points to the nearest grid intersection", () => {
    assert.deepEqual(snapPoint({ x: 24, y: 76 }, 50), { x: 0, y: 100 });
    assert.deepEqual(
      snapPoint(
        { x: 24, y: 26 },
        10,
        { height: 100, width: 100 },
        { x: 3, y: 7 }
      ),
      { x: 23, y: 27 }
    );
  });

  test("anchors the editor grid to dominant wall centerlines", () => {
    assert.deepEqual(
      gridOriginForWalls(
        [
          { a: { x: 13, y: 0 }, b: { x: 13, y: 100 }, id: "v1" },
          { a: { x: 43, y: 0 }, b: { x: 43, y: 100 }, id: "v2" },
          { a: { x: 0, y: 17 }, b: { x: 100, y: 17 }, id: "h1" },
          { a: { x: 0, y: 47 }, b: { x: 100, y: 47 }, id: "h2" },
        ],
        10
      ),
      { x: 3, y: 7 }
    );
    assert.deepEqual(
      gridOriginForWall(
        { x: 3, y: 7 },
        { a: { x: 20, y: 128 }, b: { x: 220, y: 128 }, id: "hovered" },
        10
      ),
      { x: 3, y: 8 }
    );
  });

  test("favours horizontal and vertical walls", () => {
    assert.deepEqual(constrainWallEnd({ x: 0, y: 0 }, { x: 102, y: 18 }, 10), {
      x: 100,
      y: 0,
    });
    assert.deepEqual(constrainWallEnd({ x: 0, y: 0 }, { x: 18, y: 102 }, 10), {
      x: 0,
      y: 100,
    });
  });

  test("allows deliberate diagonal walls only at 45 degrees", () => {
    const end = constrainWallEnd({ x: 20, y: 20 }, { x: 91, y: 74 }, 10);
    assert.deepEqual(end, { x: 90, y: 90 });
    assert.equal(wallAngleDegrees({ x: 20, y: 20 }, end), 45);
  });

  test("keeps constrained walls inside the plan and on the displayed grid", () => {
    const bounds = { height: 500, width: 1000 };
    assert.deepEqual(
      constrainWallEnd({ x: 0, y: 0 }, { x: 900, y: 400 }, 20, bounds),
      { x: 500, y: 500 }
    );
    assert.deepEqual(
      constrainWallEnd({ x: 15, y: 15 }, { x: 100, y: 20 }, 20, bounds),
      { x: 100, y: 20 }
    );
  });

  test("measures polygon area before committing a drawn region", () => {
    assert.equal(
      polygonArea([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 20 },
      ]),
      800
    );
  });

  test("resizes polygon edges perpendicular to the edge on the grid", () => {
    const rectangle = [
      { x: 20, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 80 },
      { x: 20, y: 80 },
    ];
    assert.deepEqual(
      resizePolygonEdge(rectangle, 0, { x: 35, y: 26 }, 10),
      [
        { x: 20, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 80 },
        { x: 20, y: 80 },
      ]
    );
    assert.deepEqual(
      resizePolygonEdge(rectangle, 1, { x: 24, y: 35 }, 10),
      [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 80 },
        { x: 20, y: 80 },
      ]
    );
  });

  test("straightens near-rectangular furniture while resizing edges and corners", () => {
    const skewed = [
      { x: 20, y: 20 },
      { x: 100, y: 24 },
      { x: 96, y: 80 },
      { x: 20, y: 80 },
    ];
    assert.deepEqual(resizePolygonEdge(skewed, 0, { x: 0, y: 20 }, 10), [
      { x: 20, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
      { x: 20, y: 80 },
    ]);
    assert.deepEqual(
      resizePolygonVertex(skewed, 0, { x: 30, y: 30 }, 10),
      [
        { x: 30, y: 30 },
        { x: 100, y: 30 },
        { x: 100, y: 80 },
        { x: 30, y: 80 },
      ]
    );
  });

  test("projects a drawn opening onto its wall and snaps its width", () => {
    const wall = {
      a: { x: 20, y: 100 },
      b: { x: 220, y: 100 },
      id: "wall-1",
    };
    const hit = nearestWall({ x: 62, y: 108 }, [wall], 10);
    assert.deepEqual(hit, { point: { x: 62, y: 100 }, wall });

    const opening = wallOpeningFromDrag(
      wall,
      hit!.point,
      { x: 137, y: 112 },
      20
    );
    assert.equal(opening.wallId, wall.id);
    assert.equal(opening.width, 80);
    assert.deepEqual(opening.at, { x: 102, y: 100 });
    assert.deepEqual(wallOpeningSpan(wall, opening), [
      { x: 62, y: 100 },
      { x: 142, y: 100 },
    ]);
  });

  test("rejects self-crossing region outlines", () => {
    assert.equal(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]),
      false
    );
    assert.equal(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 25, y: 100 },
        { x: 75, y: 100 },
      ]),
      true
    );
  });

  test("keeps a shortened editor label inside a concave area", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ];
    const placement = fitEditorLabel(
      polygon,
      "thirty individual chairs",
      10,
      { x: 43, y: 43 }
    );
    assert.ok(placement);
    assert.notEqual(placement.text, "thirty individual chairs");
    assert.ok(placement.point.x <= 30 || placement.point.y <= 30);
  });
});
