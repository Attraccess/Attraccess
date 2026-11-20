import type { CommandOutcomePayload, DeviceStatePayload } from '@attraccess/matter-contract';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage, type MatterTables } from '../plugin-storage/access';
import { MatterChangeBus } from './change-bus';
import { pruneCommands } from './commands';
import type { MatterEndpoint } from './entities';
import { stateKeyFor } from './profile';
import {
  TIMEOUT_OUTCOME,
  applyOutcome,
  applyReport,
  applyRequest,
  canonicalJson,
  emptyState,
  outcomeAdvances,
  toView,
  type OutcomeInput,
  type StateEntryView,
} from './state-machine';

export type IngestStats = {
  applied: number;
  /** Older than the stored observation, or a duplicate. */
  outOfOrder: number;
  unknownEndpoint: number;
  inactiveNode: number;
  unmappedCluster: number;
  unknownCommand: number;
  /** Observed further in the future than clock skew explains; applying it would freeze the row. */
  futureTimestamp: number;
  /** A value larger than `MAX_VALUE_BYTES` once serialized. */
  oversizedValue: number;
  /** Dropped because the ingestion queue was full. */
  dropped: number;
};

export type RecordRequestInput = {
  endpointRef: string;
  stateKey: string;
  clusterId: number;
  commandId: number;
  value: unknown;
  requestedBy: number | null;
  /** The idempotency key. Recording the same request twice changes nothing. */
  requestId: string;
  correlationId?: string | null;
};

/** One event for the state, already validated against the contract. `receivedAt` is when the plugin received it. */
export type StateEvent = (
  { type: 'device.state'; payload: DeviceStatePayload } | { type: 'command.outcome'; payload: CommandOutcomePayload }
) & { receivedAt?: string };

/** How far a device or sidecar clock may run ahead of the plugin's before a report is rejected. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** The largest stored value, serialized. Matter attribute values are small; a larger one is a fault upstream. */
export const MAX_VALUE_BYTES = 4_096;

type Resolved = { endpoint: MatterEndpoint } | { ignored: 'unknownEndpoint' | 'inactiveNode' };
type Counters = Omit<IngestStats, 'dropped'>;
/**
 * The counters an event can raise, and the endpoints whose state it wrote. They are merged into `stats` and announced
 * only once the event's transaction committed.
 */
type Delta = Counters & { touched: Set<string> };
const newDelta = (): Delta => ({
  touched: new Set(),
  applied: 0,
  outOfOrder: 0,
  unknownEndpoint: 0,
  inactiveNode: 0,
  unmappedCluster: 0,
  unknownCommand: 0,
  futureTimestamp: 0,
  oversizedValue: 0,
});
/** The active fabrics events may reach, by the fabric ID an event names (`''` when it names none). */
type FabricLookup = Map<string, Promise<string[]>>;

/**
 * The current state of endpoints: reported, requested, accepted, external change and faults, one row per state key
 * updated in place. Telemetry only ever updates that row: it writes no history and no audit entries. The commands
 * table is a bounded log of requests. Every write runs in a host transaction.
 */
