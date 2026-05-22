// Silkscreen helpers Attraccess keyhole logo wordmark board-label and pin1 marker
// FEATURE: shared lib parts — consistent silk identity across Attractap V2 boards

export interface AttraccessLogoProps {
  readonly pcbX: number;
  readonly pcbY: number;
  readonly scale?: number;
  readonly layer?: 'top' | 'bottom';
  readonly strokeWidth?: string;
}

export interface BoardLabelProps {
  readonly pcbX: number;
  readonly pcbY: number;
  readonly name: string;
  readonly rev: string;
  readonly layer?: 'top' | 'bottom';
}

export interface Pin1MarkerProps {
  readonly pcbX: number;
  readonly pcbY: number;
  readonly layer?: 'top' | 'bottom';
}

const arc = (cx: number, cy: number, r: number, fromDeg: number, toDeg: number, steps: number) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = fromDeg + ((toDeg - fromDeg) * i) / steps;
    const rad = (t * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  return pts;
};

export const AttraccessLogo = ({
  pcbX,
  pcbY,
  scale = 1,
  layer = 'top',
  strokeWidth = '0.2mm',
}: AttraccessLogoProps) => {
  const r = 1.4 * scale;
  const shoulderY = 1.0 * scale;
  const shoulderX = 0.55 * scale;
  const baseY = 3.4 * scale;
  const baseX = 1.15 * scale;
  const headArc = arc(pcbX, pcbY, r, 30, 150, 12);
  return (
    <>
      <silkscreenpath
        layer={layer}
        route={[
          ...headArc,
          { x: pcbX - shoulderX, y: pcbY + shoulderY },
          { x: pcbX - baseX, y: pcbY + baseY },
          { x: pcbX + baseX, y: pcbY + baseY },
          { x: pcbX + shoulderX, y: pcbY + shoulderY },
          headArc[0],
        ]}
        strokeWidth={strokeWidth}
      />
    </>
  );
};

export const BoardLabel = ({ pcbX, pcbY, name, rev, layer = 'top' }: BoardLabelProps) => (
  <>
    <silkscreentext text="ATTRACCESS" pcbX={pcbX} pcbY={pcbY + 1.4} fontSize="1.4mm" layer={layer} />
    <silkscreentext text={`${name} ${rev}`} pcbX={pcbX} pcbY={pcbY - 1.2} fontSize="1.0mm" layer={layer} />
  </>
);

export const Pin1Marker = ({ pcbX, pcbY, layer = 'top' }: Pin1MarkerProps) => (
  <>
    <silkscreencircle pcbX={pcbX} pcbY={pcbY} radius={0.4} strokeWidth="0.2mm" layer={layer} />
    <silkscreentext text="1" pcbX={pcbX + 1.2} pcbY={pcbY} fontSize="0.9mm" layer={layer} />
  </>
);
