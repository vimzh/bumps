import type { Feature } from "@bumps/floor-model";

// Cartographic feature symbols drawn as diagram linework — the same symbol
// language as the tactile plate, not UI chips. Geometry is authored on a
// 6-unit design grid and scaled; color comes from the parent's currentColor.

type FeatureGlyphProps = {
  kind: Feature["kind"];
  rotation?: number;
  size: number;
};

function Shape({ kind }: { kind: Feature["kind"] }) {
  switch (kind) {
    case "stairs":
      return (
        <g className="fill-current">
          <rect height={1.2} width={6} x={-3} y={-2.4} />
          <rect height={1.2} width={4.5} x={-2.25} y={-0.6} />
          <rect height={1.2} width={3} x={-1.5} y={1.2} />
        </g>
      );
    case "elevator":
      return (
        <g>
          <rect className="fill-none stroke-current" height={6} strokeWidth={0.8} width={6} x={-3} y={-3} />
          <circle className="fill-current" r={0.9} />
        </g>
      );
    case "entrance":
      return <path className="fill-current" d="M 0 -3 L 3 3 L -3 3 Z" />;
    case "exit":
      return (
        <g className="stroke-current" strokeWidth={0.9}>
          <rect className="fill-none" height={6} width={6} x={-3} y={-3} />
          <line x1={-3} x2={3} y1={-3} y2={3} />
        </g>
      );
    case "restroom":
      return (
        <g className="fill-current">
          <rect className="fill-none stroke-current" height={6} strokeWidth={0.8} width={6} x={-3} y={-3} />
          <circle cx={-1.2} cy={-1.2} r={0.6} />
          <circle cx={1.2} cy={-1.2} r={0.6} />
          <circle cx={-1.2} cy={1.2} r={0.6} />
          <circle cx={1.2} cy={1.2} r={0.6} />
        </g>
      );
    case "ramp":
      return <path className="fill-current" d="M -3 3 L 3 3 L 3 -3 Z" />;
    case "you-are-here":
      return (
        <g>
          <circle className="fill-none stroke-current" r={3} strokeWidth={1} />
          <circle className="fill-current" r={1.4} />
        </g>
      );
    case "reception":
      return (
        <g className="fill-current">
          <rect height={1.4} width={6} x={-3} y={0.6} />
          <circle cy={-1.2} r={1.1} />
        </g>
      );
    case "seating":
      return (
        <g className="fill-current">
          <rect height={1.2} width={6} x={-3} y={1} />
          <rect height={3.4} width={1.2} x={-3} y={-2.4} />
        </g>
      );
    case "info-point":
      return (
        <g>
          <circle className="fill-none stroke-current" r={3} strokeWidth={0.8} />
          <circle className="fill-current" cy={-1.4} r={0.7} />
          <rect className="fill-current" height={2.6} width={1.1} x={-0.55} y={-0.4} />
        </g>
      );
  }
}

export function FeatureGlyph({ kind, rotation = 0, size }: FeatureGlyphProps) {
  return (
    <g transform={`rotate(${rotation}) scale(${size / 6})`}>
      <Shape kind={kind} />
    </g>
  );
}
