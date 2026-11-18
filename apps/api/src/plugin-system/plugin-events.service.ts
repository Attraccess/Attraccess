import {
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventResponse,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import type { PluginResourceModel, PluginUserModel } from '@attraccess/application-models';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

const SYSTEM_EVENT_PREFIX = 'plugin.system.';

/** Only the fields of the neutral model reach plugins: host records carry tokens and contact data. */
function toUserModel(user: PluginUserModel | undefined): PluginUserModel | undefined {
  if (!user) return user;
  return { id: user.id, username: user.username, locale: user.locale, isDisabled: user.isDisabled };
}

function toResourceModel(resource: PluginResourceModel | undefined): PluginResourceModel | undefined {
  if (!resource) return resource;
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    description: resource.description,
    allowTakeOver: resource.allowTakeOver,
    maxParallelSessions: resource.maxParallelSessions,
    supervisionMode: resource.supervisionMode,
  };
}

function toPluginPayload<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): SystemEventPayload[E] {
  if (event !== SystemEvent.RESOURCE_USAGE_STARTED && event !== SystemEvent.RESOURCE_USAGE_ENDED) return payload;
  const usage = payload as SystemEventPayload[SystemEvent.RESOURCE_USAGE_STARTED];
  return { resource: toResourceModel(usage.resource), user: toUserModel(usage.user) } as SystemEventPayload[E];
}

function busName(event: SystemEvent): string {
  return `${SYSTEM_EVENT_PREFIX}${event}`;
}

/**
 * Typed seam between the host application and plugins for SystemEvents. It wraps
 * the shared EventEmitter2, enforcing SystemEvent payload typing on emit and
 * subscribe, and isolates plugin handler errors so a throwing plugin can never
 * break the core flow that emitted the event.
 */
@Injectable()
export class PluginEventsService {
  private readonly logger = new Logger(PluginEventsService.name);

  constructor(private readonly events: EventEmitter2) {}

  /**
   * Emit a typed SystemEvent. Synchronous fire-and-forget; plugin handlers run
   * on the shared bus and any error they throw is swallowed by the wrapper
   * installed in onEvent, so emitting is always safe for the caller.
   */
  public emit<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): void {
    this.events.emit(busName(event), toPluginPayload(event, payload));
  }

  /**
   * Emit a typed SystemEvent and await every handler, collecting their typed
   * responses. Handler errors are isolated and surface as undefined entries.
   */
  public async emitAsync<E extends SystemEvent>(
    event: E,
    payload: SystemEventPayload[E],
  ): Promise<Array<SystemEventResponse[E] | void>> {
    return (await this.events.emitAsync(busName(event), toPluginPayload(event, payload))) as Array<
      SystemEventResponse[E] | void
    >;
  }

  /**
   * Subscribe a typed handler to a SystemEvent. The handler is wrapped so any
   * thrown error or rejected promise is logged and contained, never propagating
   * back to the domain service that emitted the event.
   */
  public onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>): SystemEventSubscription {
    const wrapped = async (payload: SystemEventPayload[E]) => {
      try {
        return await handler(payload);
      } catch (error) {
        this.logger.error(
          `Plugin handler for "${event}" failed; error isolated from core flow`,
          (error as Error).stack,
        );
        return undefined;
      }
    };

    const listener = this.events.on(busName(event), wrapped, { objectify: true }) as { off: () => void };
    return { off: () => listener.off() };
  }
}
