import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { hasControlCharacter } from '@attraccess/shared';
import { MqttServer } from '@attraccess/database-entities';
import { HttpException, HttpStatus, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { finalize, Observable, share } from 'rxjs';
import { In, Repository } from 'typeorm';
import { AUDIT_RECORDER, auditActorOf, AuditRecorder } from '../../audit/recorder/audit-event';
import { MqttClientService } from '../mqtt-client.service';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import {
  ExplorerConnectionReset,
  ExplorerFailureCause,
  ExplorerSubscription,
  MqttExplorerConnectionsService,
} from './mqtt-explorer-connections.service';
import { ExpiringKeys, UserViewLimiter, ViewSlot } from './mqtt-explorer-limits';
import {
  FAILURE_COOL_DOWN_MS,
  FLUSH_INTERVAL_MS,
  isPublishableTopic,
  MAX_AUDIT_TEXT_LENGTH,
  MAX_BATCH,
  MAX_BATCH_PAYLOAD_CHARS,
  MAX_PAYLOAD_BYTES,
  MAX_PUBLISH_PAYLOAD_BYTES,
  MAX_REMEMBERED_KEYS,
  MAX_TOPIC_BYTES,
  MAX_VIEWS_PER_USER,
  MqttExplorerEvent,
  MqttExplorerMessage,
  PUBLISH_ACK_TIMEOUT_SECONDS,
  SUBSCRIBE_AUDIT_WINDOW_MS,
  utf8ByteLength,
} from './mqtt-explorer.constants';
import { PublishMqttExplorerMessageDto } from './dtos/publish-mqtt-explorer-message.dto';

type Qos = 0 | 1 | 2;
type ExplorerStream = Observable<{ data: MqttExplorerEvent }>;

// A slot taken by subscribe() whose stream is never subscribed (the live
// connection closed meanwhile) is given back after this long.
const UNCLAIMED_VIEW_MS = 10_000;

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

const isQos = (value: unknown): value is Qos => value === 0 || value === 1 || value === 2;

/**
 * Fits a value into an audit text field (at most MAX_AUDIT_TEXT_LENGTH UTF-16
 * units, no control characters), which otherwise drops the whole record.
 * Control characters become U+FFFD; a surrogate pair is never split.
 */
export function auditText(value: string): string {
  let result = '';
  for (const character of value) {
    const next = hasControlCharacter(character) ? '\uFFFD' : character;
    if (result.length + next.length > MAX_AUDIT_TEXT_LENGTH) break;
    result += next;
  }
  return result;
}

@Injectable()
export class MqttExplorerService {
  // One broker subscription per (server, filter), shared by every viewer and
  // released with the last one.
  private readonly streams = new Map<string, ExplorerStream>();
  private readonly views = new UserViewLimiter(MAX_VIEWS_PER_USER);
  // (server, filter) whose broker connection or subscription failed recently.
  private readonly recentFailures = new ExpiringKeys(FAILURE_COOL_DOWN_MS, MAX_REMEMBERED_KEYS);
  // (user, server, filter) whose subscription was audited recently.
  private readonly recentSubscribeAudits = new ExpiringKeys(SUBSCRIBE_AUDIT_WINDOW_MS, MAX_REMEMBERED_KEYS);

  constructor(
    @InjectRepository(MqttServer) private readonly servers: Repository<MqttServer>,
    private readonly connections: MqttExplorerConnectionsService,
    private readonly mqttClient: MqttClientService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  findServer(mqttServerId: number): Promise<MqttServer | null> {
    return this.servers.findOneBy({ id: mqttServerId });
  }

  /** The ids among `mqttServerIds` that exist, in one query. */
  async existingServerIds(mqttServerIds: readonly number[]): Promise<Set<number>> {
    const ids = [...new Set(mqttServerIds)];
    if (ids.length === 0) return new Set();
    const servers = await this.servers.find({ where: { id: In(ids) }, select: { id: true } });
    return new Set(servers.map((server) => server.id));
  }

  /**
   * Opens the stream of messages matching `filter`, and records the subscription.
   * Refused (without an audit record) while the user has MAX_VIEWS_PER_USER
   * views open, or within FAILURE_COOL_DOWN_MS of a failure for this filter.
   */
  async subscribe(user: AuthenticatedUser, mqttServerId: number, filter: string): Promise<ExplorerStream> {
    const server = await this.findServer(mqttServerId);
    if (!server) throw new NotFoundException();
    const key = JSON.stringify([mqttServerId, filter]);
    if (this.recentFailures.has(key)) {
      throw new HttpException('The broker subscription failed recently.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const slot = this.views.reserve(user.id);
    if (!slot) throw new HttpException('Too many message explorers are open.', HttpStatus.TOO_MANY_REQUESTS);
    // A re-sent subscription (renewal, pause/resume, reload) is not a new event worth a record.
    const auditKey = JSON.stringify([user.id, mqttServerId, filter]);
    if (!this.recentSubscribeAudits.has(auditKey)) {
      this.recentSubscribeAudits.add(auditKey);
      await this.record(user, 'mqtt_server.message_subscribe', server, { topic: filter });
    }
    return this.counted(user.id, slot, () => this.stream(key, mqttServerId, filter));
  }

  /** A changed server gets a fresh start: its failures are not held against the new settings. */
  @OnEvent(MqttServerChangedEvent.EVENT_NAME)
  onServerChanged(event: MqttServerChangedEvent): void {
    // Keys are JSON.stringify([serverId, filter]).
    this.recentFailures.deleteWhere((key) => key.startsWith(`[${event.serverId},`));
  }

  async publish(user: AuthenticatedUser, mqttServerId: number, dto: PublishMqttExplorerMessageDto): Promise<void> {
    const { topic, payload } = this.validatePublish(dto);
    const server = await this.findServer(mqttServerId);
    if (!server) throw new NotFoundException();
    // Like a flow's "send MQTT message" node, the server's defaults apply.
    const qos: Qos = isQos(dto.qos) ? dto.qos : isQos(server.defaultPublishQos) ? server.defaultPublishQos : 0;
    const retain = typeof dto.retain === 'boolean' ? dto.retain : server.defaultPublishRetain === true;
    try {
      // The shared client, so the message behaves like a flow's "send MQTT message" node.
      await this.mqttClient.publish(
        mqttServerId,
        topic,
        payload,
        { qos, retain },
        { acknowledgementTimeoutSeconds: PUBLISH_ACK_TIMEOUT_SECONDS },
      );
    } catch {
      // Broker error text may carry connection details; keep the response generic.
      throw new HttpException('Publishing the message failed.', HttpStatus.BAD_GATEWAY);
    }
    await this.record(user, 'mqtt_server.message_publish', server, {
      topic,
      size: utf8ByteLength(payload),
      qos,
      retain: retain ? 1 : 0,
    });
  }

  private validatePublish(dto: PublishMqttExplorerMessageDto): { topic: string; payload: string } {
    const topic = dto?.topic;
    if (typeof topic !== 'string' || topic.length === 0) {
      throw new HttpException('A topic is required.', HttpStatus.BAD_REQUEST);
    }
    if (/[+#]/.test(topic)) {
      throw new HttpException('The topic must not contain the wildcards + or #.', HttpStatus.BAD_REQUEST);
    }
    if (utf8ByteLength(topic) > MAX_TOPIC_BYTES) {
      throw new HttpException('The topic is too long.', HttpStatus.BAD_REQUEST);
    }
    if (!isPublishableTopic(topic)) {
      throw new HttpException('The topic must not contain control characters.', HttpStatus.BAD_REQUEST);
    }
    const payload = dto.payload ?? '';
    if (typeof payload !== 'string' || utf8ByteLength(payload) > MAX_PUBLISH_PAYLOAD_BYTES) {
      throw new HttpException('The payload must be a string of at most 256 KiB.', HttpStatus.BAD_REQUEST);
    }
    if (dto.qos !== undefined && !isQos(dto.qos)) {
      throw new HttpException('QoS must be 0, 1 or 2.', HttpStatus.BAD_REQUEST);
    }
    return { topic, payload };
  }

  private async record(
    user: AuthenticatedUser,
    action: 'mqtt_server.message_subscribe' | 'mqtt_server.message_publish',
    server: MqttServer,
    details: Record<string, string | number>,
  ): Promise<void> {
    const fields: Record<string, string | number> = { serverName: server.name, ...details };
    for (const [name, value] of Object.entries(fields)) {
      if (typeof value === 'string') fields[name] = auditText(value);
    }
    // The payload is never recorded. A failing audit sink never fails the request.
    await this.audit.record({
      domain: 'administration',
      action,
      actor: auditActorOf(user),
      subject: { type: 'mqtt-server', id: server.id },
      details: fields,
    });
  }

  /** Holds the user's view slot while the stream is watched. */
  private counted(userId: number, slot: ViewSlot, open: () => ExplorerStream): ExplorerStream {
    let unclaimed: ViewSlot | undefined = slot;
    const expiry = setTimeout(() => {
      unclaimed = undefined;
      slot.release();
    }, UNCLAIMED_VIEW_MS);
    expiry.unref?.();
    return new Observable((subscriber) => {
      clearTimeout(expiry);
      const held = unclaimed ?? this.views.reserve(userId);
      unclaimed = undefined;
      if (!held) {
        subscriber.error(new Error('Too many message explorers are open.'));
        return undefined;
      }
      // Opened only when watched, so an unclaimed view leaves no stream behind.
      const subscription = open().subscribe(subscriber);
      return () => {
        held.release();
        subscription.unsubscribe();
      };
    });
  }

  private stream(key: string, mqttServerId: number, filter: string): ExplorerStream {
    const existing = this.streams.get(key);
    if (existing) return existing;

    const shared = new Observable<{ data: MqttExplorerEvent }>((subscriber) => {
      let released = false;
      let failed = false;
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

      const fail = (cause: ExplorerFailureCause) => {
        if (failed) return;
        failed = true;
        // A changed server is not a failure: the next viewer connects with the new settings.
        if (cause === 'failed') this.recentFailures.add(key);
        // Error the shared stream so every viewer is told and the next one
        // starts fresh. Broker error text may carry connection details; keep it out.
        if (!released) subscriber.error(new Error('The broker subscription failed.'));
      };

      this.connections
        .subscribe(mqttServerId, filter, {
          onMessage: (topic, payload) => {
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
          },
          onError: fail,
        })
        .then((subscription) => {
          // The last viewer may have left while the broker was acknowledging.
          if (released) {
            subscription.unsubscribe();
            return;
          }
          handle = subscription;
          // An empty batch tells viewers the subscription is live again (e.g. after a retry), even on a quiet topic.
          subscriber.next({ data: { eventType: 'messages', messages: [], dropped: 0 } });
        })
        .catch((error) => fail(error instanceof ExplorerConnectionReset ? 'reset' : 'failed'));

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
