import {
  PluginBleContext,
  PluginBleSession,
  PluginCardChannel,
  PluginCardsContext,
  PluginPermission,
  createFakeBleHost,
} from '@attraccess/plugins-backend-sdk';
import { EmulatedCard } from '../../attractap/card-crypto/card-emulator.test-fixture';
import { CardKind } from '../../attractap/card-crypto/card-operations';
import { UID } from '../../attractap/websockets/card-relay.test-fixture';
import { registerPluginModuleFixture } from '../plugin.module.plugin-module.test-fixture';
import { PLUGIN_ID, createPluginCardsHost } from './plugin-cards.test-fixture';

const ADDRESS = 'AA:BB:CC:00:00:42';

/**
 * A plugin in miniature that owns an NFC terminal reachable over BLE. Its made-up framing: the plugin writes
 * `[seq, ...apdu]` to the `command` characteristic, the terminal answers with a `[seq, ...answer]` notification.
 */
class NfcTerminalPlugin {
  private readonly profile;

  constructor(
    private readonly ble: PluginBleContext,
    private readonly cards: PluginCardsContext,
  ) {
    this.profile = ble.registerProfile({
      id: 'nfc-terminal',
      services: [
        {
          uuid: 'fff0',
          characteristics: [
            { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 63 },
            { key: 'answer', uuid: 'fff2', operations: ['notify'], maxNotificationBytes: 65 },
          ],
        },
      ],
    });
  }

  pair(readerId: number) {
    return this.ble.createEndpoint({ readerId, address: ADDRESS, addressType: 'public', profileId: this.profile.id });
  }

  /** The terminal reported a card: let the host authenticate it over the BLE link. */
  cardPresented(endpointId: string, uid: string) {
    return this.ble.withSession(endpointId, async (session) =>
      this.cards.authenticate({ uid, device: endpointId, channel: await this.channel(session) }),
    );
  }

  private async channel(session: PluginBleSession): Promise<PluginCardChannel> {
    const answers = await session.subscribe('answer');
    let seq = 0;
    return {
      async exchange(apdu, { signal }) {
        seq = (seq + 1) & 0xff;
        await session.write('command', Uint8Array.of(seq, ...apdu), { signal });
        for (;;) {
          const { value } = await answers.next({ signal });
          if (value[0] === seq) return value.subarray(1);
        }
      },
    };
  }
}

describe.each<CardKind>(['desfire', 'ntag424'])('card authentication over a BLE terminal (%s)', (kind) => {
  const fixture = registerPluginModuleFixture();

  it('authenticates an enrolled card end to end', async () => {
    const services = createPluginCardsHost(fixture.manifest, [
      PluginPermission.BLE_TRANSPORT,
      PluginPermission.CARD_AUTHENTICATION,
    ]);
    const card = await services.enroll(kind);
    const ble = createFakeBleHost();
    ble.addReader({ readerId: 1, name: 'Entrance reader', allowPluginBle: true });
    ble.addPeripheral({
      readerId: 1,
      address: ADDRESS,
      addressType: 'public',
      advertisement: { name: 'NFC terminal', serviceUuids: ['fff0'] },
      characteristics: {
        // The terminal relays the APDU to the card in its field and notifies the answer.
        fff1: {
          onWrite: (frame) => {
            const answer = card.transceive(Buffer.from(frame.subarray(1)));
            ble.notify(ADDRESS, 'fff2', Uint8Array.of(frame[0], ...answer));
          },
        },
        fff2: {},
      },
    });
    const plugin = new NfcTerminalPlugin(ble.contextFor(PLUGIN_ID), services.context.cards);
    const endpoint = await plugin.pair(1);

    const result = await plugin.cardPresented(endpoint.id, UID);

    expect(result).toEqual({ ok: true, card: { id: services.cards[0].id, uid: UID, userId: services.user.id } });
    const writes = ble.transcript.filter((entry) => entry.op === 'write');
    expect(writes.length).toBeGreaterThan(3);
    const key = String(services.cards[0].key).replace('encrypted:', '');
    const onAir = Buffer.concat(writes.map((entry) => Buffer.from(entry.bytes))).toString('hex');
    expect(onAir).not.toContain(key);
    expect(ble.openSessions()).toEqual([]);
    expect(services.conversations.activeConversations).toBe(0);
  });

  it('refuses a card with another key over the same link', async () => {
    const services = createPluginCardsHost(fixture.manifest, [
      PluginPermission.BLE_TRANSPORT,
      PluginPermission.CARD_AUTHENTICATION,
    ]);
    await services.enroll(kind);
    const foreign = new EmulatedCard(kind);
    const ble = createFakeBleHost();
    ble.addReader({ readerId: 1, name: 'Entrance reader', allowPluginBle: true });
    ble.addPeripheral({
      readerId: 1,
      address: ADDRESS,
      addressType: 'public',
      advertisement: {},
      characteristics: {
        fff1: {
          onWrite: (frame) =>
            ble.notify(ADDRESS, 'fff2', Uint8Array.of(frame[0], ...foreign.transceive(Buffer.from(frame.subarray(1))))),
        },
        fff2: {},
      },
    });
    const plugin = new NfcTerminalPlugin(ble.contextFor(PLUGIN_ID), services.context.cards);
    const endpoint = await plugin.pair(1);

    expect(await plugin.cardPresented(endpoint.id, UID)).toEqual({ ok: false, reason: 'CARD_AUTHENTICATION_FAILED' });
  });
});
