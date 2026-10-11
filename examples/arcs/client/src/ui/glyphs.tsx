import type { SVGProps } from "react";

interface GlyphProps extends SVGProps<SVGGElement> {
  color: string;
  damaged?: boolean;
  size?: number;
}

export function ShipGlyph({ color, damaged, size = 1, ...rest }: GlyphProps) {
  return (
    <g
      {...rest}
      transform={`${rest.transform ?? ""} scale(${size}) rotate(${damaged ? 90 : 0})`}
    >
      <path
        d="M0,-11 C3,-7 4.5,-2 4.5,4 L7,9 L2.4,7.4 L0,10 L-2.4,7.4 L-7,9 L-4.5,4 C-4.5,-2 -3,-7 0,-11 Z"
        fill={damaged ? "#1b1d24" : color}
        stroke={damaged ? color : "#0b0d12"}
        strokeWidth={damaged ? 1.8 : 1.2}
        strokeLinejoin="round"
      />
      {!damaged && <circle cy={-2.5} r={1.6} fill="#0b0d12" opacity={0.55} />}
    </g>
  );
}

export function CityGlyph({ color, damaged, size = 1, ...rest }: GlyphProps) {
  return (
    <g {...rest} transform={`${rest.transform ?? ""} scale(${size})`}>
      <path
        d="M-9,10 L-9,-1 L-4,-6 L-4,-11 L1,-11 L1,-6 L4,-9 L9,-4 L9,10 Z"
        fill={damaged ? "#1b1d24" : color}
        stroke={damaged ? color : "#0b0d12"}
        strokeWidth={damaged ? 2 : 1.4}
        strokeLinejoin="round"
      />
      {!damaged && (
        <g fill="#0b0d12" opacity={0.5}>
          <rect x={-6} y={1} width={3} height={3} />
          <rect x={0} y={1} width={3} height={3} />
          <rect x={4.5} y={-2} width={2.5} height={3} />
        </g>
      )}
    </g>
  );
}

export function StarportGlyph({
  color,
  damaged,
  size = 1,
  ...rest
}: GlyphProps) {
  return (
    <g {...rest} transform={`${rest.transform ?? ""} scale(${size})`}>
      <circle
        r={10}
        fill={damaged ? "#1b1d24" : color}
        stroke={damaged ? color : "#0b0d12"}
        strokeWidth={damaged ? 2 : 1.4}
      />
      <circle
        r={4.2}
        fill="none"
        stroke={damaged ? color : "#0b0d12"}
        strokeWidth={2}
        opacity={0.75}
      />
      <path
        d="M0,-10 L0,-4 M0,4 L0,10 M-10,0 L-4,0 M4,0 L10,0"
        stroke={damaged ? color : "#0b0d12"}
        strokeWidth={1.6}
        opacity={0.75}
      />
    </g>
  );
}

export function AgentGlyph({ color, size = 1, ...rest }: GlyphProps) {
  return (
    <g {...rest} transform={`${rest.transform ?? ""} scale(${size})`}>
      <circle cy={-6} r={4} fill={color} stroke="#0b0d12" strokeWidth={1.2} />
      <path
        d="M-6,9 C-6,1 -3,-1 0,-1 C3,-1 6,1 6,9 Z"
        fill={color}
        stroke="#0b0d12"
        strokeWidth={1.2}
      />
    </g>
  );
}

export function PieceGlyph({ kind, ...props }: GlyphProps & { kind: string }) {
  if (kind === "city") return <CityGlyph {...props} />;
  if (kind === "starport") return <StarportGlyph {...props} />;
  if (kind === "agent") return <AgentGlyph {...props} />;
  return <ShipGlyph {...props} />;
}

export function PieceIcon({
  kind,
  color,
  damaged,
  size = 22,
}: {
  kind: string;
  color: string;
  damaged?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      aria-hidden
      className="piece-icon"
    >
      <PieceGlyph kind={kind} color={color} damaged={damaged} />
    </svg>
  );
}
