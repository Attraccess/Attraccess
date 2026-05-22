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

export const AttraccessLogo = ({
  pcbX,
  pcbY,
  scale = 1,
  layer = 'top',
  strokeWidth = '0.2mm',
}: AttraccessLogoProps) => {
  const headR = 1.3 * scale;
  const neckY = -1.3 * scale;
  const neckX = 0.45 * scale;
  const baseY = -3.6 * scale;
  const baseX = 0.85 * scale;
  return (
    <>
      <silkscreencircle pcbX={pcbX} pcbY={pcbY} radius={headR} strokeWidth={strokeWidth} layer={layer} />
      <silkscreenpath
        layer={layer}
        route={[
          { x: pcbX - neckX, y: pcbY + neckY },
          { x: pcbX - baseX, y: pcbY + baseY },
          { x: pcbX + baseX, y: pcbY + baseY },
          { x: pcbX + neckX, y: pcbY + neckY },
          { x: pcbX - neckX, y: pcbY + neckY },
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
