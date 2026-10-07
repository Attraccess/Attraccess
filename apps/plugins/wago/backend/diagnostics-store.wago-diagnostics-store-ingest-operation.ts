import { MAX_CHANNELS } from './diagnostics-store.state';
import { MAX_CONTROLLERS } from './diagnostics-store.state';
import { canonicalEnvelope } from './diagnostics-envelope';
import { DIAGNOSTIC_CATEGORIES } from './diagnostics-envelope';
import { validEnvelope } from './diagnostics-envelope';
import { validStatePayload } from './diagnostics-store.helpers';
import { validEventPayload } from './diagnostics-store.helpers';
import { WagoDiagnosticsStoreCanTrackOperation } from './diagnostics-store.wago-diagnostics-store-can-track-operation';


export abstract class WagoDiagnosticsStoreIngestOperation extends WagoDiagnosticsStoreCanTrackOperation {
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
    if (!validStatePayload(data, kind, canonical) || !validEventPayload(data, kind, canonical)) return false;
    // Never evict active stream tombstones to admit another controller within their retention window.
    const oldest = [...this.controllers].find(([, value]) => !value.activeStream)?.[0];
    if (!this.controllers.has(id) && this.controllers.size >= MAX_CONTROLLERS && oldest === undefined) return false;
    if (!this.controllers.has(id) && this.controllers.size >= MAX_CONTROLLERS && oldest !== undefined)
      this.controllers.delete(oldest);
    const state = this.read(id);
    if (!this.admitIncoming(id, state, kind, data, canonical)) return false;
    state.touched = this.now();
    const receivedAt = new Date(this.now()).toISOString();
    const metadata = {
      sourceAt: canonical ? (data.timestamp as string) : null,
      receivedAt,
      streamId: canonical ? (state.activeStream as string) : null,
      sequence: canonical ? (data.sequence as number) : null,
    };
    if (kind === 'heartbeat') state.heartbeatAt = canonical ? (data.timestamp as string) : receivedAt;
    if (kind === 'state') this.applyState(state, data, canonical, metadata);
    this.applyEvents(id, state, kind, data, canonical, metadata);
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
