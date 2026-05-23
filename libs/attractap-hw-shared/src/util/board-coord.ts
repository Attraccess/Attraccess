// Coordinate helper bottom-left origin to tscircuit board centre origin
// FEATURE: shared lib util — bridges mech-envelope.md coords with tscircuit

export interface MechCoordInput {
  readonly x: number;
  readonly y: number;
  readonly boardW: number;
  readonly boardH: number;
}

export interface PcbCoord {
  readonly pcbX: number;
  readonly pcbY: number;
}

export function boardCoord({ x, y, boardW, boardH }: MechCoordInput): PcbCoord {
  return { pcbX: x - boardW / 2, pcbY: y - boardH / 2 };
}
