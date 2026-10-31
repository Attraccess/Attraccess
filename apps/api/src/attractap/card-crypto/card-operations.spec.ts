import { EmulatedCard } from './card-emulator.test-fixture';
import {
  CardChannel,
  CardKind,
  FACTORY_KEY,
  KEY_VERSION_ENROLLED,
  authenticate,
  changeKeyAndVerify,
  detectCardKind,
  findFreeKeyNo,
} from './card-operations';

const channelFor = (card: EmulatedCard): CardChannel & { sent: Buffer[] } => {
  const sent: Buffer[] = [];
  return {
    uid: '04aabbccddee80',
    sent,
    exchange: async (apdu) => {
      sent.push(apdu);
      return card.transceive(apdu);
    },
  };
};

/** A factory DESFire has no Attraccess application until enrollment looks for a free slot. */
const prepared = async (kind: CardKind, setup?: (card: EmulatedCard) => void) => {
  const card = new EmulatedCard(kind);
  const channel = channelFor(card);
  await findFreeKeyNo(channel, kind);
  setup?.(card);
  return { card, channel };
};

const key = (fill: number) => Buffer.alloc(16, fill);

describe.each<CardKind>(['desfire', 'ntag424'])('card operations (%s)', (kind) => {
  it('detects the card kind', async () => {
    expect(await detectCardKind(channelFor(new EmulatedCard(kind)))).toEqual({ ok: true, kind });
  });

  it('refuses DESFire EV1', async () => {
    if (kind !== 'desfire') return;
    const card = new EmulatedCard(kind);
    card.hardwareMajor = 0x01;
    expect(await detectCardKind(channelFor(card))).toEqual({ ok: false, reason: 'desfire-ev1' });
  });

  it('enrolls into the first free slot and proves the new key', async () => {
    const card = new EmulatedCard(kind);
    const channel = channelFor(card);
    const keyNo = await findFreeKeyNo(channel, kind);
    expect(keyNo).toBe(1);
    expect(
      await changeKeyAndVerify(channel, kind, keyNo as number, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED),
    ).toBe('done');
    expect(await authenticate(channel, kind, 1, key(7))).not.toBeNull();
    expect(await authenticate(channel, kind, 1, key(8))).toBeNull();
  });

  it('picks the next slot when the first is taken', async () => {
    const { channel } = await prepared(kind);
    await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED);
    expect(await findFreeKeyNo(channel, kind)).toBe(2);
  });

  it('resets a card back to the factory key', async () => {
    const { channel } = await prepared(kind);
    await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED);
    expect(await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, key(7), FACTORY_KEY, 0)).toBe('done');
    expect(await authenticate(channel, kind, 1, FACTORY_KEY)).not.toBeNull();
  });

  it('does not report done when the card write fails', async () => {
    const { channel } = await prepared(kind, (card) => (card.failWritesAfter = 0));
    expect(await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED)).toBe(
      'not-confirmed',
    );
  });

  it.each(['no-proof', 'wrong-rotation'] as const)('rejects a card that misbehaves (%s)', async (misbehaviour) => {
    const { card, channel } = await prepared(kind);
    await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED);
    card.misbehaviour = misbehaviour;
    expect(await authenticate(channel, kind, 1, key(7))).toBeNull();
  });

  it('does not trust a forged success for the key write', async () => {
    const { card, channel } = await prepared(kind, (c) => (c.misbehaviour = 'forge-bare-success'));
    expect(await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED)).not.toBe(
      'done',
    );
    expect(card.keys[1].equals(FACTORY_KEY)).toBe(true);
  });

  it('keeps every command within the PN532 buffer', async () => {
    const card = new EmulatedCard(kind);
    const channel = channelFor(card);
    await findFreeKeyNo(channel, kind);
    await changeKeyAndVerify(channel, kind, 1, FACTORY_KEY, FACTORY_KEY, key(7), KEY_VERSION_ENROLLED);
    expect(Math.max(...channel.sent.map((apdu) => apdu.length))).toBeLessThanOrEqual(62);
  });
});

describe('card kind detection (NFC::detectCardType)', () => {
  /** A channel that answers GetVersion with `first` and everything else with an ISO error. */
  const answering = (first: Buffer): CardChannel & { sent: Buffer[] } => {
    const sent: Buffer[] = [];
    return {
      uid: '04aabbccddee80',
      sent,
      exchange: async (apdu) => {
        sent.push(apdu);
        return sent.length === 1 ? first : Buffer.from([0x91, 0xaf]);
      },
    };
  };

  it.each([
    ['another vendor', Buffer.from([0x05, 0x01, 0x01, 0x12, 0x00, 0x1a, 0x05, 0x91, 0xaf])],
    ['a short answer', Buffer.from([0x04, 0x01, 0x91, 0xaf])],
    ['an error status only', Buffer.from([0x6a, 0x82])],
    ['an unknown NXP hardware type', Buffer.from([0x04, 0x07, 0x01, 0x12, 0x00, 0x1a, 0x05, 0x91, 0xaf])],
  ])('treats %s like the firmware: NTAG 424 path', async (_name, first) => {
    const channel = answering(first);

    expect(await detectCardKind(channel)).toEqual({ ok: true, kind: 'ntag424' });
    // Still the three GetVersion frames the firmware sends.
    expect(channel.sent.map((apdu) => apdu.toString('hex'))).toEqual(['9060000000', '90af000000', '90af000000']);
  });

  it('takes the DESFire path only for NXP DESFire EV2 and newer', async () => {
    expect(
      await detectCardKind(answering(Buffer.from([0x04, 0x01, 0x01, 0x30, 0x00, 0x1a, 0x05, 0x91, 0xaf]))),
    ).toEqual({ ok: true, kind: 'desfire' });
    expect(
      await detectCardKind(answering(Buffer.from([0x04, 0x01, 0x01, 0x01, 0x00, 0x1a, 0x05, 0x91, 0xaf]))),
    ).toEqual({ ok: false, reason: 'desfire-ev1' });
  });
});

describe('changeKeyAndVerify beforeWrite hook', () => {
  it('runs after the master key login and before the key write', async () => {
    const card = new EmulatedCard('ntag424');
    const channel = channelFor(card);
    let sentBeforeHook = -1;

    const outcome = await changeKeyAndVerify(channel, 'ntag424', 1, FACTORY_KEY, FACTORY_KEY, key(7), 1, undefined, {
      beforeWrite: async () => {
        sentBeforeHook = channel.sent.length;
      },
    });

    expect(outcome).toBe('done');
    // ISOSelect + both AuthenticateEV2First parts went out, the ChangeKey (0xC4) did not yet.
    expect(sentBeforeHook).toBe(3);
    expect(channel.sent[3][1]).toBe(0xc4);
  });

  it('does not run when the master key is refused', async () => {
    const card = new EmulatedCard('ntag424');
    card.keys[0] = key(9);
    const beforeWrite = jest.fn();

    expect(
      await changeKeyAndVerify(channelFor(card), 'ntag424', 1, FACTORY_KEY, FACTORY_KEY, key(7), 1, undefined, {
        beforeWrite,
      }),
    ).toBe('master-refused');
    expect(beforeWrite).not.toHaveBeenCalled();
  });
});
