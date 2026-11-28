import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CardKind } from '../card-crypto/card-operations';
import { UID, createRelayReader, createServices, detect } from './card-relay.test-fixture';

const NTAG213_UID = '04a1b2c3d4e5f6';
const SAK_ULTRALIGHT = 0x00;
const principal = { userId: 5, authenticationMethod: 'session' as const };
const enrollment = { userId: 5, auditPrincipal: principal };

/**
 * Two enrollments of one card at the same moment: both pass the lookup before, the unique index on the UID lets
 * only the first record through. The later one answers as if the lookup had found the card.
 */
describe.each<CardKind>(['desfire', 'ntag424'])('enrollment races on one UID (%s)', (kind) => {
  function setup() {
    const services = createServices();
    const audit = (services.operations as unknown as { audit: { record: jest.Mock } }).audit.record;
    /** The record another reader stored after this attempt's lookup: the lookup still sees nothing. */
    const recordedMeanwhile = (record: Record<string, unknown> = {}) => {
      services.cards.push({ id: 100, uid: UID.toUpperCase(), type: 'aes', keyNo: 3, key: 'other', ...record });
      services.attractapService.getNFCCardByUID.mockResolvedValueOnce(undefined);
    };
    return { ...services, audit, recordedMeanwhile };
  }

  it('answers CARD_ALREADY_ENROLLED, drops its own record and leaves the user’s active card on', async () => {
    const { operations, conversations, cards, pending, audit, attractapService, user, recordedMeanwhile } = setup();
    await attractapService.createNFCCard(user, { uid: 'ffee0001', keyNo: 1, key: 'k' });
    recordedMeanwhile({ user: { id: 9 }, isActive: true });

    const outcome = await operations.enroll(
      createRelayReader(new EmulatedCard(kind), conversations).socket,
      detect(),
      enrollment,
    );

    expect(outcome).toEqual({ ok: false, error: 'CARD_ALREADY_ENROLLED' });
    expect(pending).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
    expect(cards.map((card) => [card.uid, card.isActive])).toEqual([
      ['ffee0001', true],
      [UID.toUpperCase(), true],
    ]);
  });

  it('answers CARD_ALREADY_ENROLLED when the attempt finishes its own interrupted enrollment too late', async () => {
    const { operations, conversations, cards, pending, audit, recordedMeanwhile } = setup();
    const card = new EmulatedCard(kind);
    const interrupted = createRelayReader(card, conversations);
    interrupted.dropAfterWrite();
    expect((await operations.enroll(interrupted.socket, detect(), enrollment)).ok).toBe(false);
    expect(pending).toHaveLength(1);
    recordedMeanwhile({ user: { id: 9 }, isActive: true });

    const outcome = await operations.enroll(createRelayReader(card, conversations).socket, detect(), enrollment);

    expect(outcome).toEqual({ ok: false, error: 'CARD_ALREADY_ENROLLED' });
    expect(pending).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it('a tap that finishes an interrupted enrollment another check recorded meanwhile answers CARD_NOT_FOUND once', async () => {
    const { operations, conversations, cards, pending, audit, user, recordedMeanwhile } = setup();
    const card = new EmulatedCard(kind);
    const interrupted = createRelayReader(card, conversations);
    interrupted.dropAfterWrite();
    await operations.enroll(interrupted.socket, detect(), enrollment);
    const [written] = pending;
    // The winner recorded the same enrollment: its record carries the key on the card.
    recordedMeanwhile({ uid: UID, keyNo: written.keyNo, key: written.key, user, isActive: true });

    const first = await operations.verifyCard(createRelayReader(card, conversations).socket, 'tap', detect());

    expect(first).toEqual({ ok: false, error: 'CARD_NOT_FOUND' });
    expect(pending).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
    const next = await operations.verifyCard(createRelayReader(card, conversations).socket, 'tap', detect());
    expect(next).toMatchObject({ ok: true, card: { id: 100 } });
  });

  it('keeps its own record when storing the card fails for another reason', async () => {
    const { operations, conversations, pending, attractapService } = setup();
    const failure = new Error('database gone');
    attractapService.createNFCCard.mockRejectedValueOnce(failure);

    await expect(
      operations.enroll(createRelayReader(new EmulatedCard(kind), conversations).socket, detect(), enrollment),
    ).rejects.toBe(failure);

    // The key is on the card: the record lets a later tap finish the enrollment.
    expect(pending).toHaveLength(1);
  });
});

describe('UID-only enrollment race', () => {
  it('answers CARD_ALREADY_ENROLLED without auditing or switching the user’s card off', async () => {
    const services = createServices();
    services.settings.uidOnlyAllowed = true;
    const { operations, cards, attractapService, user } = services;
    await attractapService.createNFCCard(user, { uid: 'ffee0001', keyNo: 1, key: 'k' });
    cards.push({ id: 100, uid: NTAG213_UID.toUpperCase(), type: 'uid-only', keyNo: null, key: null, isActive: true });
    attractapService.getNFCCardByUID.mockResolvedValueOnce(undefined);
    const reader = createRelayReader(null, services.conversations);

    const outcome = await operations.enroll(reader.socket, { ...detect(NTAG213_UID), sak: SAK_ULTRALIGHT }, enrollment);

    expect(outcome).toEqual({ ok: false, error: 'CARD_ALREADY_ENROLLED' });
    expect((operations as unknown as { audit: { record: jest.Mock } }).audit.record).not.toHaveBeenCalled();
    expect(cards.map((card) => [card.uid, card.isActive])).toEqual([
      ['ffee0001', true],
      [NTAG213_UID.toUpperCase(), true],
    ]);
  });

  it('lets any other failure of storing the card through', async () => {
    const services = createServices();
    services.settings.uidOnlyAllowed = true;
    const failure = new Error('database gone');
    services.attractapService.createNFCCard.mockRejectedValueOnce(failure);
    const reader = createRelayReader(null, services.conversations);

    await expect(
      services.operations.enroll(reader.socket, { ...detect(NTAG213_UID), sak: SAK_ULTRALIGHT }, enrollment),
    ).rejects.toBe(failure);
  });
});
