import {
  BRAILLE_MM,
  textDotCenters,
  type TactileDesign,
  type TactileSymbol,
} from "@bumps/floor-model";

// 2D preview of the tactile design, drawn 1 unit = 1 mm. Shapes here are
// preview approximations; exact printable geometry is the STL generator's job.

function SymbolShape({ symbol }: { symbol: TactileSymbol }) {
  const s = symbol.sizeMm;
  const half = s / 2;
  switch (symbol.symbol) {
    case "door":
      return <rect className="fill-(--color-brand)" height={2} width={s} x={-half} y={-1} />;
    case "stairs":
      return (
        <g className="fill-foreground">
          <rect height={1.2} width={s} x={-half} y={-2.4} />
          <rect height={1.2} width={s * 0.75} x={-s * 0.375} y={-0.6} />
          <rect height={1.2} width={s * 0.5} x={-s * 0.25} y={1.2} />
        </g>
      );
    case "elevator":
      return (
        <g>
          <rect className="fill-none stroke-foreground" height={s} strokeWidth={0.8} width={s} x={-half} y={-half} />
          <circle className="fill-foreground" r={0.9} />
        </g>
      );
    case "entrance":
      return <path className="fill-foreground" d={`M 0 ${-half} L ${half} ${half} L ${-half} ${half} Z`} />;
    case "exit":
      return (
        <g className="stroke-foreground" strokeWidth={0.9}>
          <rect className="fill-none" height={s} width={s} x={-half} y={-half} />
          <line x1={-half} x2={half} y1={-half} y2={half} />
        </g>
      );
    case "restroom":
      return (
        <g className="fill-foreground">
          <rect className="fill-none stroke-foreground" height={s} strokeWidth={0.8} width={s} x={-half} y={-half} />
          <circle cx={-1.2} cy={-1.2} r={0.6} />
          <circle cx={1.2} cy={-1.2} r={0.6} />
          <circle cx={-1.2} cy={1.2} r={0.6} />
          <circle cx={1.2} cy={1.2} r={0.6} />
        </g>
      );
    case "ramp":
      return <path className="fill-foreground" d={`M ${-half} ${half} L ${half} ${half} L ${half} ${-half} Z`} />;
    case "you-are-here":
      return (
        <g>
          <circle className="fill-none stroke-(--color-brand)" r={half} strokeWidth={1} />
          <circle className="fill-(--color-brand)" r={1.4} />
        </g>
      );
    case "reception":
      return (
        <g>
          <rect className="fill-foreground" height={1.4} width={s} x={-half} y={0.6} />
          <circle className="fill-foreground" cy={-1.2} r={1.1} />
        </g>
      );
    case "seating":
      return (
        <g className="fill-foreground">
          <rect height={1.2} width={s} x={-half} y={1} />
          <rect height={3.4} width={1.2} x={-half} y={-2.4} />
        </g>
      );
    case "info-point":
      return (
        <g>
          <circle className="fill-none stroke-foreground" r={half} strokeWidth={0.8} />
          <circle className="fill-foreground" cy={-1.4} r={0.7} />
          <rect className="fill-foreground" height={2.6} width={1.1} x={-0.55} y={-0.4} />
        </g>
      );
  }
}

type TactileViewerProps = {
  design: TactileDesign;
};

export function TactileViewer({ design }: TactileViewerProps) {
  const { heightMm, marginMm, widthMm } = design.plate;
  return (
    <svg
      className="h-full w-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${widthMm} ${heightMm}`}
    >
      <rect className="fill-card stroke-border" height={heightMm} strokeWidth={0.5} width={widthMm} />
      <rect
        className="fill-none stroke-border"
        height={heightMm - 2 * marginMm}
        strokeDasharray="2 2"
        strokeWidth={0.3}
        width={widthMm - 2 * marginMm}
        x={marginMm}
        y={marginMm}
      />
      {design.elements.map((element) => {
        if (element.kind === "line") {
          return (
            <polyline
              className="stroke-foreground"
              fill="none"
              key={element.id}
              points={element.points.map((p) => `${p.x},${p.y}`).join(" ")}
              strokeLinecap="square"
              strokeWidth={element.widthMm}
            />
          );
        }
        if (element.kind === "area") {
          return (
            <polygon
              className="fill-muted-foreground/30"
              key={element.id}
              points={element.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
            />
          );
        }
        if (element.kind === "symbol") {
          return (
            <g
              key={element.id}
              transform={`translate(${element.at.x} ${element.at.y}) rotate(${element.rotation})`}
            >
              <SymbolShape symbol={element} />
            </g>
          );
        }
        return (
          <g className="fill-foreground" key={element.id}>
            {textDotCenters(element.key, element.at).map((dot, index) => (
              <circle
                cx={dot.x}
                cy={dot.y}
                key={index}
                r={BRAILLE_MM.dotDiameter / 2}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
