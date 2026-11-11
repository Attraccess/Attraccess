/** Total length of the union of [start, end) ranges, ignoring empty or inverted ranges. */
export function unionDurationMs(ranges: { start: number; end: number }[]): number {
  const sorted = ranges.filter((range) => range.end > range.start).sort((left, right) => left.start - right.start);
  let total = 0;
  let cursor: number | null = null;
  let currentEnd: number | null = null;

  for (const range of sorted) {
    if (cursor === null || currentEnd === null || range.start >= currentEnd) {
      if (cursor !== null && currentEnd !== null) {
        total += currentEnd - cursor;
      }
      cursor = range.start;
      currentEnd = range.end;
    } else if (range.end > currentEnd) {
      currentEnd = range.end;
    }
  }

  if (cursor !== null && currentEnd !== null) {
    total += currentEnd - cursor;
  }
  return total;
}
