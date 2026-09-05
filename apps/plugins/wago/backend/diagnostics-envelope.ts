/** Diagnostic consumer projection of the ATT-979 envelope; not a producer or flow protocol parser. */
export const DIAGNOSTIC_CATEGORIES = [
  'heartbeat',
  'state',
  'measurements',
  'faults',
  'acknowledgements',
  'configuration/reported',
];
export const MILLI_UNITS = ['milliampere', 'millivolt', 'milliwatt', 'milliwatt-hour', 'millipercent'];
// 73995720 permits exact whole units when milli encoding overflows. Preserve the transmitted unit/value.
export const CANONICAL_UNITS = [...MILLI_UNITS, 'ampere', 'volt', 'watt', 'watt-hour', 'percent'];
export function sourceTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || Number(match[4] ?? 0) > 23 || Number(match[5] ?? 0) > 59) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const offset =
    match[2] === 'Z' ? 0 : (match[3] === '+' ? 1 : -1) * (Number(match[4]) * 60 + Number(match[5])) * 60_000;
  return new Date(time + offset).toISOString().slice(0, 19) === match[1] ? time : null;
}
export interface DiagnosticStream {
  activeStream?: string;
  lastSourceTime: number;
  retiredStreams: string[];
  watermarks: Record<string, { sequence: number; timestamp: number }>;
  sequenceGaps: number;
  trackingExhausted: boolean;
}
export function emptyStream(): DiagnosticStream {
  return { lastSourceTime: 0, retiredStreams: [], watermarks: {}, sequenceGaps: 0, trackingExhausted: false };
}
export function canonicalEnvelope(data: Record<string, unknown>, category: string) {
  return 'timestamp' in data || 'streamId' in data || (category !== 'heartbeat' && 'sequence' in data);
}
export function validEnvelope(data: Record<string, unknown>, now: number): boolean {
  const time = sourceTime(data.timestamp);
  return (
    time !== null &&
    time <= now &&
    typeof data.streamId === 'string' &&
    data.streamId.trim().length > 0 &&
    data.streamId.length <= 128 &&
    Number.isSafeInteger(data.sequence) &&
    (data.sequence as number) >= 1
  );
}
/** Call only after envelope and category payload validation. Never updates watermarks on rejection. */
export function admitEnvelope(
  state: DiagnosticStream,
  data: Record<string, unknown>,
  category: string,
  now: number,
): 'accepted' | 'restart' | 'rejected' {
  const stream = data.streamId as string;
  const timestamp = sourceTime(data.timestamp) as number;
  const sequence = data.sequence as number;
  if (state.retiredStreams.includes(stream) || state.trackingExhausted) return 'rejected';
  const restart = state.activeStream !== stream;
  if (restart) {
    if (
      !(category === 'heartbeat' || (category === 'state' && data.connected === true)) ||
      now - timestamp > 90_000 ||
      timestamp < state.lastSourceTime
    )
      return 'rejected';
    if (state.retiredStreams.length >= 16) {
      state.trackingExhausted = true;
      return 'rejected';
    }
  }
  const previous = restart ? undefined : state.watermarks[category];
  if (previous && (sequence <= previous.sequence || timestamp < previous.timestamp)) return 'rejected';
  if (restart) {
    if (state.activeStream) state.retiredStreams.push(state.activeStream);
    state.activeStream = stream;
    state.watermarks = {};
  }
  state.sequenceGaps = Math.min(
    Number.MAX_SAFE_INTEGER,
    state.sequenceGaps + Math.max(0, sequence - (previous?.sequence ?? 0) - 1),
  );
  state.watermarks[category] = { sequence, timestamp };
  state.lastSourceTime = Math.max(state.lastSourceTime, timestamp);
  return restart ? 'restart' : 'accepted';
}
