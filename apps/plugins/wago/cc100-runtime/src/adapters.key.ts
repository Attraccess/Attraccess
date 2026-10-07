import type { Point } from './adapters.point';

export function key(point: Point): string {
  return `${point.hardwareProfile}:${point.channel}`;
}
