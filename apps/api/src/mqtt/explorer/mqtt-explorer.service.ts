import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { MqttServer } from '@attraccess/database-entities';
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { finalize, Observable, share } from 'rxjs';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { recordAdministrationSafely } from '../../audit/policies/administration';
import { MqttClientService } from '../mqtt-client.service';
import { ExplorerSubscription, MqttExplorerConnectionsService } from './mqtt-explorer-connections.service';
import {
  FLUSH_INTERVAL_MS,
  MAX_BATCH,
  MAX_BATCH_PAYLOAD_CHARS,
  MAX_PAYLOAD_BYTES,
  MAX_PUBLISH_PAYLOAD_BYTES,
  MAX_TOPIC_BYTES,
  MqttExplorerEvent,
  MqttExplorerMessage,
} from './mqtt-explorer.constants';
import { PublishMqttExplorerMessageDto } from './dtos/publish-mqtt-explorer-message.dto';

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

@Injectable()
export class MqttExplorerService {
  private readonly logger = new Logger(MqttExplorerService.name);
  // One broker subscription per (server, filter), shared by every viewer and
  // released with the last one.
  private readonly streams = new Map<string, Observable<{ data: MqttExplorerEvent }>>();

  constructor(
    @InjectRepository(MqttServer) private readonly servers: Repository<MqttServer>,
    private readonly connections: MqttExplorerConnectionsService,
    private readonly mqttClient: MqttClientService,
    private readonly audit: AuditService,
  ) {}

  findServer(mqttServerId: number): Promise<MqttServer | null> {
    return this.servers.findOneBy({ id: mqttServerId });
  }

  /** Opens the stream of messages matching `filter`, and records the subscription. */
  async subscribe(
    user: AuthenticatedUser,
    mqttServerId: number,
    filter: string,
  ): Promise<Observable<{ data: MqttExplorerEvent }>> {
    const server = await this.findServer(mqttServerId);
    if (!server) throw new NotFoundException();
    await this.record(user, 'mqtt_server.message_subscribe', server, { topic: filter.slice(0, 256) });
    return this.stream(mqttServerId, filter);
  }

  async publish(user: AuthenticatedUser, mqttServerId: number, dto: PublishMqttExplorerMessageDto): Promise<void> {
    const topic = dto?.topic;
    if (typeof topic !== 'string' || topic.length === 0 || topic.includes('\0')) {
      throw new HttpException('A topic is required.', HttpStatus.BAD_REQUEST);
    }
    if (/[+#]/.test(topic)) {
      throw new HttpException('The topic must not contain the wildcards + or #.', HttpStatus.BAD_REQUEST);
    }
    if (Buffer.byteLength(topic) > MAX_TOPIC_BYTES) {
      throw new HttpException('The topic is too long.', HttpStatus.BAD_REQUEST);
    }
    const payload = dto.payload ?? '';
    if (typeof payload !== 'string' || Buffer.byteLength(payload) > MAX_PUBLISH_PAYLOAD_BYTES) {
      throw new HttpException('The payload must be a string of at most 256 KiB.', HttpStatus.BAD_REQUEST);
    }
    const qos = dto.qos ?? 0;
    if (qos !== 0 && qos !== 1 && qos !== 2) {
      throw new HttpException('QoS must be 0, 1 or 2.', HttpStatus.BAD_REQUEST);
    }
    const retain = dto.retain === true;

    const server = await this.findServer(mqttServerId);
    if (!server) throw new NotFoundException();
    try {
      // The shared client, so the message behaves like a flow's "send MQTT message" node.
      await this.mqttClient.publish(mqttServerId, topic, payload, { qos, retain });
    } catch {
      // Broker error text may carry connection details; keep the response generic.
      throw new HttpException('Publishing the message failed.', HttpStatus.BAD_GATEWAY);
    }
    await this.record(user, 'mqtt_server.message_publish', server, {
      topic: topic.slice(0, 256),
      size: Buffer.byteLength(payload),
      qos,
      retain: retain ? 1 : 0,
    });
  }

  private async record(
    user: AuthenticatedUser,
    action: string,
    server: MqttServer,
    details: Record<string, string | number>,
  ): Promise<void> {
    // The payload is never recorded. A failing audit sink never fails the request.
    await recordAdministrationSafely(this.audit, {
      action,
      actorId: user.id,
      authenticationMethod: user.authenticationMethod,
      apiTokenId: user.apiTokenId,
      subjectType: 'mqtt-server',
      subjectId: server.id,
      details: { serverName: server.name, ...details },
    });
  }

  private stream(mqttServerId: number, filter: string): Observable<{ data: MqttExplorerEvent }> {
    const key = `${mqttServerId}\0${filter}`;
    const existing = this.streams.get(key);
    if (existing) return existing;

    const shared = new Observable<{ data: MqttExplorerEvent }>((subscriber) => {
      let released = false;
      let handle: ExplorerSubscription | undefined;
      let pending: MqttExplorerMessage[] = [];
      let pendingChars = 0;
      let dropped = 0;

      const flush = () => {
        if (pending.length === 0 && dropped === 0) return;
        const messages = pending;
        pending = [];
        pendingChars = 0;
        subscriber.next({ data: { eventType: 'messages', messages, dropped } });
        dropped = 0;
      };
      const timer = setInterval(flush, FLUSH_INTERVAL_MS);

      this.connections
        .subscribe(mqttServerId, filter, (topic, payload) => {
          const kept = payload.subarray(0, MAX_PAYLOAD_BYTES);
          const chars = base64Length(kept.length);
          if (pending.length >= MAX_BATCH || pendingChars + chars > MAX_BATCH_PAYLOAD_CHARS) {
            dropped += 1;
            return;
          }
          pendingChars += chars;
          pending.push({
            topic,
            payload: kept.toString('base64'),
            size: payload.length,
            truncated: payload.length > MAX_PAYLOAD_BYTES,
            receivedAt: Date.now(),
          });
        })
        .then((subscription) => {
          // The last viewer may have left while the broker was acknowledging.
          if (released) subscription.unsubscribe();
          else handle = subscription;
        })
        .catch((error) => {
          this.logger.warn(`Explorer subscription to server ${mqttServerId} failed: ${error?.message ?? error}`);
          // Error the shared stream so every viewer is told and the next one
          // starts fresh. Broker error text may carry connection details; keep it out.
          if (!released) subscriber.error(new Error('The broker subscription failed.'));
        });

      return () => {
        released = true;
        clearInterval(timer);
        handle?.unsubscribe();
      };
    }).pipe(
      finalize(() => {
        if (this.streams.get(key) === shared) this.streams.delete(key);
      }),
      share(),
    );
    this.streams.set(key, shared);
    return shared;
  }
}
