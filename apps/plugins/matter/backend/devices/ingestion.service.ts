import { commandOutcomePayloadSchema, deviceStatePayloadSchema } from '@attraccess/matter-contract';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { StreamEvent } from '../client/event-stream';
import { MatterConnectionService } from '../connection/connection.service';
import { MatterFabricService } from '../fabric/fabric.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { MatterReconciliationService } from './reconciliation.service';
import { MatterStateService, type StateEvent } from './state.service';

/** Events waiting to be applied. Beyond this, new events are dropped and counted, so memory stays bounded. */
export const MAX_PENDING_EVENTS = 10_000;
/** Events applied per serialized transaction: one commit per burst instead of one per report. */
export const INGEST_BATCH_SIZE = 200;

/**
 * Connects the sidecar connection to the device model: reconciliation triggers (connected, reconciliation required,
 * successful commissioning) and event-stream ingestion. Nothing runs on a timer. Events are applied in order, in
 * batches, and never wait for or write audit entries.
 */
@Injectable()
export class MatterIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribe: (() => void)[] = [];
  private readonly pending: StateEvent[] = [];
  private draining: Promise<void> | undefined;
  private warnedFull = false;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: MatterConnectionService,
    @Inject(MatterReconciliationService) private readonly reconciliation: MatterReconciliationService,
    @Inject(MatterStateService) private readonly state: MatterStateService,
    // Settles whether the fabric needs recovery first: while it does, the device records are not reconciled with a
    // sidecar the plugin has not accepted.
    @Optional() @Inject(MatterFabricService) private readonly fabric?: MatterFabricService,
  ) {}

  onModuleInit(): void {
    const connection = this.connectionService.connection;
    this.unsubscribe.push(
      connection.onStateChange((status) => {
        if (status.state === 'connected') this.reconcile();
      }),
      connection.onReconciliationRequired(() => this.reconcile()),
      connection.onEvent((event) => this.enqueue(event)),
    );
    // Already connected before this service started.
    if (connection.status().state === 'connected') this.reconcile();
  }

  onModuleDestroy(): void {
    for (const stop of this.unsubscribe.splice(0)) stop();
  }

  /** Resolves when every event received so far has been applied. */
  async idle(): Promise<void> {
    while (this.draining) await this.draining;
  }

  private reconcile(): void {
    const settled = this.fabric ? this.fabric.detect('connect').catch(() => null) : Promise.resolve(null);
    void settled
      .then((mismatch) => (mismatch === null ? this.reconciliation.request() : undefined))
      .catch(() => this.context.logger.warn?.('Matter reconciliation could not be started.'));
  }

  private enqueue(streamEvent: StreamEvent): void {
    const { event } = streamEvent;
    if (event.type === 'commissioning.progress') {
      // A node that was just commissioned shows up in the inventory.
      if ((event.payload as { state?: unknown }).state === 'succeeded') this.reconcile();
      return;
    }
    const parsed = parseStateEvent(event.type, event.payload);
    if (!parsed) return;
    if (this.pending.length >= MAX_PENDING_EVENTS) {
      this.state.stats.dropped += 1;
      if (!this.warnedFull) {
        this.warnedFull = true;
        this.context.logger.warn?.('Matter events arrive faster than they can be stored; some were dropped.');
      }
      return;
    }
    // Stamped now: the batch may wait behind other writes, and "received after the request" must hold for the event.
    this.pending.push({ ...parsed, receivedAt: new Date().toISOString() });
    this.draining ??= this.drain();
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending.length > 0) {
        const batch = this.pending.splice(0, INGEST_BATCH_SIZE);
        try {
          await this.state.ingest(batch);
        } catch {
          this.context.logger.warn?.('A batch of Matter events could not be applied to the device state.');
        }
      }
    } finally {
      // In the same tick as the empty-queue check, so an event enqueued right after it starts a new drain.
      this.draining = undefined;
      this.warnedFull = false;
    }
  }
}

function parseStateEvent(type: string, payload: unknown): StateEvent | null {
  if (type === 'device.state') {
    const parsed = deviceStatePayloadSchema.safeParse(payload);
    return parsed.success ? { type, payload: parsed.data } : null;
  }
  if (type === 'command.outcome') {
    const parsed = commandOutcomePayloadSchema.safeParse(payload);
    return parsed.success ? { type, payload: parsed.data } : null;
  }
  return null;
}
