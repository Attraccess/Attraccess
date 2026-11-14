/**
 * Exact equal split of one shared segment's quantity (meter consumption in 1e-9 units, or operating time in
 * milliseconds) among the sessions active in it. Nothing is rounded until credits are charged, and then once per
 * segment: the segment's credit total is the exact sum of every participant's share times their own rate, rounded
 * half-up, and the whole credits are handed out by the largest-remainder method. The charged shares therefore always
 * add up to the segment total.
 */
export interface ShareParticipant {
  usageId: number;
  /** Credits per unit captured by the participant's session. Per whole unit, or per minute for operating time. */
  rate: number;
  /** Start of the participant's session, for tie-breaking: the earlier-started session wins a tie. */
  startedAt: number;
}

export interface SegmentSplit {
  /** The segment's exact credit total, rounded half-up once. */
  totalCredits: number;
  /** Whole credits charged to each participant. They add up to `totalCredits`. */
  credits: Map<number, number>;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** Round half-up a non-negative fraction. */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * TWO + denominator) / (denominator * TWO);
}

function safeCredits(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Shared charge exceeds the supported billing range');
  return Number(value);
}

export function byStartThenId(
  left: Pick<ShareParticipant, 'startedAt' | 'usageId'>,
  right: Pick<ShareParticipant, 'startedAt' | 'usageId'>,
): number {
  return left.startedAt - right.startedAt || left.usageId - right.usageId;
}

/**
 * @param quantity the segment's whole quantity
 * @param unitsPerRate how many quantity units one rate unit covers (1e9 for meters, 60 000 ms for a minute)
 */
export function splitSegment(quantity: bigint, unitsPerRate: bigint, participants: ShareParticipant[]): SegmentSplit {
  if (participants.length === 0) throw new RangeError('A segment needs at least one participant');
  if (quantity < ZERO) throw new RangeError('A segment cannot have a negative quantity');
  const count = BigInt(participants.length);
  const denominator = count * unitsPerRate;
  const entries = participants.map((participant) => {
    if (!Number.isSafeInteger(participant.rate) || participant.rate < 0) throw new RangeError('Invalid rate');
    const numerator = quantity * BigInt(participant.rate);
    return { participant, floor: numerator / denominator, remainder: numerator % denominator, numerator };
  });
  const total = roundHalfUp(
    entries.reduce((sum, entry) => sum + entry.numerator, ZERO),
    denominator,
  );
  let leftover = total - entries.reduce((sum, entry) => sum + entry.floor, ZERO);
  const ranked = [...entries].sort((left, right) =>
    left.remainder === right.remainder
      ? byStartThenId(left.participant, right.participant)
      : left.remainder > right.remainder
        ? -1
        : 1,
  );
  const credits = new Map<number, number>();
  for (const entry of ranked) {
    const extra = leftover > ZERO ? ONE : ZERO;
    leftover -= extra;
    credits.set(entry.participant.usageId, safeCredits(entry.floor + extra));
  }
  return { totalCredits: safeCredits(total), credits };
}

/** An exact sum of fractions, for adding up shares without rounding them first. */
export class ExactSum {
  private numerator = ZERO;

  private denominator = ONE;

  add(numerator: bigint, denominator: bigint): void {
    this.numerator = this.numerator * denominator + numerator * this.denominator;
    this.denominator *= denominator;
    const divisor = gcd(this.numerator, this.denominator);
    if (divisor > ONE) {
      this.numerator /= divisor;
      this.denominator /= divisor;
    }
  }

  /** The sum rounded half-up to a whole number of units. */
  rounded(): bigint {
    return roundHalfUp(this.numerator, this.denominator);
  }
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < ZERO ? -left : left;
  let b = right;
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}
