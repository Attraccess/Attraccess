import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CardKind } from '../card-crypto/card-operations';
import { isRandomUid, normalizeCardUid } from '../card-uid';
import { createRelayReader, createServices, detect } from './card-relay.test-fixture';

const NTAG213_UID = '04a1b2c3d4e5f6';
const CLASSIC_UID = '1a2b3c4d';
const SAK_ULTRALIGHT = 0x00;
const SAK_CLASSIC_1K = 0x08;
const SAK_ISO_DEP = 0x20;

const principal = { userId: 5, authenticationMethod: 'session' as const };
const enrollment = { userId: 5, auditPrincipal: principal };
const withSak = (uid: string, sak?: number) => ({ ...detect(uid), ...(sak === undefined ? {} : { sak }) });

function setup(options: { allowed?: boolean } = {}) {
  const services = createServices();
  services.settings.uidOnlyAllowed = options.allowed ?? true;
  const records = () => (services.operations as unknown as { audit: { record: jest.Mock } }).audit.record.mock.calls;
  /** A reader whose card is the given emulated card (cheap cards have none: nothing can be sent to them). */
  const readerFor = (card: EmulatedCard | null) => createRelayReader(card, services.conversations);
  return { ...services, records, readerFor };
}

describe('UID-only cards: enrollment', () => {
  it.each([
    ['an NTAG213 (SAK 0x00)', NTAG213_UID, SAK_ULTRALIGHT],
    ['a MIFARE Classic 1K (SAK 0x08)', CLASSIC_UID, SAK_CLASSIC_1K],
  ])('enrolls %s as a UID-only card without sending the card anything', async (_name, uid, sak) => {
    const { operations, cards, readerFor, records } = setup();
    const reader = readerFor(null);

    const outcome = await operations.enroll(reader.socket, withSak(uid, sak), enrollment);

    expect(outcome).toEqual({ ok: true });
    expect(reader.apdus()).toEqual([]);
    expect(cards).toEqual([expect.objectContaining({ uid, type: 'uid-only', key: null, keyNo: null, isActive: true })]);
    expect(records()).toEqual([
      [
        expect.objectContaining({
          action: 'attractap.card.linked',
          subject: { type: 'attractap.card', id: cards[0].id },
          details: { source: 'reader-enrollment', cardType: 'uid-only' },
        }),
      ],
    ]);
  });

  it("activates the new card like any enrollment and switches the user's other cards off", async () => {
    const { operations, cards, readerFor, attractapService, user } = setup();
    await attractapService.createNFCCard(user, { uid: 'ffeeddcc', keyNo: 1, key: 'k' });

    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);

    expect(cards.map((card) => [card.uid, card.isActive])).toEqual([
      ['ffeeddcc', false],
      [NTAG213_UID, true],
    ]);
  });

  it('enrolls a DESFire EV1 as UID-only after reading its version, and writes nothing to it', async () => {
    const { operations, cards, readerFor } = setup();
    const card = new EmulatedCard('desfire');
    card.hardwareMajor = 0x01;
    const reader = readerFor(card);

    const outcome = await operations.enroll(reader.socket, withSak('04112233445566', SAK_ISO_DEP), enrollment);

    expect(outcome).toEqual({ ok: true });
    expect(cards).toEqual([expect.objectContaining({ type: 'uid-only' })]);
    expect(card.keys.every((key) => key.equals(Buffer.alloc(16)))).toBe(true);
    expect(card.appExists).toBe(false);
  });

  it.each<CardKind>(['ntag424', 'desfire'])(
    'still enrolls a secure %s card securely while the setting is on',
    async (kind) => {
      const { operations, cards, readerFor } = setup();
      const card = new EmulatedCard(kind);

      const outcome = await operations.enroll(
        readerFor(card).socket,
        withSak('04aabbccddee80', SAK_ISO_DEP),
        enrollment,
      );

      expect(outcome).toEqual({ ok: true });
      expect(cards).toEqual([expect.objectContaining({ type: 'aes', keyNo: 1 })]);
      expect(cards[0].key).toMatch(/^[0-9a-f]{32}$/);
    },
  );

  it('never falls back to UID-only when the secure enrollment of an AES card fails', async () => {
    const { operations, cards, readerFor } = setup();
    const card = new EmulatedCard('ntag424');
    card.keys[0] = Buffer.alloc(16, 0x42); // not factory: the master key login is refused

    const outcome = await operations.enroll(readerFor(card).socket, withSak('04aabbccddee80', SAK_ISO_DEP), enrollment);

    expect(outcome).toEqual({ ok: false, error: 'CARD_NOT_FACTORY' });
    expect(cards).toEqual([]);
  });

  it('refuses a UID-only-capable card with CARD_NOT_SUPPORTED while the setting is off', async () => {
    const { operations, cards, readerFor } = setup({ allowed: false });
    const ev1 = new EmulatedCard('desfire');
    ev1.hardwareMajor = 0x01;

    expect(await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment)).toEqual({
      ok: false,
      error: 'CARD_NOT_SUPPORTED',
    });
    expect(await operations.enroll(readerFor(ev1).socket, withSak('04112233445566', SAK_ISO_DEP), enrollment)).toEqual({
      ok: false,
      error: 'CARD_NOT_SUPPORTED',
    });
    expect(cards).toEqual([]);
  });

  it('reads the setting when the card arrives, not when the enrollment was armed', async () => {
    const { operations, cards, readerFor, settings } = setup({ allowed: true });
    settings.uidOnlyAllowed = false; // turned off after arming, before the tap
    const reader = readerFor(null);
    expect(await operations.enroll(reader.socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment)).toEqual({
      ok: false,
      error: 'CARD_NOT_SUPPORTED',
    });
    settings.uidOnlyAllowed = true; // and on again
    expect(await operations.enroll(reader.socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment)).toEqual({
      ok: true,
    });
    expect(cards).toHaveLength(1);
  });

  it('refuses a reader that reports no SAK: it cannot tell the card type, so it behaves as before', async () => {
    const { operations, cards, readerFor } = setup();
    const ev1 = new EmulatedCard('desfire');
    ev1.hardwareMajor = 0x01;

    expect(await operations.enroll(readerFor(ev1).socket, withSak('04112233445566'), enrollment)).toEqual({
      ok: false,
      error: 'CARD_NOT_SUPPORTED',
    });
    expect(cards).toEqual([]);
  });

  it.each(['08aabbcc', '08AABBCC'])('refuses the random UID %s', async (uid) => {
    const { operations, cards, readerFor } = setup();

    expect(await operations.enroll(readerFor(null).socket, withSak(uid, SAK_CLASSIC_1K), enrollment)).toEqual({
      ok: false,
      error: 'RANDOM_UID_NOT_SUPPORTED',
    });
    expect(cards).toEqual([]);
  });

  it('does not take a 7-byte UID that starts with 0x08 for a random one', async () => {
    const { operations, readerFor } = setup();
    expect(
      await operations.enroll(readerFor(null).socket, withSak('08aabbccddeeff', SAK_ULTRALIGHT), enrollment),
    ).toEqual({
      ok: true,
    });
  });

  it('refuses a UID that already has a record', async () => {
    const { operations, readerFor } = setup();
    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);

    expect(await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment)).toEqual({
      ok: false,
      error: 'CARD_ALREADY_ENROLLED',
    });
  });
});

