import { commandOutcomePayloadSchema, deviceStatePayloadSchema } from '@attraccess/matter-contract';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { StreamEvent } from '../client/event-stream';
import { MatterConnectionService } from '../connection/connection.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { MatterReconciliationService } from './reconciliation.service';
import { MatterStateService } from './state.service';

/**
 * Connects the sidecar connection to the device model: reconciliation triggers (connected, reconciliation required,
 * successful commissioning) and event-stream ingestion. Nothing runs on a timer. Events are applied one at a time, in
 * order, and never wait for or write audit entries.
 */
@Injectable()
export class MatterIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribe: (() => void)[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: MatterConnectionService,
    @Inject(MatterReconciliationService) private readonly reconciliation: MatterReconciliationService,
    @Inject(MatterStateService) private readonly state: MatterStateService,
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
  idle(): Promise<void> {
    return this.chain;
  }

  private reconcile(): void {
    this.reconciliation
      .request()
      .catch(() => this.context.logger.warn?.('Matter reconciliation could not be started.'));
  }

  private enqueue(streamEvent: StreamEvent): void {
    const { event } = streamEvent;
    if (event.type === 'commissioning.progress') {
      // A node that was just commissioned shows up in the inventory.
      if ((event.payload as { state?: unknown }).state === 'succeeded') this.reconcile();
      return;
    }
    const type = event.type;
    if (type !== 'device.state' && type !== 'command.outcome') return;
    this.chain = this.chain.then(() => this.apply(type, event.payload)).catch(() => undefined);
  }

  private async apply(type: 'device.state' | 'command.outcome', payload: unknown): Promise<void> {
    try {
      if (type === 'device.state') {
        const parsed = deviceStatePayloadSchema.safeParse(payload);
        if (parsed.success) await this.state.ingestReport(parsed.data);
      } else {
        const parsed = commandOutcomePayloadSchema.safeParse(payload);
        if (parsed.success) await this.state.ingestOutcome(parsed.data);
      }
    } catch {
      this.context.logger.warn?.('A Matter event could not be applied to the device state.');
    }
  }
}
