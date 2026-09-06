import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PLUGIN_CONTEXT, PluginContext, PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';

export interface CommissioningRuntimeState {
  timestamp: number;
  sequence: number;
  revision: number;
  contentHash: string;
  connected: boolean;
  configurationAccepted: boolean;
  hardwareAvailable: boolean;
  ready: boolean;
}

/** Only a bounded, current software probe. This is never physical qualification evidence. */
@Injectable()
export class WagoCommissioningReadiness implements OnModuleDestroy {
  private readonly entries = new Map<
    string,
    { lastRead: number; state?: CommissioningRuntimeState; subscription?: PluginMqttSubscription }
  >();
  private readonly cleanup = setInterval(() => {
    for (const [key, entry] of this.entries)
      if (Date.now() - entry.lastRead > 300_000) {
        entry.subscription?.unsubscribe();
        this.entries.delete(key);
      }
  }, 30_000).unref();

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  observe(serverId: number, hardwareId: string, prefix: string): CommissioningRuntimeState | undefined {
    const topic = `${prefix.replace(/\/$/, '')}/v1/controllers/${hardwareId}/state`;
    const key = `${serverId}:${topic}`;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 200) return undefined;
      entry = { lastRead: Date.now() };
      this.entries.set(key, entry);
      const current = entry;
      void this.context.mqtt
        .subscribe(serverId, topic, (message) => {
          if (message.payload.length > 65_536 || message.serverId !== serverId || message.topic !== topic) return;
          try {
            const value = JSON.parse(message.payload.toString('utf8'));
            const timestamp = typeof value.timestamp === 'string' ? Date.parse(value.timestamp) : NaN;
            if (
              !Number.isFinite(timestamp) ||
              timestamp > Date.now() ||
              !Number.isSafeInteger(value.revision) ||
              value.revision < 1 ||
              !Number.isSafeInteger(value.sequence) ||
              value.sequence < 0 ||
              typeof value.contentHash !== 'string' ||
              !/^[a-f0-9]{64}$/.test(value.contentHash) ||
              typeof value.connected !== 'boolean' ||
              typeof value.readiness?.configurationAccepted !== 'boolean' ||
              typeof value.readiness?.hardwareAvailable !== 'boolean' ||
              typeof value.readiness?.ready !== 'boolean'
            ) {
              current.state = undefined;
              return;
            }
            if (
              current.state &&
              (timestamp < current.state.timestamp ||
                (timestamp === current.state.timestamp && value.sequence <= current.state.sequence))
            )
              return;
            current.state = {
              timestamp,
              sequence: value.sequence,
              revision: value.revision,
              contentHash: value.contentHash,
              connected: value.connected,
              configurationAccepted: value.readiness.configurationAccepted,
              hardwareAvailable: value.readiness.hardwareAvailable,
              ready: value.readiness.ready,
            };
          } catch {
            current.state = undefined;
          }
        })
        .then((subscription) => {
          if (this.entries.get(key) === current) current.subscription = subscription;
          else subscription.unsubscribe();
        })
        .catch(() => {
          if (this.entries.get(key) === current) this.entries.delete(key);
        });
    }
    entry.lastRead = Date.now();
    return entry.state;
  }

  onModuleDestroy() {
    clearInterval(this.cleanup);
    for (const entry of this.entries.values()) entry.subscription?.unsubscribe();
    this.entries.clear();
  }
}
