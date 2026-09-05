import {
  admitEnvelope,
  canonicalEnvelope,
  DIAGNOSTIC_CATEGORIES,
  emptyStream,
  CANONICAL_UNITS,
  sourceTime,
  validEnvelope,
  type DiagnosticStream,
} from './diagnostics-envelope';
import { safeValidationSummaries } from './diagnostics-validation';
/** Process-local, allowlisted diagnostics. Never retain raw MQTT payloads or free-form device errors. */
export type Freshness = 'missing' | 'invalid' | 'future' | 'stale' | 'fresh';
export function freshness(timestamp: string | null | undefined, now = Date.now(), maxAge = 90_000): Freshness {
  if (!timestamp) return 'missing';
  const time = sourceTime(timestamp);
  if (time === null) return 'invalid';
  if (time > now) return 'future';
  return now - time > maxAge ? 'stale' : 'fresh';
}
export interface DiagnosticSample {
  kind: 'input' | 'output' | 'measurement';
  value: boolean | number;
  unit?: string;
  measurementKind?: 'live' | 'cumulative';
  sourceAt: string | null;
  streamId: string | null;
  sequence: number | null;
  receivedAt: string;
}
export interface DiagnosticAcknowledgement {
  id: string;
  status: 'accepted' | 'duplicate' | 'rejected' | 'dispatch-failed' | 'timeout';
  receivedAt: string;
}
interface RuntimeDiagnostics extends DiagnosticStream {
  touched: number;
  heartbeatAt?: string;
  legacyHeartbeatSequence?: number;
  connected?: boolean;
  hardwareAvailable?: boolean;
  revision?: number;
  contentHash?: string;
  stateSourceAt?: string;
  measurementAfter?: number;
  inputs: Record<string, DiagnosticSample>;
  outputs: Record<string, DiagnosticSample>;
  measurements: Record<string, DiagnosticSample>;
  cumulativeMeasurements: Record<string, DiagnosticSample>;
  rejection?: {
    revision: number;
    contentHash: string;
    receivedAt: string;
    errors: Array<{ path: string; code: string }>;
  };
  faults: Record<string, { code: string; receivedAt: string }>;
  acknowledgements: Record<string, DiagnosticAcknowledgement>;
  events: Array<{ kind: string; receivedAt: string }>;
}
const MAX_CONTROLLERS = 256;
const MAX_CHANNELS = 256;
const RETENTION_MS = 15 * 60_000;
const faultCodes = new Set([
  'measurement_read_failed',
  'device_write_failed',
  'feedback_mismatch',
  'feedback_read_failed',
]);
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32)
  );
}
export class WagoDiagnosticsStore {
  private readonly controllers = new Map<number, RuntimeDiagnostics>();
  private readonly commands = new Map<string, { controllerId: number; channelId: string; at: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  private prune() {
    const cutoff = this.now() - RETENTION_MS;
    for (const [id, state] of this.controllers) if (state.touched < cutoff) this.controllers.delete(id);
    for (const [id, command] of this.commands) if (command.at < cutoff) this.commands.delete(id);
  }
  read(id: number): RuntimeDiagnostics {
    this.prune();
    const state = this.controllers.get(id);
    const copy: RuntimeDiagnostics = state
      ? JSON.parse(JSON.stringify(state))
      : {
          touched: 0,
          inputs: {},
          outputs: {},
          measurements: {},
          cumulativeMeasurements: {},
          faults: {},
          acknowledgements: {},
          events: [],
          ...emptyStream(),
        };
    const cutoff = this.now() - RETENTION_MS;
    for (const field of [
      'inputs',
      'outputs',
      'measurements',
      'cumulativeMeasurements',
      'faults',
      'acknowledgements',
    ] as const) {
      copy[field] = Object.assign(Object.create(null), copy[field]);
    }
    for (const collection of [
      copy.cumulativeMeasurements,
      copy.inputs,
      copy.outputs,
      copy.measurements,
      copy.faults,
      copy.acknowledgements,
    ]) {
      for (const key of Object.keys(collection))
        if (Date.parse(collection[key].receivedAt) < cutoff) delete collection[key];
    }
    copy.events = copy.events.filter((event) => Date.parse(event.receivedAt) >= cutoff);
    if (copy.rejection && Date.parse(copy.rejection.receivedAt) < cutoff) delete copy.rejection;
    return copy;
  }
  command(controllerId: number, channelId: string, id: string) {
    this.prune();
    if (!identifier(channelId) || !identifier(id)) return;
    if (!this.controllers.has(controllerId) && this.controllers.size >= MAX_CONTROLLERS) return;
    const state = this.read(controllerId);
    state.touched = this.now();
    this.controllers.set(controllerId, state);
    const oldest = this.commands.keys().next().value;
    if (this.commands.size >= 1024 && oldest !== undefined) this.commands.delete(oldest);
    this.commands.set(id, { controllerId, channelId, at: this.now() });
  }
  commandFailed(id: string, status: 'dispatch-failed' | 'timeout') {
    this.prune();
    const command = this.commands.get(id);
    if (!command) return;
    this.commands.delete(id);
    const state = this.controllers.get(command.controllerId);
    if (!state) return;
    state.touched = this.now();
    state.acknowledgements[command.channelId] = { id, status, receivedAt: new Date(this.now()).toISOString() };
    while (Object.keys(state.acknowledgements).length > MAX_CHANNELS)
      delete state.acknowledgements[Object.keys(state.acknowledgements)[0]];
  }
  canTrack(id: number): boolean {
    this.prune();
    return (
      this.controllers.has(id) ||
      this.controllers.size < MAX_CONTROLLERS ||
      [...this.controllers.values()].some((state) => !state.activeStream)
    );
  }
  ingest(id: number, kind: string, payload: Buffer): boolean {
    this.prune();
    if (payload.length > 65_536) return false;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload.toString('utf8'));
    } catch {
      return false;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (!DIAGNOSTIC_CATEGORIES.includes(kind)) return false;
    const canonical = canonicalEnvelope(data, kind);
    if (canonical && !validEnvelope(data, this.now())) return false;
    const isObject = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === 'object' && !Array.isArray(value);
    if (
      canonical &&
      kind === 'state' &&
      data.readiness !== undefined &&
      (!isObject(data.readiness) || typeof data.readiness.hardwareAvailable !== 'boolean')
    )
      return false;
    if (
      canonical &&
      kind === 'state' &&
      !(data.contentHash === null || (typeof data.contentHash === 'string' && /^[0-9a-f]{64}$/i.test(data.contentHash)))
    )
      return false;
    if (
      canonical &&
      kind === 'configuration/reported' &&
      (!Number.isSafeInteger(data.revision) ||
        (data.revision as number) < 1 ||
        typeof data.contentHash !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(data.contentHash) ||
        !Array.isArray(data.errors))
    )
      return false;
    if (
      canonical &&
      kind === 'state' &&
      (typeof data.connected !== 'boolean' ||
        !(data.revision === null || (Number.isSafeInteger(data.revision) && (data.revision as number) >= 0)) ||
        !isObject(data.outputs) ||
        (data.inputs !== undefined && !isObject(data.inputs)) ||
        ![...Object.values(data.outputs), ...Object.values(isObject(data.inputs) ? data.inputs : {})].every(
          (value) => typeof value === 'boolean',
        ))
    )
      return false;
    if (
      kind === 'measurements' &&
      (!identifier(data.channelId) ||
        typeof data.value !== 'number' ||
        !Number.isFinite(data.value) ||
        (canonical
          ? !Number.isSafeInteger(data.value) ||
            !CANONICAL_UNITS.includes(data.unit as string) ||
            !['live', 'cumulative'].includes(data.kind as string)
          : !['ampere', 'volt', 'watt', 'percent'].includes(data.unit as string)))
    )
      return false;
    if (kind === 'faults' && !identifier(data.channelId)) return false;
    if (
      kind === 'acknowledgements' &&
      (!identifier(data.id) || !['accepted', 'duplicate', 'rejected'].includes(data.status as string))
    )
      return false;
    // Never evict active stream tombstones to admit another controller within their retention window.
    const oldest = [...this.controllers].find(([, value]) => !value.activeStream)?.[0];
    if (!this.controllers.has(id) && this.controllers.size >= MAX_CONTROLLERS && oldest === undefined) return false;
    if (!this.controllers.has(id) && this.controllers.size >= MAX_CONTROLLERS && oldest !== undefined)
      this.controllers.delete(oldest);
    const state = this.read(id);
    if (!canonical && kind === 'heartbeat' && typeof data.sequence === 'number') {
      if (data.sequence < (state.legacyHeartbeatSequence ?? 0)) return false;
      state.legacyHeartbeatSequence = data.sequence;
    }
    if (canonical) {
      if (
        kind === 'measurements' &&
        state.measurementAfter !== undefined &&
        (sourceTime(data.timestamp) as number) <= state.measurementAfter
      )
        return false;
      const previousStream = state.activeStream;
      const admission = admitEnvelope(state, data, kind, this.now());
      if (admission === 'rejected') {
        if (state.trackingExhausted) {
          state.connected = false;
          this.controllers.set(id, state);
        }
        return false;
      }
      if (admission === 'restart') {
        // Measurements carry no configuration revision: they must postdate the accepted mapping/connection epoch.
        state.measurementAfter = (sourceTime(data.timestamp) as number) - (previousStream ? 0 : 1);
        state.inputs = Object.create(null);
        state.outputs = Object.create(null);
        state.measurements = Object.create(null);
        state.cumulativeMeasurements = Object.create(null);
        state.connected = undefined;
        state.heartbeatAt = undefined;
        state.rejection = undefined;
        state.hardwareAvailable = undefined;
        state.stateSourceAt = undefined;
        state.revision = undefined;
        state.contentHash = undefined;
      }
    } else if (state.activeStream && !['heartbeat', 'configuration/reported'].includes(kind)) {
      if (kind === 'state' && data.connected === false) {
        state.connected = false;
        state.measurementAfter = this.now();
        state.stateSourceAt = undefined;
        this.controllers.set(id, state);
      }
      return false;
    }
    state.touched = this.now();
    const receivedAt = new Date(this.now()).toISOString();
    const metadata = {
      sourceAt: canonical ? (data.timestamp as string) : null,
      receivedAt,
      streamId: canonical ? (state.activeStream as string) : null,
      sequence: canonical ? (data.sequence as number) : null,
    };
    if (kind === 'heartbeat') state.heartbeatAt = canonical ? (data.timestamp as string) : receivedAt;
    if (kind === 'state') {
      const contentHash =
        typeof data.contentHash === 'string' && /^[0-9a-f]{64}$/i.test(data.contentHash) ? data.contentHash : undefined;
      const hardwareAvailable =
        isObject(data.readiness) && typeof data.readiness.hardwareAvailable === 'boolean'
          ? data.readiness.hardwareAvailable
          : undefined;
      if (
        state.connected !== data.connected ||
        state.revision !== data.revision ||
        state.contentHash !== contentHash ||
        state.hardwareAvailable !== hardwareAvailable
      ) {
        if (state.stateSourceAt || (canonical && state.connected === false))
          state.measurementAfter = canonical ? (sourceTime(data.timestamp) as number) : this.now();
        state.measurements = Object.create(null);
        state.cumulativeMeasurements = Object.create(null);
      }
      state.inputs = Object.create(null);
      state.outputs = Object.create(null);
      if (typeof data.connected === 'boolean') state.connected = data.connected;
      state.revision = Number.isSafeInteger(data.revision) ? (data.revision as number) : undefined;
      state.contentHash = contentHash;
      state.hardwareAvailable = hardwareAvailable;
      state.stateSourceAt = canonical ? (data.timestamp as string) : undefined;
      if (data.outputs && typeof data.outputs === 'object' && !Array.isArray(data.outputs)) {
        for (const [channelId, value] of Object.entries(data.outputs).slice(0, MAX_CHANNELS)) {
          if (identifier(channelId) && typeof value === 'boolean')
            state.outputs[channelId] = { kind: 'output', value, ...metadata };
        }
      }
      if (isObject(data.inputs))
        for (const [channelId, value] of Object.entries(data.inputs).slice(0, MAX_CHANNELS)) {
          if (identifier(channelId) && typeof value === 'boolean')
            state.inputs[channelId] = { kind: 'input', value, ...metadata };
        }
    }
    if (
      kind === 'measurements' &&
      identifier(data.channelId) &&
      typeof data.value === 'number' &&
      Number.isFinite(data.value) &&
      (canonical ? CANONICAL_UNITS : ['ampere', 'volt', 'watt', 'percent']).includes(data.unit as string)
    ) {
      const collection = canonical && data.kind === 'cumulative' ? state.cumulativeMeasurements : state.measurements;
      collection[data.channelId] = {
        kind: 'measurement',
        value: data.value,
        unit: data.unit as string,
        ...(canonical ? { measurementKind: data.kind as 'live' | 'cumulative' } : {}),
        ...metadata,
      };
    }
    if (kind === 'faults' && identifier(data.channelId))
      state.faults[data.channelId] = {
        code: faultCodes.has(data.code as string) ? (data.code as string) : 'runtime_fault',
        receivedAt,
      };
    if (
      kind === 'acknowledgements' &&
      identifier(data.id) &&
      ['accepted', 'duplicate', 'rejected'].includes(data.status as string)
    ) {
      const command = this.commands.get(data.id);
      if (command?.controllerId === id) {
        state.acknowledgements[command.channelId] = {
          id: data.id,
          status: data.status as DiagnosticAcknowledgement['status'],
          receivedAt,
        };
        this.commands.delete(data.id);
      }
    }
    if (
      kind === 'configuration/reported' &&
      Number.isSafeInteger(data.revision) &&
      typeof data.contentHash === 'string'
    )
      state.rejection = {
        revision: data.revision as number,
        contentHash: data.contentHash,
        receivedAt,
        errors: safeValidationSummaries(data.errors),
      };
    for (const collection of [
      state.cumulativeMeasurements,
      state.inputs,
      state.outputs,
      state.measurements,
      state.faults,
      state.acknowledgements,
    ]) {
      while (Object.keys(collection).length > MAX_CHANNELS) delete collection[Object.keys(collection)[0]];
    }
    state.events.push({ kind, receivedAt });
    state.events = state.events.slice(-50);
    this.controllers.set(id, state);
    return true;
  }
}
