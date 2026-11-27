import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { READER_UI_INVALIDATE_EVENT } from '../../plugin-system/reader-ui/reader-ui.registry';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { CREDENTIAL_CHANGED_EVENT } from '../security/pairing-model';
import { ReaderRouter } from './reader-router';

/** The name under which an event from another API instance is emitted here. */
export function remoteEvent(name: string): string {
  return `cluster:${name}`;
}

const DEFAULT_LANGUAGE_EVENT = 'settings.default-language';

/**
 * Local events whose reader side effects (pushes, disconnects, cached credentials and zones) must happen on the
 * instance holding the reader too. Each listener that serves a reader subscribes to `remoteEvent(name)` as well.
 */
export const RELAYED_READER_EVENTS = [
  ReaderUpdatedEvent.EVENT_NAME,
  ReaderDeletedEvent.EVENT_NAME,
  CREDENTIAL_CHANGED_EVENT,
  READER_UI_INVALIDATE_EVENT,
  DEFAULT_LANGUAGE_EVENT,
] as const;

const MESSAGE = 'reader-event';

/**
 * Carries the events above to the other API instances (ATT-1163). They are emitted there under
 * {@link remoteEvent}, never under their own name: other listeners (audit, plugins) see each event once, on the
 * instance where it happened, and a relayed event is never relayed again.
 *
 * The app has more than one `EventEmitter2` (the app and the Attractap module each import
 * `EventEmitterModule.forRoot()`), and settings and plugins emit on a different one than this module injects.
 * `@OnEvent` handlers are bound to every emitter, so the events are picked up here with `@OnEvent`, not `on()`.
 */
@Injectable()
export class ReaderEventRelay implements OnModuleInit {
  constructor(
    private readonly events: EventEmitter2,
    private readonly router: ReaderRouter,
  ) {}

  onModuleInit(): void {
    if (!this.router.cluster.enabled) return;
    this.router.on(MESSAGE, (payload: { name: string; args: unknown[] }) => {
      if (!(RELAYED_READER_EVENTS as readonly string[]).includes(payload.name)) return;
      this.events.emit(remoteEvent(payload.name), ...payload.args);
    });
  }

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  onReaderUpdated(...args: unknown[]): void {
    this.forward(ReaderUpdatedEvent.EVENT_NAME, args);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  onReaderDeleted(...args: unknown[]): void {
    this.forward(ReaderDeletedEvent.EVENT_NAME, args);
  }

  @OnEvent(CREDENTIAL_CHANGED_EVENT)
  onCredentialChanged(...args: unknown[]): void {
    this.forward(CREDENTIAL_CHANGED_EVENT, args);
  }

  @OnEvent(READER_UI_INVALIDATE_EVENT)
  onReaderUiInvalidated(...args: unknown[]): void {
    this.forward(READER_UI_INVALIDATE_EVENT, args);
  }

  @OnEvent(DEFAULT_LANGUAGE_EVENT)
  onDefaultLanguageChanged(...args: unknown[]): void {
    this.forward(DEFAULT_LANGUAGE_EVENT, args);
  }

  private forward(name: (typeof RELAYED_READER_EVENTS)[number], args: unknown[]): void {
    if (this.router.cluster.enabled) void this.router.cluster.bus.broadcast(MESSAGE, { name, args });
  }
}