describe('UID-only cards: taps, supervisor cards and mass introduction', () => {
  async function enrolledUidOnly(options: { allowed?: boolean } = {}) {
    const context = setup(options);
    await context.operations.enroll(context.readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);
    return context;
  }

  it.each(['tap', 'supervisor', 'mass-introduction'] as const)(
    'accepts the card on its UID for a %s',
    async (purpose) => {
      const { operations, readerFor } = await enrolledUidOnly();
      const reader = readerFor(null);

      const verified = await operations.verifyCard(reader.socket, purpose, withSak(NTAG213_UID, SAK_ULTRALIGHT));

      expect(verified.ok).toBe(true);
      expect(verified.card.user.id).toBe(5);
      expect(reader.apdus()).toEqual([]);
    },
  );

  it.each(['tap', 'supervisor', 'mass-introduction'] as const)(
    'refuses the card with UID_ONLY_CARDS_DISABLED for a %s while the setting is off, and works again when it is back on',
    async (purpose) => {
      const { operations, readerFor, settings } = await enrolledUidOnly();
      settings.uidOnlyAllowed = false;

      expect(
        await operations.verifyCard(readerFor(null).socket, purpose, withSak(NTAG213_UID, SAK_ULTRALIGHT)),
      ).toEqual({
        ok: false,
        error: 'UID_ONLY_CARDS_DISABLED',
      });

      settings.uidOnlyAllowed = true;
      expect(
        (await operations.verifyCard(readerFor(null).socket, purpose, withSak(NTAG213_UID, SAK_ULTRALIGHT))).ok,
      ).toBe(true);
    },
  );

  it('keeps the record while the setting is off', async () => {
    const { cards, settings } = await enrolledUidOnly();
    settings.uidOnlyAllowed = false;
    expect(cards).toEqual([expect.objectContaining({ uid: NTAG213_UID, type: 'uid-only' })]);
  });

  it('still refuses an inactive UID-only card as not active', async () => {
    const { operations, readerFor, cards } = await enrolledUidOnly();
    cards[0].isActive = false;

    expect(await operations.verifyCard(readerFor(null).socket, 'tap', withSak(NTAG213_UID, SAK_ULTRALIGHT))).toEqual({
      ok: false,
      error: 'CARD_NOT_ACTIVE',
    });
  });

  it.each([
    ['a cheap card that copied the UID (no ISO 14443-4)', SAK_ULTRALIGHT],
    ['a MIFARE Classic with the same UID', SAK_CLASSIC_1K],
  ])('refuses %s on a secure record without sending it anything', async (_name, sak) => {
    const context = setup();
    const secure = new EmulatedCard('ntag424');
    await context.operations.enroll(
      context.readerFor(secure).socket,
      withSak('04aabbccddee80', SAK_ISO_DEP),
      enrollment,
    );
    const reader = context.readerFor(null);

    const verified = await context.operations.verifyCard(reader.socket, 'tap', withSak('04aabbccddee80', sak));

    expect(verified).toEqual({ ok: false, error: 'CARD_AUTHENTICATION_FAILED' });
    expect(reader.apdus()).toEqual([]);
  });

  it('keeps proving a secure record with its key, whatever the setting says', async () => {
    const context = setup({ allowed: false });
    const secure = new EmulatedCard('ntag424');
    const reader = context.readerFor(secure);
    await context.operations.enroll(reader.socket, withSak('04aabbccddee80', SAK_ISO_DEP), enrollment);

    expect((await context.operations.verifyCard(reader.socket, 'tap', withSak('04aabbccddee80', SAK_ISO_DEP))).ok).toBe(
      true,
    );
  });
});

