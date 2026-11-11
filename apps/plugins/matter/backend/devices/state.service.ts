import type { CommandOutcomePayload, DeviceStatePayload } from '@attraccess/matter-contract';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { pruneCommands } from './commands';
import { MatterCommand, MatterEndpoint, MatterEndpointState, MatterFabric, MatterNode } from './entities';
import { stateKeyFor } from './profile';
import {
  TIMEOUT_OUTCOME,
  applyOutcome,
  applyReport,
  applyRequest,
  emptyState,
  outcomeAdvances,
  toView,
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

type Resolved = { endpoint: MatterEndpoint } | { ignored: 'unknownEndpoint' | 'inactiveNode' };

/**
 * The current state of endpoints: reported, requested, accepted, external change and faults, one row per state key
 * updated in place. Telemetry only ever updates that row: it writes no history and no audit entries. The commands
 * table is a bounded log of requests.
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
    const commands = this.context.getRepository(MatterCommand);
    const existing = await commands.findOneBy({ requestId: input.requestId });
    if (existing) {
      const row = await this.states.findOneBy({ endpointRef: input.endpointRef, stateKey: input.stateKey });
      if (row) return toView(row);
    }
    return commands.manager.transaction(async (manager) => {
      const states = manager.getRepository(MatterEndpointState);
      const row =
        (await states.findOneBy({ endpointRef: input.endpointRef, stateKey: input.stateKey })) ??
        emptyState(input.endpointRef, input.stateKey, randomUUID(), now);
      const next = applyRequest(row, {
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
      await pruneCommands(manager);
      return toView(next);
    });
  }

  /** A physical command timed out: the effect is unknown. It becomes `uncertain` and is never retried here. */
  async recordTimeout(requestId: string, now: string = new Date().toISOString()): Promise<void> {
    await this.applyOutcomeFor(requestId, { outcome: TIMEOUT_OUTCOME, acceptedAt: null, reportedAt: null }, null, now);
  }

  // --- event ingestion -------------------------------------------------------------------------------------------

  async ingestReport(payload: DeviceStatePayload, receivedAt: string = new Date().toISOString()): Promise<void> {
    const stateKey = stateKeyFor(payload.clusterId, payload.attributeId);
    if (stateKey === null) return void (this.stats.unmappedCluster += 1);
    const resolved = await this.resolve(payload.nodeId, payload.endpointId);
    if ('ignored' in resolved) return void (this.stats[resolved.ignored] += 1);
    const row =
      (await this.states.findOneBy({ endpointRef: resolved.endpoint.id, stateKey })) ??
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
    await this.states.save(next);
    this.stats.applied += 1;
  }

  async ingestOutcome(payload: CommandOutcomePayload, now: string = new Date().toISOString()): Promise<void> {
    const resolved = await this.resolve(payload.nodeId, payload.endpointId);
    if ('ignored' in resolved) return void (this.stats[resolved.ignored] += 1);
    await this.applyOutcomeFor(
      payload.requestId,
      { outcome: payload.outcome, acceptedAt: payload.acceptedAt, reportedAt: payload.reportedAt },
      payload.failureCode ?? null,
      now,
    );
  }

  private async applyOutcomeFor(
    requestId: string,
    input: {
      outcome: 'requested' | 'accepted' | 'reported' | 'uncertain' | 'failed';
      acceptedAt: string | null;
      reportedAt: string | null;
    },
    failureCode: string | null,
    now: string,
  ): Promise<void> {
    const commands = this.context.getRepository(MatterCommand);
    const command = await commands.findOneBy({ requestId });
    // A command this plugin did not record (or that was pruned) cannot be attributed to any state.
    if (!command) return void (this.stats.unknownCommand += 1);
    await commands.manager.transaction(async (manager) => {
      if (outcomeAdvances(command.outcome, input.outcome)) {
        command.outcome = input.outcome;
        command.acceptedAt = input.acceptedAt ?? command.acceptedAt;
        command.reportedAt = input.reportedAt ?? command.reportedAt;
        command.failureCode = failureCode ?? command.failureCode;
        await manager.save(MatterCommand, command);
      }
      if (!command.stateKey) return;
      const states = manager.getRepository(MatterEndpointState);
      const row = await states.findOneBy({ endpointRef: command.endpointRef, stateKey: command.stateKey });
      if (!row) return;
      const next = applyOutcome(row, requestId, input, now);
      if (next !== row) await states.save(next);
    });
    this.stats.applied += 1;
  }

  /** Events only reach endpoints that are live on a claimed or unclaimed (or detached) node of the active fabric. */
  private async resolve(nodeId: string, endpointId: number): Promise<Resolved> {
    const found = await this.context
      .getRepository(MatterNode)
      .createQueryBuilder('n')
      .innerJoin(MatterFabric, 'f', 'f.id = n.fabricRef')
      .where(`n.nodeId = :nodeId AND f.status = 'active' AND f.retiredAt IS NULL`, { nodeId })
      .andWhere('n.removedAt IS NULL')
      .getOne();
    if (!found) return { ignored: 'unknownEndpoint' };
    if (found.lifecycleState === 'archived' || found.lifecycleState === 'removed') return { ignored: 'inactiveNode' };
    const endpoint = await this.context
      .getRepository(MatterEndpoint)
      .createQueryBuilder('e')
      .where('e.nodeRef = :ref AND e.endpointId = :endpointId AND e.removedAt IS NULL', {
        ref: found.id,
        endpointId,
      })
      .getOne();
    return endpoint ? { endpoint } : { ignored: 'unknownEndpoint' };
  }
}
