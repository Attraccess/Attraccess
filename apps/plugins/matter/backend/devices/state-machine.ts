// The state transition rules as pure functions over one state row. No I/O, so every rule is unit-testable.
//
// Terms: a *request* is what Attraccess asked for; *accepted* only means the sidecar took the command and is never
// physical completion; *reported* is what the device told us. `confirmed` is derived: a report equal to the
// requested value that arrived after the request. A timeout of a physical command is `uncertain` and is never
// retried automatically.
import type { CommandState, MatterEndpointState, StateQuality, StateSource } from './entities';

export const DEFAULT_STALE_AFTER_MS = 600_000;

export type Report = {
  value: unknown;
  observedAt: string;
  source: StateSource;
  fault?: { code: string; message: string };
  /** The subscription's maximum interval; staleness becomes twice that. */
  maxIntervalSec?: number;
};

export type OutcomeInput = {
  outcome: Exclude<CommandState, 'none'>;
  acceptedAt: string | null;
  reportedAt: string | null;
};

export function emptyState(endpointRef: string, stateKey: string, id: string, now: string): MatterEndpointState {
  return {
    id,
    endpointRef,
    stateKey,
    reportedValue: null,
    reportedAt: null,
    receivedAt: null,
    source: null,
    quality: null,
    staleAfterMs: DEFAULT_STALE_AFTER_MS,
    requestedValue: null,
    requestedAt: null,
    requestedBy: null,
    requestId: null,
    correlationId: null,
    commandState: 'none',
    acceptedAt: null,
    commandReportedAt: null,
    externalChangeAt: null,
    externalChangeValue: null,
    faultCode: null,
    faultMessage: null,
    faultAt: null,
    updatedAt: now,
  };
}

/** JSON with sorted object keys, so equal values compare equal however they were produced. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

const time = (iso: string | null) => (iso === null ? Number.NaN : Date.parse(iso));

/** A command that has been sent and whose result is not known yet. */
const isPending = (state: CommandState) => state === 'requested' || state === 'accepted';

export function applyRequest(
  row: MatterEndpointState,
  request: {
    value: unknown;
    requestedAt: string;
    requestedBy: number | null;
    requestId: string;
    correlationId: string | null;
  },
): MatterEndpointState {
  return {
    ...row,
    requestedValue: canonicalJson(request.value),
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy,
    requestId: request.requestId,
    correlationId: request.correlationId,
    commandState: 'requested',
    acceptedAt: null,
    commandReportedAt: null,
    updatedAt: request.requestedAt,
  };
}

const OUTCOME_RANK: Record<Exclude<CommandState, 'none'>, number> = {
  requested: 0,
  accepted: 1,
  uncertain: 2,
  reported: 4,
  failed: 4,
};

/** True when `next` may replace `current`: outcomes only move forward, and reported/failed are final. */
export function outcomeAdvances(current: string | null, next: Exclude<CommandState, 'none'>): boolean {
  if (current === null || !(current in OUTCOME_RANK)) return true;
  const from = OUTCOME_RANK[current as Exclude<CommandState, 'none'>];
  const to = OUTCOME_RANK[next];
  return to > from || (to === from && to < 4 && next !== current);
}

/** Applies a command outcome to the state row of the key the command targeted, if that command is still current. */
export function applyOutcome(
  row: MatterEndpointState,
  requestId: string,
  input: OutcomeInput,
  now: string,
): MatterEndpointState {
  if (row.requestId !== requestId || !outcomeAdvances(row.commandState, input.outcome)) return row;
  return {
    ...row,
    commandState: input.outcome,
    acceptedAt: input.acceptedAt ?? row.acceptedAt,
    commandReportedAt: input.reportedAt ?? row.commandReportedAt,
    updatedAt: now,
  };
}

/** The outcome of a physical command that timed out: unknown, and never retried by this code. */
export const TIMEOUT_OUTCOME: OutcomeInput['outcome'] = 'uncertain';

/**
 * Applies a device report. Returns `null` when it is ignored: older than what is stored (out-of-order delivery) or an
 * exact duplicate.
 */