describe('UID-only cards: plugin devices', () => {
  const pluginRequest = (uid: string, exchange = jest.fn()) => ({
    pluginId: 'p'.repeat(21),
    device: 'door',
    uid,
    exchange,
  });

  it('accepts a UID-only card on its UID while the setting is on, without any APDU, and hands the plugin only id, UID and owner', async () => {
    const { operations, readerFor, cards } = setup();
    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);
    const exchange = jest.fn();

    const result = await operations.verifyPluginCard(pluginRequest(NTAG213_UID.toUpperCase(), exchange));

    expect(result).toEqual({ ok: true, card: { id: cards[0].id, uid: NTAG213_UID, userId: 5 } });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('answers CARD_NOT_SUPPORTED while the setting is off', async () => {
    const { operations, readerFor, settings } = setup();
    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);
    settings.uidOnlyAllowed = false;

    expect(await operations.verifyPluginCard(pluginRequest(NTAG213_UID))).toEqual({
      ok: false,
      reason: 'CARD_NOT_SUPPORTED',
    });
  });

  it('answers CARD_NOT_ACTIVE for an inactive UID-only card', async () => {
    const { operations, readerFor, cards } = setup();
    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);
    cards[0].isActive = false;

    expect(await operations.verifyPluginCard(pluginRequest(NTAG213_UID))).toEqual({
      ok: false,
      reason: 'CARD_NOT_ACTIVE',
    });
  });
});

describe('UID-only cards: removal', () => {
  it('refuses to reset one through a reader', async () => {
    const { operations, readerFor, cards } = setup();
    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);

    const outcome = await operations.reset(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), {
      cardId: cards[0].id,
      auditPrincipal: principal,
    });

    expect(outcome).toEqual({ ok: false, error: 'CARD_IS_UID_ONLY' });
    expect(cards).toHaveLength(1);
  });

  it('deletes one without a reader and audits it as attractap.card.unlinked from uid-only-delete', async () => {
    const { operations, readerFor, cards, records, attractapService } = setup();
    await operations.enroll(readerFor(null).socket, withSak(NTAG213_UID, SAK_ULTRALIGHT), enrollment);
    const card = await attractapService.getNFCCardByID(cards[0].id);
    records().length = 0;

    expect(await operations.deleteUidOnlyCard(card, principal)).toBe(true);

    expect(cards).toEqual([]);
    expect(records()).toEqual([
      [
        expect.objectContaining({
          action: 'attractap.card.unlinked',
          actor: { id: 5, authenticationMethod: 'session' },
          subject: { type: 'attractap.card', id: card.id },
          details: { source: 'uid-only-delete' },
        }),
      ],
    ]);
  });
});

describe('card UIDs', () => {
  it('compares in one normalised form', () => {
    expect(normalizeCardUid('04A1B2C3')).toBe('04a1b2c3');
  });

  it.each([
    ['08aabbcc', true],
    ['08AABBCC', true],
    ['09aabbcc', false],
    ['08aabbccddeeff', false],
    ['04aabbcc', false],
  ])('knows that %s is a random UID: %s', (uid, expected) => {
    expect(isRandomUid(uid)).toBe(expected);
  });
});
