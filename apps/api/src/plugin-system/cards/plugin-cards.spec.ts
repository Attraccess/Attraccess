/* eslint-disable @typescript-eslint/no-explicit-any */
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { EmulatedCard } from '../../attractap/card-crypto/card-emulator.test-fixture';
import { CardKind } from '../../attractap/card-crypto/card-operations';
import { CARD_CONVERSATION_LIMITS } from '../../attractap/websockets/card-conversation.service';
import { UID, createRelayReader, detect } from '../../attractap/websockets/card-relay.test-fixture';
import { registerPluginModuleFixture } from '../plugin.module.plugin-module.test-fixture';
import { PLUGIN_ID, cardChannel, createPluginCardsHost, deepEntries, silentChannel } from './plugin-cards.test-fixture';

const GET_VERSION = Buffer.from([0x90, 0x60, 0, 0, 0]);

describe('context.cards', () => {
  const fixture = registerPluginModuleFixture();
  const host = () => createPluginCardsHost(fixture.manifest, [PluginPermission.CARD_AUTHENTICATION]);

  afterEach(() => jest.useRealTimers());

  it('is guarded by CARD_AUTHENTICATION', () => {
    const { context } = createPluginCardsHost(fixture.manifest, [PluginPermission.BLE_TRANSPORT]);

    expect(() => context.cards).toThrow(PluginPermissionError);
    expect(() => context.cards).toThrow(/CARD_AUTHENTICATION/);
  });

  it('rejects requests a plugin got wrong instead of resolving with a card reason', async () => {
    const { context } = host();

    await expect(context.cards.authenticate({ uid: UID, device: 'd', channel: undefined })).rejects.toThrow(TypeError);
    await expect(
      context.cards.authenticate({ uid: UID, device: '', channel: { exchange: async () => new Uint8Array() } }),
    ).rejects.toThrow(/device/);
    await expect(
      context.cards.authenticate({ uid: UID, device: 'x'.repeat(201), channel: { exchange: async () => null } }),
    ).rejects.toThrow(/device/);
  });

  describe.each<CardKind>(['desfire', 'ntag424'])('with an enrolled %s card', (kind) => {
    it('authenticates the card and hands back only its id, UID and owner', async () => {
      const services = host();
      const card = await services.enroll(kind);
      const storedKey = String(services.cards[0].key).replace('encrypted:', '');
      const channel = cardChannel(card);

      const result = await services.context.cards.authenticate({ uid: UID, device: 'door-1', channel });

      expect(result).toEqual({ ok: true, card: { id: services.cards[0].id, uid: UID, userId: services.user.id } });
      expect(Object.keys(result)).toEqual(['ok', 'card']);
      expect(Object.keys((result as any).card).sort()).toEqual(['id', 'uid', 'userId']);
      const serialized = JSON.stringify(result).toLowerCase();
      expect(serialized).not.toContain(storedKey.toLowerCase());
      for (const key of card.keys) expect(serialized).not.toContain(key.toString('hex'));
      expect(deepEntries(result).every(([, value]) => !Buffer.isBuffer(value) && !(value instanceof Uint8Array))).toBe(
        true,
      );
      // The device only relays: no APDU carries the key.
      const sent = Buffer.concat(channel.apdus.map((apdu) => Buffer.from(apdu))).toString('hex');
      expect(sent).not.toContain(storedKey.toLowerCase());
      expect(channel.apdus.every((apdu) => apdu.length <= 62)).toBe(true);
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('refuses a card with another key behind a copied UID', async () => {
      const services = host();
      await services.enroll(kind);

      const result = await services.context.cards.authenticate({
        uid: UID,
        device: 'door-1',
        channel: cardChannel(new EmulatedCard(kind)),
      });

      expect(result).toEqual({ ok: false, reason: 'CARD_AUTHENTICATION_FAILED' });
    });

    it.each(['no-proof', 'forge-bare-success'] as const)('refuses a tampered proof (%s)', async (misbehaviour) => {
      const services = host();
      const card = await services.enroll(kind);
      const presented = misbehaviour === 'no-proof' ? card : new EmulatedCard(kind);
      presented.misbehaviour = misbehaviour;

      const result = await services.context.cards.authenticate({
        uid: UID,
        device: 'door-1',
        channel: cardChannel(presented),
      });

      expect(result).toEqual({ ok: false, reason: 'CARD_AUTHENTICATION_FAILED' });
    });

    it('reports an inactive card', async () => {
      const services = host();
      const card = await services.enroll(kind);
      services.cards[0].isActive = false;

      const result = await services.context.cards.authenticate({ uid: UID, device: 'd', channel: cardChannel(card) });

      expect(result).toEqual({ ok: false, reason: 'CARD_NOT_ACTIVE' });
    });

    it('finishes an interrupted enrollment, audited with the plugin and without a reader', async () => {
      const services = host();
      const card = new EmulatedCard(kind);
      const first = createRelayReader(card, services.conversations);
      first.dropAfterWrite();
      const interrupted = await services.operations.enroll(first.socket, detect(), {
        userId: services.user.id,
        auditPrincipal: { userId: services.user.id, authenticationMethod: 'session' },
      });
      expect(interrupted.ok).toBe(false);
      expect(services.cards).toHaveLength(0);
      const audit = (services.operations as any).audit.record as jest.Mock;
      audit.mockClear();

      const result = await services.context.cards.authenticate({ uid: UID, device: 'd', channel: cardChannel(card) });

      expect(result).toEqual({ ok: true, card: { id: services.cards[0].id, uid: UID, userId: services.user.id } });
      expect(services.pending).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'attractap.card.linked',
          details: { source: 'plugin-recovery', pluginId: PLUGIN_ID },
        }),
      );
    });

    it('notices that an interrupted reset got through, audited with the plugin', async () => {
      const services = host();
      const card = await services.enroll(kind);
      card.keys[1] = Buffer.alloc(16);
      card.keyVersions[1] = 0;
      services.pending.push({ id: 99, uid: UID, kind: 'reset', cardId: services.cards[0].id, keyNo: 1, key: null });
      const audit = (services.operations as any).audit.record as jest.Mock;
      audit.mockClear();

      const result = await services.context.cards.authenticate({ uid: UID, device: 'd', channel: cardChannel(card) });

      expect(result).toEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
      expect(services.cards).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'attractap.card.unlinked',
          details: { pluginId: PLUGIN_ID, source: 'plugin-recovery' },
        }),
      );
    });
  });

  it('reports an unknown UID without talking to the card', async () => {
    const services = host();
    const channel = { exchange: jest.fn() };

    const result = await services.context.cards.authenticate({ uid: UID, device: 'd', channel });

    expect(result).toEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
    expect(channel.exchange).not.toHaveBeenCalled();
  });

  it.each([['zz11'], ['04'], ['0'.repeat(34)], [42]])('refuses the UID %p', async (uid) => {
    const services = host();
    const channel = { exchange: jest.fn() };

    const result = await services.context.cards.authenticate({ uid: uid as string, device: 'd', channel });

    expect(result).toEqual({ ok: false, reason: 'INVALID_UID' });
    expect(services.attractapService.getNFCCardByUID).not.toHaveBeenCalled();
  });

  it('refuses a DESFire EV1', async () => {
    const services = host();
    services.cards.push({ id: 1, uid: UID, key: '11'.repeat(16), keyNo: 1, user: services.user, isActive: true });
    const card = new EmulatedCard('desfire');
    card.hardwareMajor = 0x10;

    const result = await services.context.cards.authenticate({ uid: UID, device: 'd', channel: cardChannel(card) });

    expect(result).toEqual({ ok: false, reason: 'CARD_NOT_SUPPORTED' });
  });

  describe('conversation', () => {
    it('times out a silent device after 3 s and aborts the exchange signal', async () => {
      const services = host();
      await services.enroll('desfire');
      jest.useFakeTimers();
      const { channel, signals } = silentChannel();

      const result = services.context.cards.authenticate({ uid: UID, device: 'd', channel });
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.exchangeTimeoutMs - 1);
      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      expect(await result).toEqual({ ok: false, reason: 'TIMEOUT' });
      expect(signals[0].aborted).toBe(true);
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('ignores an answer that arrives after the timeout', async () => {
      const services = host();
      const card = await services.enroll('desfire');
      jest.useFakeTimers();
      let late: () => void;
      const exchange = jest.fn((apdu: Uint8Array) => {
        if (exchange.mock.calls.length > 1) return Promise.resolve(new Uint8Array([0x91, 0x00]));
        return new Promise<Uint8Array>((resolve) => {
          late = () => resolve(new Uint8Array(card.transceive(Buffer.from(apdu))));
        });
      });

      const result = services.context.cards.authenticate({ uid: UID, device: 'd', channel: { exchange } });
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.exchangeTimeoutMs);
      expect(await result).toEqual({ ok: false, reason: 'TIMEOUT' });

      late();
      await Promise.resolve();
      expect(exchange).toHaveBeenCalledTimes(1);
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('times out a slow device after 15 s in total', async () => {
      const services = host();
      const card = await services.enroll('ntag424');
      jest.useFakeTimers();
      const exchange = (apdu: Uint8Array) =>
        new Promise<Uint8Array>((resolve) =>
          setTimeout(() => resolve(new Uint8Array(card.transceive(Buffer.from(apdu)))), 2900),
        );

      const result = services.context.cards.authenticate({ uid: UID, device: 'd', channel: { exchange } });
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.conversationTimeoutMs);

      expect(await result).toEqual({ ok: false, reason: 'TIMEOUT' });
    });

    it('stops after 32 exchanges', async () => {
      const services = host();
      const exchange = jest.fn(async () => new Uint8Array([0x91, 0x00]));

      const result = await services.conversations.runForPlugin(
        { pluginId: PLUGIN_ID, device: 'd' },
        UID,
        exchange,
        undefined,
        async (channel) => {
          for (;;) await channel.exchange(GET_VERSION);
        },
      );

      expect(result).toEqual({ ok: false, reason: 'TOO_MANY_EXCHANGES' });
      expect(exchange).toHaveBeenCalledTimes(CARD_CONVERSATION_LIMITS.maxExchanges);
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('reports a failing device', async () => {
      const services = host();
      await services.enroll('desfire');

      const result = await services.context.cards.authenticate({
        uid: UID,
        device: 'd',
        channel: { exchange: async () => Promise.reject(new Error('link lost')) },
      });

      expect(result).toEqual({ ok: false, reason: 'DEVICE_ERROR' });
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('reports a device that throws synchronously', async () => {
      const services = host();
      await services.enroll('desfire');

      const result = await services.context.cards.authenticate({
        uid: UID,
        device: 'd',
        channel: {
          exchange: () => {
            throw new Error('not connected');
          },
        },
      });

      expect(result).toEqual({ ok: false, reason: 'DEVICE_ERROR' });
    });

    it.each([
      ['an oversized answer', new Uint8Array(CARD_CONVERSATION_LIMITS.maxResponseLength + 1)],
      ['a hex string', '9100'],
      ['nothing', undefined],
      ['a plain array', [0x91, 0x00]],
    ])('reports %s as a device error', async (_name, answer) => {
      const services = host();
      await services.enroll('desfire');

      const result = await services.context.cards.authenticate({
        uid: UID,
        device: 'd',
        channel: { exchange: async () => answer as Uint8Array },
      });

      expect(result).toEqual({ ok: false, reason: 'DEVICE_ERROR' });
    });

    it('ends with CARD_REMOVED when the plugin aborts its signal', async () => {
      const services = host();
      await services.enroll('desfire');
      const { channel, signals } = silentChannel();
      const controller = new AbortController();

      const result = services.context.cards.authenticate({ uid: UID, device: 'd', channel, signal: controller.signal });
      await new Promise(setImmediate);
      controller.abort();

      expect(await result).toEqual({ ok: false, reason: 'CARD_REMOVED' });
      expect(signals[0].aborted).toBe(true);
    });

    it('does not start with an already aborted signal', async () => {
      const services = host();
      await services.enroll('desfire');
      const channel = { exchange: jest.fn() };

      const result = await services.context.cards.authenticate({
        uid: UID,
        device: 'd',
        channel,
        signal: AbortSignal.abort(),
      });

      expect(result).toEqual({ ok: false, reason: 'CARD_REMOVED' });
      expect(channel.exchange).not.toHaveBeenCalled();
    });

    it('lets a new request on the same device take over', async () => {
      const services = host();
      const card = await services.enroll('desfire');
      const { channel, signals } = silentChannel();

      const first = services.context.cards.authenticate({ uid: UID, device: 'd', channel });
      await new Promise(setImmediate);
      const second = services.context.cards.authenticate({ uid: UID, device: 'd', channel: cardChannel(card) });

      expect(await first).toEqual({ ok: false, reason: 'CARD_REMOVED' });
      expect(signals[0].aborted).toBe(true);
      expect(await second).toMatchObject({ ok: true });
    });

    it('keeps requests on different devices apart', async () => {
      const services = host();
      const card = await services.enroll('desfire');
      const { channel } = silentChannel();
      const controller = new AbortController();

      const first = services.context.cards.authenticate({ uid: UID, device: 'a', channel, signal: controller.signal });
      await new Promise(setImmediate);
      const second = await services.context.cards.authenticate({ uid: UID, device: 'b', channel: cardChannel(card) });

      expect(second).toMatchObject({ ok: true });
      controller.abort();
      expect(await first).toEqual({ ok: false, reason: 'CARD_REMOVED' });
    });

    it('shares the server-wide limit with reader conversations', async () => {
      const services = host();
      const card = await services.enroll('desfire');
      const readers = Array.from({ length: CARD_CONVERSATION_LIMITS.maxConcurrent - 1 }, (_, index) =>
        createRelayReader(null, services.conversations, 0, { readerId: 1000 + index }),
      );
      const open = readers.map((reader) =>
        services.conversations.run(reader.socket, 'tap', detect(), (channel) => channel.exchange(GET_VERSION)),
      );
      const { channel } = silentChannel();
      const controller = new AbortController();
      const plugin = services.context.cards.authenticate({ uid: UID, device: 'a', channel, signal: controller.signal });
      await new Promise(setImmediate);
      expect(services.conversations.activeConversations).toBe(CARD_CONVERSATION_LIMITS.maxConcurrent);

      expect(await services.context.cards.authenticate({ uid: UID, device: 'b', channel: cardChannel(card) })).toEqual({
        ok: false,
        reason: 'BUSY',
      });
      const extra = createRelayReader(null, services.conversations, 0, { readerId: 1 });
      expect(services.conversations.isBusy(extra.socket)).toBe(true);

      readers.forEach((reader) => services.conversations.abort(reader.socket, 'READER_UNREACHABLE'));
      controller.abort();
      await Promise.all([...open, plugin]);
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('ends with CANCELLED when the plugin is unloaded', async () => {
      const services = host();
      await services.enroll('desfire');
      const { channel, signals } = silentChannel();

      const result = services.context.cards.authenticate({ uid: UID, device: 'd', channel });
      await new Promise(setImmediate);
      services.unloadPlugin('other-plugin');
      expect(signals[0].aborted).toBe(false);
      services.unloadPlugin(PLUGIN_ID);

      expect(await result).toEqual({ ok: false, reason: 'CANCELLED' });
      expect(signals[0].aborted).toBe(true);
      expect(services.conversations.activeConversations).toBe(0);
    });

    it('ends with CANCELLED when the host shuts down', async () => {
      const services = host();
      await services.enroll('desfire');
      const { channel } = silentChannel();

      const result = services.context.cards.authenticate({ uid: UID, device: 'd', channel });
      await new Promise(setImmediate);
      services.conversations.onModuleDestroy();

      expect(await result).toEqual({ ok: false, reason: 'CANCELLED' });
    });

    it('leaves reader conversations alone when a plugin is unloaded', async () => {
      const services = host();
      const reader = createRelayReader(null, services.conversations);
      const tap = services.conversations.run(reader.socket, 'tap', detect(), (channel) =>
        channel.exchange(GET_VERSION),
      );

      services.unloadPlugin(PLUGIN_ID);
      services.conversations.onModuleDestroy();
      expect(services.conversations.activeConversations).toBe(1);

      services.conversations.abort(reader.socket, 'READER_UNREACHABLE');
      expect(await tap).toEqual({ ok: false, reason: 'READER_UNREACHABLE' });
    });
  });
});
