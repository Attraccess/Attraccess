import { randomInt } from 'crypto';

/** Colours a WS2812 ring can show apart reliably. Orange and cyan are left out on purpose. */
export const LED_PATTERN_COLORS = ['red', 'green', 'blue', 'yellow', 'magenta', 'white'] as const;
export type LedPatternColor = (typeof LED_PATTERN_COLORS)[number];
export type LedPattern = LedPatternColor[];

export const LED_PATTERN_SEGMENTS = 4;

/**
 * The ring may be mounted in any rotation or mirrored, so patterns that only differ by rotation or
 * mirroring count as the same one. That leaves 120 distinct patterns.
 */
export function canonicalLedPattern(pattern: readonly string[]): string {
  const variants: string[] = [];
  for (const sequence of [pattern, [...pattern].reverse()]) {
    for (let shift = 0; shift < sequence.length; shift++) {
      variants.push([...sequence.slice(shift), ...sequence.slice(0, shift)].join(','));
    }
  }
  return variants.sort()[0];
}

export function isValidLedPattern(pattern: unknown): pattern is LedPattern {
  if (!Array.isArray(pattern) || pattern.length !== LED_PATTERN_SEGMENTS) return false;
  if (!pattern.every((color) => (LED_PATTERN_COLORS as readonly string[]).includes(color))) return false;
  // Neighbours must differ, the last segment is next to the first one.
  return pattern.every((color, index) => color !== pattern[(index + 1) % pattern.length]);
}

export function sameLedPattern(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

/** Every distinct pattern, one representative per rotation/mirror class, with its canonical key. */
function allCanonicalPatterns(): { key: string; pattern: LedPattern }[] {
  const seen = new Map<string, LedPattern>();
  const walk = (current: LedPatternColor[]) => {
    if (current.length === LED_PATTERN_SEGMENTS) {
      if (isValidLedPattern(current)) seen.set(canonicalLedPattern(current), [...current]);
      return;
    }
    for (const color of LED_PATTERN_COLORS) walk([...current, color]);
  };
  walk([]);
  return [...seen].map(([key, pattern]) => ({ key, pattern }));
}

// Computed once: a pick runs on every request and rotation of a waiting Lite reader.
const CANONICAL_PATTERNS = allCanonicalPatterns();

export const LED_PATTERN_COUNT = CANONICAL_PATTERNS.length;

/**
 * Picks a random pattern that is not equivalent to any in `taken` (canonical keys), or null when
 * all of them are in use. Rotation and mirroring of the pick is randomised so the ring is not
 * biased towards one orientation.
 */
export function pickLedPattern(taken: { has(key: string): boolean }): LedPattern | null {
  const free = CANONICAL_PATTERNS.filter((entry) => !taken.has(entry.key));
  if (free.length === 0) return null;
  const pick = [...free[randomInt(free.length)].pattern];
  if (randomInt(2) === 1) pick.reverse();
  const shift = randomInt(LED_PATTERN_SEGMENTS);
  return [...pick.slice(shift), ...pick.slice(0, shift)];
}
