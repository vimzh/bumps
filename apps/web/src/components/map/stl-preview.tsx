"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  BRAILLE_MM,
  compositeSize,
  textBrailleSize,
  type Point,
  type TactileDesign,
} from "@bumps/floor-model";

// "Better view" palette: semantic colors per element type so a sighted
// reviewer can read the plate at a glance. The print itself is monochrome.
const REVIEW_COLORS = {
  area: new THREE.Color("#d9a441"),
  base: new THREE.Color("#d6d3d1"),
  braille: new THREE.Color("#2563eb"),
  line: new THREE.Color("#44403c"),
  symbol: new THREE.Color("#c2703e"),
};
const PLAIN = new THREE.Color(0xdedad2);

function distToSegment(px: number, py: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / lengthSq));
  return Math.hypot(px - (a.x + t * abx), py - (a.y + t * aby));
}

function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > py !== b.y > py &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// Classify every vertex by which design element it belongs to. Runs on the
// raw STL coordinates (x right, y up = plate height - design y, z relief).
export function buildReviewColors(
  geometry: THREE.BufferGeometry,
  design: TactileDesign
): THREE.BufferAttribute {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const plateH = compositeSize(design).heightMm;
  const baseTop = design.plate.baseMm + 0.02;

  const lines = design.elements.filter((e) => e.kind === "line");
  const areas = design.elements.filter((e) => e.kind === "area");
  const symbols = design.elements.filter((e) => e.kind === "symbol");
  const brailleRuns = design.elements
    .filter((e) => e.kind === "braille")
    .map((e) => ({
      at: e.at,
      size: e.kind === "braille" ? textBrailleSize(e.key) : { heightMm: 8, widthMm: 16 },
    }));

  for (let i = 0; i < positions.count; i += 3) {
    const triangleSize = Math.min(3, positions.count - i);
    let x = 0;
    let designY = 0;
    let maxZ = -Infinity;
    let maxEdge = 0;
    for (let vertex = 0; vertex < triangleSize; vertex++) {
      x += positions.getX(i + vertex);
      designY += plateH - positions.getY(i + vertex);
      maxZ = Math.max(maxZ, positions.getZ(i + vertex));
      for (let other = 0; other < vertex; other++) {
        maxEdge = Math.max(
          maxEdge,
          Math.hypot(
            positions.getX(i + vertex) - positions.getX(i + other),
            positions.getY(i + vertex) - positions.getY(i + other),
            positions.getZ(i + vertex) - positions.getZ(i + other)
          )
        );
      }
    }
    x /= triangleSize;
    designY /= triangleSize;
    let color = REVIEW_COLORS.base;
    if (maxZ > baseTop) {
      const nearBraille =
        maxEdge <= BRAILLE_MM.dotDiameter * 2 &&
        brailleRuns.some(
          ({ at, size }) =>
            x >= at.x - 2 &&
            x <= at.x + size.widthMm + 2 &&
            designY >= at.y - 2 &&
            designY <= at.y + size.heightMm + 2
        );
      if (nearBraille) {
        color = REVIEW_COLORS.braille;
      } else if (
        symbols.some(
          (s) =>
            s.kind === "symbol" &&
            Math.hypot(x - s.at.x, designY - s.at.y) <= s.sizeMm / 2 + 1.5
        )
      ) {
        color = REVIEW_COLORS.symbol;
      } else if (
        lines.some(
          (l) =>
            l.kind === "line" &&
            l.points.some((p, idx) =>
              idx < l.points.length - 1
                ? distToSegment(x, designY, p, l.points[idx + 1]!) <=
                  l.widthMm / 2 + 0.4
                : false
            )
        )
      ) {
        color = REVIEW_COLORS.line;
      } else if (
        areas.some(
          (a) => a.kind === "area" && pointInPolygon(x, designY, a.polygon)
        )
      ) {
        color = REVIEW_COLORS.area;
      }
    }
    // STL triangles are non-indexed. One color per face prevents WebGL from
    // interpolating unrelated semantic colors into a gradient.
    for (let vertex = 0; vertex < triangleSize; vertex++) {
      colors[3 * (i + vertex)] = color.r;
      colors[3 * (i + vertex) + 1] = color.g;
      colors[3 * (i + vertex) + 2] = color.b;
    }
  }
  return new THREE.BufferAttribute(colors, 3);
}

type StlPreviewProps = {
  betterView?: boolean;
  design?: TactileDesign | null;
  url: string;
};

export function StlPreview({ betterView = false, design, url }: StlPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  // Latest betterView for the async STL load callback; synced in an
  // effect because refs must not be written during render.
  const betterRef = useRef(betterView);
  useEffect(() => {
    betterRef.current = betterView;
  }, [betterView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    camera.position.set(0, 230, 170);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(120, 250, 160);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-150, 120, -120);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const material = new THREE.MeshStandardMaterial({
      color: PLAIN,
      metalness: 0.05,
      roughness: 0.65,
    });
    const loader = new STLLoader();
    loader.load(url, (geometry) => {
      geometry.computeVertexNormals();
      if (design) {
        geometry.setAttribute("color", buildReviewColors(geometry, design));
      }
      // STL is z-up; lay the plate flat under a y-up camera.
      geometry.rotateX(-Math.PI / 2);
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox!.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      const mesh = new THREE.Mesh(geometry, material);
      meshRef.current = mesh;
      applyViewMode(mesh, betterRef.current);
      scene.add(mesh);
    });

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
        meshRef.current = null;
      }
      material.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [url, design]);

  useEffect(() => {
    if (meshRef.current) {
      applyViewMode(meshRef.current, betterView);
    }
  }, [betterView]);

  return <div className="h-full w-full" ref={containerRef} />;
}

function applyViewMode(mesh: THREE.Mesh, betterView: boolean) {
  const material = mesh.material as THREE.MeshStandardMaterial;
  const hasColors = mesh.geometry.getAttribute("color") !== undefined;
  material.vertexColors = betterView && hasColors;
  material.color.copy(material.vertexColors ? new THREE.Color(0xffffff) : PLAIN);
  material.needsUpdate = true;
}