@Injectable()
export class MatterStateService {
  readonly stats: IngestStats = {
    applied: 0,
    outOfOrder: 0,
    unknownEndpoint: 0,
    inactiveNode: 0,
    unmappedCluster: 0,
    unknownCommand: 0,
    futureTimestamp: 0,
    oversizedValue: 0,
    dropped: 0,
  };

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Optional() @Inject(MatterChangeBus) private readonly changes?: MatterChangeBus,
  ) {}

  private get storage() {
    return matterStorage(this.context);
  }

  // --- reads ---------------------------------------------------------------------------------------------------

  async read(endpointRef: string, now: number = Date.now()): Promise<StateEntryView[]> {
    const rows = await this.storage.tables.endpointState.find({
      where: { endpointRef },
      orderBy: [{ field: 'stateKey', direction: 'asc' }],
    });
    return rows.map((row) => toView(row, now));
  }

  // --- internal API for the commands ticket ------------------------------------------------------------------

  /** Records that a command was requested for a state key. Sets `requested`; the command stays unconfirmed. */
  async recordRequest(input: RecordRequestInput, now: string = new Date().toISOString()): Promise<StateEntryView> {
    const view = await this.storage.transaction(async (tables) => {
      const current = await tables.endpointState.findOne({
        where: { endpointRef: input.endpointRef, stateKey: input.stateKey },
      });
      if (await tables.commands.get(input.requestId)) {
        // Recorded before: nothing changes, whatever happened to the state row since.
        return toView(current ?? emptyState(input.endpointRef, input.stateKey, randomUUID(), now));
      }
      const next = applyRequest(current ?? emptyState(input.endpointRef, input.stateKey, randomUUID(), now), {
        value: input.value,
        requestedAt: now,
        requestedBy: input.requestedBy,
        requestId: input.requestId,
        correlationId: input.correlationId ?? null,
      });
      await tables.endpointState.upsert(next, { conflictOn: ['id'] });
      await tables.commands.insert({
        requestId: input.requestId,
        endpointRef: input.endpointRef,
        clusterId: input.clusterId,
        commandId: input.commandId,
        stateKey: input.stateKey,
        requestedAt: now,
        requestedBy: input.requestedBy,
        correlationId: input.correlationId ?? null,
        outcome: 'requested',
        acceptedAt: null,
        reportedAt: null,
        failureCode: null,
      });
      await pruneCommands(tables, new Date(now));
      return toView(next);
    });
    this.changes?.stateChanged([input.endpointRef]);
    return view;
  }

  /** A physical command timed out: the effect is unknown. It becomes `uncertain` and is never retried here. */
  async recordTimeout(requestId: string, now: string = new Date().toISOString()): Promise<void> {
    const delta = newDelta();
    await this.storage.transaction((tables) =>
      this.applyOutcomeFor(
        tables,
        requestId,
        null,
        { outcome: TIMEOUT_OUTCOME, acceptedAt: null, reportedAt: null },
        null,
        now,
        delta,
      ),
    );
    this.merge(delta);
  }

  // --- event ingestion -------------------------------------------------------------------------------------------

  /**
   * Applies events in order, in one transaction: one commit for a whole burst of telemetry. The record port has no
   * savepoints, so an event that cannot be applied cannot be undone alone inside that transaction: the whole batch
   * is rolled back and its events are applied one by one, each in a transaction of its own. The rare failing event is
   * then skipped alone, and the others still apply.
   */
  async ingest(events: readonly StateEvent[], receivedAt: string = new Date().toISOString()): Promise<void> {
    if (events.length === 0) return;
    const batch = newDelta();
    try {
      const fabrics: FabricLookup = new Map();
      await this.storage.transaction(async (tables) => {
        for (const event of events)
          await this.applyEvent(tables, fabrics, event, event.receivedAt ?? receivedAt, batch);
      });
      this.merge(batch);
      return;
    } catch {
      this.context.logger.debug?.('A batch of Matter events is applied one by one after one of them failed.');
    }
    for (const event of events) {
      const delta = newDelta();
      try {
        await this.storage.transaction((tables) =>
          this.applyEvent(tables, new Map(), event, event.receivedAt ?? receivedAt, delta),
        );
        this.merge(delta);
      } catch {
        this.context.logger.warn?.('A Matter event could not be applied to the device state.');
      }
    }
  }

  private applyEvent(
    tables: MatterTables,
    fabrics: FabricLookup,
    event: StateEvent,
    at: string,
    delta: Delta,
  ): Promise<void> {
    return event.type === 'device.state'
      ? this.reportIn(tables, fabrics, event.payload, at, delta)
      : this.outcomeIn(tables, fabrics, event.payload, at, delta);
  }

  private merge(delta: Delta): void {
    const { touched, ...counters } = delta;
    for (const key of Object.keys(counters) as (keyof Counters)[]) this.stats[key] += counters[key];
    this.changes?.stateChanged(touched);
  }

  /** One `device.state` event on its own. */
  ingestReport(payload: DeviceStatePayload, receivedAt: string = new Date().toISOString()): Promise<void> {
    return this.ingest([{ type: 'device.state', payload }], receivedAt);
  }

  /** One `command.outcome` event on its own. */
  ingestOutcome(payload: CommandOutcomePayload, now: string = new Date().toISOString()): Promise<void> {
    return this.ingest([{ type: 'command.outcome', payload }], now);
  }

  private async reportIn(
    tables: MatterTables,
    fabrics: FabricLookup,
    payload: DeviceStatePayload,
    receivedAt: string,
    delta: Delta,
  ): Promise<void> {
    const stateKey = stateKeyFor(payload.clusterId, payload.attributeId);
    if (stateKey === null) return void (delta.unmappedCluster += 1);
    if (Date.parse(payload.observedAt) > Date.parse(receivedAt) + MAX_CLOCK_SKEW_MS) {
      return void (delta.futureTimestamp += 1);
    }
    if (!fitsValueBound(payload.value)) return void (delta.oversizedValue += 1);
    const resolved = await this.resolve(tables, fabrics, payload);
    if ('ignored' in resolved) return void (delta[resolved.ignored] += 1);
    const row =
      (await tables.endpointState.findOne({ where: { endpointRef: resolved.endpoint.id, stateKey } })) ??
      emptyState(resolved.endpoint.id, stateKey, randomUUID(), receivedAt);
    const next = applyReport(
      row,
      {
        value: payload.value,
        observedAt: payload.observedAt,
        source: payload.source,
        fault: payload.fault,
        maxIntervalSec: payload.maxIntervalSec,
      },
      receivedAt,
    );
    if (!next) return void (delta.outOfOrder += 1);
    await tables.endpointState.upsert(next, { conflictOn: ['id'] });
    delta.touched.add(resolved.endpoint.id);
    // A matching report resolves the command; keep the bounded command record in step with the state row.
    if (next.commandState === 'reported' && row.commandState !== 'reported' && next.requestId) {
      await tables.commands.update(
        { requestId: next.requestId },
        { outcome: 'reported', reportedAt: next.commandReportedAt },
      );
    }
    delta.applied += 1;
  }

  private async outcomeIn(
    tables: MatterTables,
    fabrics: FabricLookup,
    payload: CommandOutcomePayload,
    now: string,
    delta: Delta,
  ): Promise<void> {
    const resolved = await this.resolve(tables, fabrics, payload);
    if ('ignored' in resolved) return void (delta[resolved.ignored] += 1);
    await this.applyOutcomeFor(
      tables,
      payload.requestId,
      resolved.endpoint.id,
      { outcome: payload.outcome, acceptedAt: payload.acceptedAt, reportedAt: payload.reportedAt },
      payload.failureCode ?? null,
      now,
      delta,
    );
  }

  /** `endpointRef` is where the event says the command ran; null for the plugin's own timeout. */
  private async applyOutcomeFor(
    tables: MatterTables,
    requestId: string,
    endpointRef: string | null,
    input: OutcomeInput,
    failureCode: string | null,
    now: string,
    delta: Delta,
  ): Promise<void> {
    const command = await tables.commands.get(requestId);
    // A command this plugin did not record (or that was pruned) cannot be attributed to any state. Neither can one
    // that the event places on another endpoint.
    if (!command || (endpointRef !== null && command.endpointRef !== endpointRef)) {
      return void (delta.unknownCommand += 1);
    }
    if (outcomeAdvances(command.outcome, input.outcome)) {
      // Compare-and-set on the outcome this decision was made from: a writer that got there first is not overwritten.
      await tables.commands.update(
        { requestId, outcome: command.outcome },
        {
          outcome: input.outcome,
          acceptedAt: input.acceptedAt ?? command.acceptedAt,
          reportedAt: input.reportedAt ?? command.reportedAt,
          failureCode: failureCode ?? command.failureCode,
        },
      );
    }
    delta.applied += 1;
    if (!command.stateKey) return;
    const row = await tables.endpointState.findOne({
      where: { endpointRef: command.endpointRef, stateKey: command.stateKey },
    });
    if (!row) return;
    const next = applyOutcome(row, requestId, input, now);
    if (next === row) return;
    await tables.endpointState.upsert(next, { conflictOn: ['id'] });
    delta.touched.add(command.endpointRef);
  }

  /**
   * Events only reach live endpoints of a claimed, unclaimed or detached node of the active fabric (or of the fabric
   * the event names, which must be the active one). The active fabrics are looked up once per batch, and the node and
   * endpoint by one query each.
   */
  private async resolve(
    tables: MatterTables,
    fabrics: FabricLookup,
    target: { fabricId?: string; nodeId: string; endpointId: number },
  ): Promise<Resolved> {
    const lookupKey = target.fabricId ?? '';
    let active = fabrics.get(lookupKey);
    if (!active) {
      active = tables.fabrics
        .find({
          where: {
            status: 'active',
            retiredAt: null,
            ...(target.fabricId === undefined ? {} : { fabricId: target.fabricId }),
          },
        })
        .then((rows) => rows.map((row) => row.id));
      fabrics.set(lookupKey, active);
    }
    const fabricRefs = await active;
    const found =
      fabricRefs.length === 0
        ? null
        : await tables.nodes.findOne({
            where: { nodeId: target.nodeId, fabricRef: { in: fabricRefs }, removedAt: null },
          });
    if (!found) return { ignored: 'unknownEndpoint' };
    if (found.lifecycleState === 'archived' || found.lifecycleState === 'removed') return { ignored: 'inactiveNode' };
    const endpoint = await tables.endpoints.findOne({
      where: { nodeRef: found.id, endpointId: target.endpointId, removedAt: null },
    });
    return endpoint ? { endpoint } : { ignored: 'unknownEndpoint' };
  }
}

function fitsValueBound(value: unknown): boolean {
  try {
    return Buffer.byteLength(canonicalJson(value)) <= MAX_VALUE_BYTES;
  } catch {
    // Nested deeper than the stack allows.
    return false;
  }
}
