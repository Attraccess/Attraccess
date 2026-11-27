import { Injectable, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule, OnEvent } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { ReaderUpdatedEvent } from '../events';
import { ReaderEventRelay, remoteEvent } from './reader-event-relay';
import { ReaderRouter } from './reader-router';

/** Emits like SettingsService: through the emitter of its own module. */
@Injectable()
class SettingsLike {
  constructor(readonly events: EventEmitter2) {}
}

/** Listens like the reader services: with @OnEvent, for the local and the relayed name. */
@Injectable()
class ReaderListener {
  readonly local = jest.fn();
  readonly remote = jest.fn();

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  onLocal(...args: unknown[]) {
    this.local(...args);
  }

  @OnEvent(remoteEvent(ReaderUpdatedEvent.EVENT_NAME))
  onRemote(...args: unknown[]) {
    this.remote(...args);
  }
}

// The app imports EventEmitterModule.forRoot() in AppModule and again in AttractapModule; reproduce both.
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [SettingsLike, ReaderListener],
  exports: [SettingsLike, ReaderListener],
})
class SettingsLikeModule {}

function routerStub() {
  const handlers = new Map<string, (payload: unknown, from: string) => void>();
  const broadcast = jest.fn(async () => undefined);
  const router = {
    cluster: { enabled: true, bus: { broadcast } },
    on: (type: string, handler: (payload: unknown, from: string) => void) => handlers.set(type, handler),
  };
  return { router, broadcast, deliver: (type: string, payload: unknown) => handlers.get(type)?.(payload, 'other') };
}

async function relayApp() {
  const stub = routerStub();
  @Module({
    imports: [EventEmitterModule.forRoot()],
    providers: [ReaderEventRelay, { provide: ReaderRouter, useValue: stub.router }],
  })
  class AttractapLikeModule {}

  const moduleRef = await Test.createTestingModule({ imports: [SettingsLikeModule, AttractapLikeModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, stub, settings: app.get(SettingsLike), listener: app.get(ReaderListener) };
}

describe('ReaderEventRelay', () => {
  // QA finding (ATT-1163): the default language changed on one instance never reached readers on the others, because
  // the relay listened with on() on its own emitter while settings emit on the app's.
  it('relays an event emitted on another EventEmitter2 of the app', async () => {
    const { app, stub, settings } = await relayApp();

    settings.events.emit('settings.default-language', 'de');

    expect(stub.broadcast).toHaveBeenCalledTimes(1);
    expect(stub.broadcast).toHaveBeenCalledWith('reader-event', { name: 'settings.default-language', args: ['de'] });
    await app.close();
  });

  it('relays each event once and re-emits a relayed one only under its remote name', async () => {
    const { app, stub, listener } = await relayApp();

    stub.deliver('reader-event', { name: ReaderUpdatedEvent.EVENT_NAME, args: [{ readerId: 1 }] });
    stub.deliver('reader-event', { name: 'something.else', args: [] });

    // Delivered once, only under the remote name, and not relayed back.
    expect(listener.remote).toHaveBeenCalledTimes(1);
    expect(listener.remote).toHaveBeenCalledWith({ readerId: 1 });
    expect(listener.local).not.toHaveBeenCalled();
    expect(stub.broadcast).not.toHaveBeenCalled();
    await app.close();
  });
});