export function applyReport(row: MatterEndpointState, report: Report, receivedAt: string): MatterEndpointState | null {
  const value = canonicalJson(report.value);
  if (row.reportedAt !== null) {
    const stored = time(row.reportedAt);
    const observed = time(report.observedAt);
    if (observed < stored) return null;
    if (observed === stored && value === row.reportedValue && !report.fault === (row.faultCode === null)) {
      return null;
    }
  }

  const next: MatterEndpointState = {
    ...row,
    reportedValue: value,
    reportedAt: report.observedAt,
    receivedAt,
    source: report.source,
    quality: (report.fault ? 'fault' : 'good') satisfies StateQuality,
    faultCode: report.fault?.code ?? null,
    faultMessage: report.fault?.message ?? null,
    faultAt: report.fault ? report.observedAt : null,
    staleAfterMs: report.maxIntervalSec ? report.maxIntervalSec * 2_000 : row.staleAfterMs,
    updatedAt: receivedAt,
  };

  const matchesRequest =
    row.requestedValue !== null &&
    row.requestedAt !== null &&
    time(report.observedAt) >= time(row.requestedAt) &&
    value === row.requestedValue;
  if (matchesRequest) {
    // A report that matches the request resolves a pending or uncertain command; a failed one stays failed.
    if (row.commandState === 'requested' || row.commandState === 'accepted' || row.commandState === 'uncertain') {
      next.commandState = 'reported';
      next.commandReportedAt = report.observedAt;
    }
  } else if (!isPending(row.commandState) && row.reportedValue !== null && row.reportedValue !== value) {
    next.externalChangeAt = report.observedAt;
    next.externalChangeValue = value;
  }
  return next;
}

export type StateEntryView = {
  stateKey: string;
  reported: {
    value: unknown;
    observedAt: string | null;
    receivedAt: string | null;
    source: StateSource | null;
    quality: StateQuality | null;
  };
  freshness: 'fresh' | 'stale' | 'unknown';
  staleAfterMs: number;
  requested: {
    value: unknown;
    requestedAt: string | null;
    requestedBy: number | null;
    requestId: string | null;
    correlationId: string | null;
  };
  command: { state: CommandState; acceptedAt: string | null; reportedAt: string | null };
  /** True only when a report equal to the requested value arrived after the request, for a command that did not fail. */
  confirmed: boolean;
  externalChange: { at: string; value: unknown } | null;
  fault: { code: string; message: string; at: string } | null;
  uncertainActuation: boolean;
};

const parse = (text: string | null): unknown => (text === null ? null : (JSON.parse(text) as unknown));

export function freshnessOf(row: MatterEndpointState, now: number): StateEntryView['freshness'] {
  if (row.reportedAt === null) return 'unknown';
  return now - Date.parse(row.reportedAt) > row.staleAfterMs ? 'stale' : 'fresh';
}

/** Freshness is computed here, at read time, from the observation time and `staleAfterMs`. */
export function toView(row: MatterEndpointState, now: number = Date.now()): StateEntryView {
  const confirmed =
    row.commandState !== 'failed' &&
    row.requestedValue !== null &&
    row.requestedAt !== null &&
    row.reportedAt !== null &&
    row.reportedValue === row.requestedValue &&
    Date.parse(row.reportedAt) >= Date.parse(row.requestedAt);
  return {
    stateKey: row.stateKey,
    reported: {
      value: parse(row.reportedValue),
      observedAt: row.reportedAt,
      receivedAt: row.receivedAt,
      source: row.source,
      quality: row.quality,
    },
    freshness: freshnessOf(row, now),
    staleAfterMs: row.staleAfterMs,
    requested: {
      value: parse(row.requestedValue),
      requestedAt: row.requestedAt,
      requestedBy: row.requestedBy,
      requestId: row.requestId,
      correlationId: row.correlationId,
    },
    command: { state: row.commandState, acceptedAt: row.acceptedAt, reportedAt: row.commandReportedAt },
    confirmed,
    externalChange: row.externalChangeAt ? { at: row.externalChangeAt, value: parse(row.externalChangeValue) } : null,
    fault:
      row.faultCode && row.faultAt ? { code: row.faultCode, message: row.faultMessage ?? '', at: row.faultAt } : null,
    uncertainActuation: row.commandState === 'uncertain',
  };
}
