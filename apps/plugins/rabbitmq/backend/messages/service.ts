import type {
  AuthenticatedRequest,
  AuthenticatedUser,
  PluginContext,
  PluginMqttSubscription,
} from '@attraccess/plugins-backend-sdk';
import { Auth } from '@attraccess/plugins-backend-sdk';
import {
  Body,
  Controller,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { finalize, Observable, share } from 'rxjs';
import { requireMqttServerConfig } from '../management/config';
import { RABBITMQ_MANAGE_PERMISSION } from '../permissions';
import { recordMessageAudit } from './audit';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

export const MESSAGES_LIVE_TOPIC = 'messages';

// Payloads above this are cut; `size` still reports the real length.
export const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_PUBLISH_PAYLOAD_BYTES = 256 * 1024;
const MAX_TOPIC_BYTES = 1024;
const MAX_FILTER_BYTES = 256;
// Messages are batched and flushed on this interval. At most MAX_BATCH go out
// per flush and at most MAX_PENDING wait for it; the rest is dropped and
// reported, so a `#` filter on a busy broker cannot flood the browser.
const FLUSH_INTERVAL_MS = 250;
const MAX_BATCH = 50;
const MAX_PENDING = 200;

// Mirrored on the frontend in frontend/src/messages/messages-api.ts.
export interface RabbitmqLiveMessage {
  readonly topic: string;
  // Base64 of the (possibly truncated) payload bytes.
  readonly payload: string;
  // Real payload size in bytes.
  readonly size: number;
  readonly truncated: boolean;
  // Epoch milliseconds.
  readonly receivedAt: number;
}

export type RabbitmqLiveEvent =
  | { readonly eventType: 'messages'; readonly messages: RabbitmqLiveMessage[]; readonly dropped: number }
  | { readonly eventType: 'unavailable' };

export interface PublishRabbitmqMessageDto {
  topic: string;
  payload?: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

// The live-updates identifier is `<serverId>.<base64url(filter)>`: base64url has
// no `/`, `+` or `#`, so any MQTT filter encodes safely.
export function encodeLiveIdentifier(mqttServerId: number, filter: string): string {
  return `${mqttServerId}.${Buffer.from(filter, 'utf8').toString('base64url')}`;
}

export function decodeLiveIdentifier(identifier: string | undefined): { mqttServerId: number; filter: string } | null {
  const match = /^([1-9]\d{0,9})\.([A-Za-z0-9_-]{1,512})$/.exec(identifier ?? '');
  if (!match) return null;
  const filter = Buffer.from(match[2], 'base64url').toString('utf8');
  return validateTopicFilter(filter) ? { mqttServerId: Number(match[1]), filter } : null;
}

// MQTT 3.1.1 §4.7: `+` and `#` must occupy a whole level, `#` only the last.
export function validateTopicFilter(filter: string): boolean {
  if (filter.length === 0 || Buffer.byteLength(filter) > MAX_FILTER_BYTES || filter.includes('\0')) return false;
  const levels = filter.split('/');
  return levels.every((level, index) => {
    if (level === '#') return index === levels.length - 1;
    if (level === '+') return true;
    return !level.includes('#') && !level.includes('+');
  });
}

@Injectable()
export class RabbitmqMessagesService implements OnModuleInit {
  // One MQTT subscription per (server, filter), shared by every viewer and
  // released with the last one.
  private readonly streams = new Map<string, Observable<{ data: RabbitmqLiveEvent }>>();

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    const live = this.context.liveUpdates;
    if (!live) {
      this.context.logger.warn?.(
        'The host has no plugin live-update support: the RabbitMQ message viewer is disabled.',
      );
      return;
    }
    live.register<RabbitmqLiveEvent>({
      topic: MESSAGES_LIVE_TOPIC,
      identifier: 'required',
      authorize: async ({ identifier }, user) => {
        // Identity is the authenticated session, never anything the client sent.
        if (!user.effectivePermissions?.has(RABBITMQ_MANAGE_PERMISSION)) throw new ForbiddenException();
        const target = decodeLiveIdentifier(identifier);
        if (!target) throw new NotFoundException();
        if (!(await this.context.getMqttServerConfig(target.mqttServerId))) throw new NotFoundException();
      },
      source: ({ identifier }, user) => {
        const target = decodeLiveIdentifier(identifier);
        if (!target) throw new NotFoundException();
        void recordMessageAudit(this.context, 'rabbitmq.message_subscribe', user, target.mqttServerId, {
          topic: target.filter.slice(0, 256),
        });
        return this.stream(target.mqttServerId, target.filter);
      },
    });
  }

  async publish(user: AuthenticatedUser, mqttServerId: number, dto: PublishRabbitmqMessageDto): Promise<void> {
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

    await requireMqttServerConfig(this.context, mqttServerId);
    try {
      await this.context.mqtt.publish(mqttServerId, topic, payload, { qos, retain });
    } catch {
      // Broker error text may carry connection details; keep the response generic.
      throw new HttpException('Publishing the message failed.', HttpStatus.BAD_GATEWAY);
    }
    await recordMessageAudit(this.context, 'rabbitmq.message_publish', user, mqttServerId, {
      topic: topic.slice(0, 256),
      size: Buffer.byteLength(payload),
      qos,
      retain,
    });
  }

  private stream(mqttServerId: number, filter: string): Observable<{ data: RabbitmqLiveEvent }> {
    const key = `${mqttServerId}\0${filter}`;
    const existing = this.streams.get(key);
    if (existing) return existing;

    const shared = new Observable<{ data: RabbitmqLiveEvent }>((subscriber) => {
      let released = false;
      let handle: PluginMqttSubscription | undefined;
      let pending: RabbitmqLiveMessage[] = [];
      let dropped = 0;

      const flush = () => {
        if (pending.length === 0 && dropped === 0) return;
        const messages = pending.slice(0, MAX_BATCH);
        dropped += pending.length - messages.length;
        pending = [];
        subscriber.next({ data: { eventType: 'messages', messages, dropped } });
        dropped = 0;
      };
      const timer = setInterval(flush, FLUSH_INTERVAL_MS);

      this.context.mqtt
        .subscribe(mqttServerId, filter, (message) => {
          if (pending.length >= MAX_PENDING) {
            dropped += 1;
            return;
          }
          pending.push({
            topic: message.topic,
            payload: message.payload.subarray(0, MAX_PAYLOAD_BYTES).toString('base64'),
            size: message.payload.length,
            truncated: message.payload.length > MAX_PAYLOAD_BYTES,
            receivedAt: Date.now(),
          });
        })
        .then((subscription) => {
          // The last viewer may have left while the broker was acknowledging.
          if (released) subscription.unsubscribe();
          else handle = subscription;
        })
        .catch(() => subscriber.next({ data: { eventType: 'unavailable' } }));

      return () => {
        released = true;
        clearInterval(timer);
        handle?.unsubscribe();
      };
    }).pipe(
      finalize(() => this.streams.delete(key)),
      share(),
    );
    this.streams.set(key, shared);
    return shared;
  }
}

@Controller('rabbitmq')
export class RabbitmqMessagesController {
  constructor(@Inject(RabbitmqMessagesService) private readonly messages: RabbitmqMessagesService) {}

  @Auth(RABBITMQ_MANAGE_PERMISSION)
  @Post('messages/:mqttServerId/publish')
  publish(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Body() dto: PublishRabbitmqMessageDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.messages.publish(request.user, mqttServerId, dto);
  }
}
