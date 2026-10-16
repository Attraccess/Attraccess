import { MqttClient } from 'mqtt';
import { MESSAGE_LIMITS } from '../../../shared/protocol-limits';
import { Transport } from '../runtime';

export class MqttTransport implements Transport {
  private readonly pending = new Set<(error: Error) => void>();
  private recovering = false;
  private staleDiscarded = 0;
  private oversizedRejected = 0;
  private readonly subscribedTopics = new Map<string, number>();
  private acknowledgementTimeouts = 0;

  get statistics() {
    return {
      pending: this.pending.size,
      staleDiscarded: this.staleDiscarded,
      oversizedRejected: this.oversizedRejected,
      acknowledgementTimeouts: this.acknowledgementTimeouts,
    };
  }

  constructor(
    private readonly client: MqttClient,
    private readonly onError: (error: unknown) => void,
  ) {
    // Count a matching oversized wire packet once, regardless of how many
    // callbacks subscribe to its topic. Per-subscription callbacks never decode it.
    client.on('message', (topic: string, payload: Buffer) => {
      if (this.subscribedTopics.has(topic) && payload.length > MESSAGE_LIMITS.configurationBytes)
        this.oversizedRejected = Math.min(Number.MAX_SAFE_INTEGER, this.oversizedRejected + 1);
    });
    client.on('connect', () => {
      this.recovering = false;
    });
    client.on('close', () => {
      this.rejectPending(new Error('MQTT connection closed'));
      this.discardPublications();
    });
  }

  publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void> {
    return this.request('publish', (finish) =>
      this.client.publish(topic, JSON.stringify(payload), { qos: 1, retain: options?.retain ?? false }, finish),
    );
  }

  async subscribe(topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void> {
    const receive = (receivedTopic: string, payload: Buffer) => {
      if (receivedTopic !== topic || payload.length > MESSAGE_LIMITS.configurationBytes) return;
      try {
        void Promise.resolve(listener(payload)).catch(this.onError);
      } catch (error) {
        this.onError(error);
      }
    };
    // Install before SUBACK so a retained message in the same socket read is
    // delivered too. Failed attempts must not leave duplicate listeners behind.
    this.subscribedTopics.set(topic, (this.subscribedTopics.get(topic) ?? 0) + 1);
    this.client.on('message', receive);
    try {
      await this.request('subscribe', (finish) => this.client.subscribe(topic, { qos: 1 }, finish));
    } catch (error) {
      this.client.removeListener('message', receive);
      const remaining = (this.subscribedTopics.get(topic) ?? 1) - 1;
      if (remaining) this.subscribedTopics.set(topic, remaining);
      else this.subscribedTopics.delete(topic);
      throw error;
    }
  }

  private request(operation: string, send: (finish: (error?: Error | null) => void) => void): Promise<void> {
    if (!this.client.connected || this.client.disconnecting || this.recovering)
      return Promise.reject(new Error('MQTT connection unavailable'));

    return new Promise((resolve, reject) => {
      const finish = (error?: Error | null) => {
        if (!this.pending.delete(finish)) return;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        // A live TCP connection can still lose PUBACK/SUBACK. Reject every
        // waiter and close the socket once; MQTT's reconnect loop restores it.
        this.acknowledgementTimeouts = Math.min(Number.MAX_SAFE_INTEGER, this.acknowledgementTimeouts + 1);
        this.recovering = true;
        this.rejectPending(new Error(`MQTT ${operation} acknowledgment timed out`));
        this.discardPublications();
        this.client.stream.destroy();
      }, 10_000);
      this.pending.add(finish);
      try {
        send(finish);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private rejectPending(error: Error): void {
    for (const finish of this.pending) finish(error);
  }

  private discardPublications(): void {
    // MQTT.js otherwise retains QoS 1 publications indefinitely across socket
    // reconnects, replaying stale telemetry and accumulating blocked callbacks.
    for (const [id, packet] of Object.entries(this.client.outgoing)) {
      if (!packet.volatile) {
        this.staleDiscarded = Math.min(Number.MAX_SAFE_INTEGER, this.staleDiscarded + 1);
        this.client.removeOutgoingMessage(Number(id));
      }
    }
  }
}
