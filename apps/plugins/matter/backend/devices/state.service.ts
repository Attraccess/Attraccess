import type { CommandOutcomePayload, DeviceStatePayload } from '@attraccess/matter-contract';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { pruneCommands } from './commands';
import { MatterCommand, MatterEndpoint, MatterEndpointState, MatterFabric, MatterNode } from './entities';
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

/**
 * The current state of endpoints: reported, requested, accepted, external change and faults, one row per state key
 * updated in place. Telemetry only ever updates that row: it writes no history and no audit entries. The commands
 * table is a bounded log of requests. Every write runs inside `runSerialized`.
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

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private get states() {
    return this.context.getRepository(MatterEndpointState);
  }

  // --- reads ---------------------------------------------------------------------------------------------------

  async read(endpointRef: string, now: number = Date.now()): Promise<StateEntryView[]> {
    const rows = await this.states.find({ where: { endpointRef }, order: { stateKey: 'ASC' } });
    return rows.map((row) => toView(row, now));
  }

  // --- internal API for the commands ticket ------------------------------------------------------------------

  /** Records that a command was requested for a state key. Sets `requested`; the command stays unconfirmed. */
  async recordRequest(input: RecordRequestInput, now: string = new Date().toISOString()): Promise<StateEntryView> {
    return this.context.runSerialized(async (manager) => {
      const states = manager.getRepository(MatterEndpointState);
      const current = await states.findOneBy({ endpointRef: input.endpointRef, stateKey: input.stateKey });
      if (await manager.findOneBy(MatterCommand, { requestId: input.requestId })) {
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
      await states.save(next);
      await manager.getRepository(MatterCommand).insert({
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
      await pruneCommands(manager, new Date(now));
      return toView(next);
    });
  }

  /** A physical command timed out: the effect is unknown. It becomes `uncertain` and is never retried here. */
  async recordTimeout(requestId: string, now: string = new Date().toISOString()): Promise<void> {
    await this.context.runSerialized((manager) =>
      this.applyOutcomeFor(
        manager,
        requestId,
        null,
        { outcome: TIMEOUT_OUTCOME, acceptedAt: null, reportedAt: null },
        null,
        now,
      ),
    );
  }

  // --- event ingestion -------------------------------------------------------------------------------------------

  /**
   * Applies events in order, in one serialized transaction: one commit for a whole burst of telemetry. Each event runs
   * in its own savepoint, so one that cannot be applied is undone alone and the others still apply.
   */
  async ingest(events: readonly StateEvent[], receivedAt: string = new Date().toISOString()): Promise<void> {
    if (events.length === 0) return;
    await this.context.runSerialized(async (manager) => {
      for (const event of events) {
        const at = event.receivedAt ?? receivedAt;
        await manager.query('SAVEPOINT matter_event');
        try {
          if (event.type === 'device.state') await this.reportIn(manager, event.payload, at);
          else await this.outcomeIn(manager, event.payload, at);
        } catch {
          // Fails, and fails the batch, when SQLite already rolled the whole transaction back (disk full, I/O).
          await manager.query('ROLLBACK TO SAVEPOINT matter_event');
          this.context.logger.warn?.('A Matter event could not be applied to the device state.');
        }
        await manager.query('RELEASE SAVEPOINT matter_event');
      }
    });
  }

  /** One `device.state` event on its own. */
  ingestReport(payload: DeviceStatePayload, receivedAt: string = new Date().toISOString()): Promise<void> {
    return this.ingest([{ type: 'device.state', payload }], receivedAt);
  }

  /** One `command.outcome` event on its own. */
  ingestOutcome(payload: CommandOutcomePayload, now: string = new Date().toISOString()): Promise<void> {
    return this.ingest([{ type: 'command.outcome', payload }], now);
  }

  private async reportIn(manager: EntityManager, payload: DeviceStatePayload, receivedAt: string): Promise<void> {
    const stateKey = stateKeyFor(payload.clusterId, payload.attributeId);
    if (stateKey === null) return void (this.stats.unmappedCluster += 1);
    if (Date.parse(payload.observedAt) > Date.parse(receivedAt) + MAX_CLOCK_SKEW_MS) {
      return void (this.stats.futureTimestamp += 1);
    }
    if (!fitsValueBound(payload.value)) return void (this.stats.oversizedValue += 1);
    const resolved = await this.resolve(manager, payload);
    if ('ignored' in resolved) return void (this.stats[resolved.ignored] += 1);
    const states = manager.getRepository(MatterEndpointState);
    const row =
      (await states.findOneBy({ endpointRef: resolved.endpoint.id, stateKey })) ??
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
    if (!next) return void (this.stats.outOfOrder += 1);
    await states.save(next);
    // A matching report resolves the command; keep the bounded command record in step with the state row.
    if (next.commandState === 'reported' && row.commandState !== 'reported' && next.requestId) {
      await manager.update(
        MatterCommand,
        { requestId: next.requestId },
        { outcome: 'reported', reportedAt: next.commandReportedAt },
      );
    }
    this.stats.applied += 1;
  }

  private async outcomeIn(manager: EntityManager, payload: CommandOutcomePayload, now: string): Promise<void> {
    const resolved = await this.resolve(manager, payload);
    if ('ignored' in resolved) return void (this.stats[resolved.ignored] += 1);
    await this.applyOutcomeFor(
      manager,
      payload.requestId,
      resolved.endpoint.id,
      { outcome: payload.outcome, acceptedAt: payload.acceptedAt, reportedAt: payload.reportedAt },
      payload.failureCode ?? null,
      now,
    );
  }

  /** `endpointRef` is where the event says the command ran; null for the plugin's own timeout. */
  private async applyOutcomeFor(
    manager: EntityManager,
    requestId: string,
    endpointRef: string | null,
    input: OutcomeInput,
    failureCode: string | null,
    now: string,
  ): Promise<void> {
    const command = await manager.findOneBy(MatterCommand, { requestId });
    // A command this plugin did not record (or that was pruned) cannot be attributed to any state. Neither can one
    // that the event places on another endpoint.
    if (!command || (endpointRef !== null && command.endpointRef !== endpointRef)) {
      return void (this.stats.unknownCommand += 1);
    }
    if (outcomeAdvances(command.outcome, input.outcome)) {
      await manager.update(
        MatterCommand,
        { requestId },
        {
          outcome: input.outcome,
          acceptedAt: input.acceptedAt ?? command.acceptedAt,
          reportedAt: input.reportedAt ?? command.reportedAt,
          failureCode: failureCode ?? command.failureCode,
        },
      );
    }
    this.stats.applied += 1;
    if (!command.stateKey) return;
    const states = manager.getRepository(MatterEndpointState);
    const row = await states.findOneBy({ endpointRef: command.endpointRef, stateKey: command.stateKey });
    if (!row) return;
    const next = applyOutcome(row, requestId, input, now);
    if (next !== row) await states.save(next);
  }

  /**
   * Events only reach live endpoints of a claimed, unclaimed or detached node of the active fabric (or of the fabric
   * the event names, which must be the active one).
   */
  private async resolve(
    manager: EntityManager,
    target: { fabricId?: string; nodeId: string; endpointId: number },
  ): Promise<Resolved> {
    const query = manager
      .createQueryBuilder(MatterNode, 'n')
      .innerJoin(MatterFabric, 'f', 'f.id = n.fabricRef')
      .where(`n.nodeId = :nodeId AND f.status = 'active' AND f.retiredAt IS NULL`, { nodeId: target.nodeId })
      .andWhere('n.removedAt IS NULL');
    if (target.fabricId !== undefined) query.andWhere('f.fabricId = :fabricId', { fabricId: target.fabricId });
    const found = await query.getOne();
    if (!found) return { ignored: 'unknownEndpoint' };
    if (found.lifecycleState === 'archived' || found.lifecycleState === 'removed') return { ignored: 'inactiveNode' };
    const endpoint = await manager
      .createQueryBuilder(MatterEndpoint, 'e')
      .where('e.nodeRef = :ref AND e.endpointId = :endpointId AND e.removedAt IS NULL', {
        ref: found.id,
        endpointId: target.endpointId,
      })
      .getOne();
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
