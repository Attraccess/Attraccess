import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { READER_UI_INVALIDATE_EVENT } from '../../plugin-system/reader-ui/reader-ui.registry';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { CREDENTIAL_CHANGED_EVENT } from '../security/pairing-model';
import { ReaderRouter } from './reader-router';

/** The name under which an event from another API instance is emitted here. */
export function remoteEvent(name: string): string {
  return `cluster:${name}`;
}

/**
 * Local events whose reader side effects (pushes, disconnects, cached credentials and zones) must happen on the
 * instance holding the reader too. Each listener that serves a reader subscribes to `remoteEvent(name)` as well.
 */
export const RELAYED_READER_EVENTS = [
  ReaderUpdatedEvent.EVENT_NAME,
  ReaderDeletedEvent.EVENT_NAME,
  CREDENTIAL_CHANGED_EVENT,
  READER_UI_INVALIDATE_EVENT,
  'settings.default-language',
] as const;

const MESSAGE = 'reader-event';

/**
 * Carries the events above to the other API instances (ATT-1163). They are emitted there under
 * {@link remoteEvent}, never under their own name: other listeners (audit, plugins) see each event once, on the
 * instance where it happened, and a relayed event is never relayed again.
 */
@Injectable()
export class ReaderEventRelay implements OnModuleInit, OnModuleDestroy {
  private readonly forwarders = new Map<string, (...args: unknown[]) => void>();

  constructor(
    private readonly events: EventEmitter2,
    private readonly router: ReaderRouter,
  ) {}

  onModuleInit(): void {
    if (!this.router.cluster.enabled) return;
    for (const name of RELAYED_READER_EVENTS) {
      const forward = (...args: unknown[]) => void this.router.cluster.bus.broadcast(MESSAGE, { name, args });
      this.forwarders.set(name, forward);
      this.events.on(name, forward);
    }
    this.router.on(MESSAGE, (payload: { name: string; args: unknown[] }) => {
      if (!(RELAYED_READER_EVENTS as readonly string[]).includes(payload.name)) return;
      this.events.emit(remoteEvent(payload.name), ...payload.args);
    });
  }

  onModuleDestroy(): void {
    for (const [name, forward] of this.forwarders) this.events.off(name, forward);
    this.forwarders.clear();
  }
}
