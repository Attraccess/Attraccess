import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PLUGIN_CONTEXT, PluginContext, PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { admitEnvelope, emptyStream, type DiagnosticStream } from './diagnostics-envelope';
import { normalizeOperationalPrefix, parseOperationalMessage } from './protocol';

export interface CommissioningRuntimeState {
  timestamp: number;
  sequence: number;
  revision: number | null;
  contentHash: string | null;
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
    {
      lastRead: number;
      stream: DiagnosticStream;
      state?: CommissioningRuntimeState;
      subscription?: PluginMqttSubscription;
    }
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
    const topic = `${normalizeOperationalPrefix(prefix)}/v1/controllers/${hardwareId}/state`;
    const key = `${serverId}:${topic}`;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 200) return undefined;
      entry = { lastRead: Date.now(), stream: emptyStream() };
      this.entries.set(key, entry);
      const current = entry;
      void this.context.mqtt
        .subscribe(serverId, topic, (message) => {
          if (message.serverId !== serverId || message.topic !== topic) return;
          if (message.payload.length > 65_536) {
            current.state = undefined;
            return;
          }
          try {
            const parsed = parseOperationalMessage(prefix, topic, message.payload);
            if (!parsed || parsed.hardwareId !== hardwareId || parsed.message.category !== 'state') {
              current.state = undefined;
              return;
            }
            const event = parsed.message;
            const timestamp = Date.parse(event.timestamp);
            const now = Date.now();
            // The operational decoder deliberately projects readiness to hardware availability.
            // Validate the additional commissioning fields from the already decoded payload.
            const value = JSON.parse(message.payload.toString('utf8')) as Record<string, unknown>;
            const readiness = value.readiness;
            if (
              timestamp > now ||
              (event.contentHash !== null && !/^[a-f0-9]{64}$/i.test(event.contentHash)) ||
              !readiness ||
              typeof readiness !== 'object' ||
              !('configurationAccepted' in readiness) ||
              typeof readiness.configurationAccepted !== 'boolean' ||
              !('hardwareAvailable' in readiness) ||
              typeof readiness.hardwareAvailable !== 'boolean' ||
              !('ready' in readiness) ||
              typeof readiness.ready !== 'boolean'
            ) {
              current.state = undefined;
              return;
            }
            if (
              current.stream.activeStream &&
              current.stream.activeStream !== event.streamId &&
              timestamp <= current.stream.lastSourceTime
            )
              return;
            // Keep admission history when usable readiness is invalidated. A malformed
            // publication must never allow an older ready sample or retired boot back in.
            if (admitEnvelope(current.stream, event, 'state', now) === 'rejected') {
              if (current.stream.trackingExhausted) current.state = undefined;
              return;
            }
            current.state = {
              timestamp,
              sequence: event.sequence,
              revision: event.revision,
              contentHash: event.contentHash,
              connected: event.connected,
              configurationAccepted: readiness.configurationAccepted,
              hardwareAvailable: readiness.hardwareAvailable,
              ready:
                event.connected &&
                readiness.configurationAccepted &&
                readiness.hardwareAvailable &&
                event.revision !== null &&
                event.revision > 0 &&
                event.contentHash !== null &&
                readiness.ready,
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
