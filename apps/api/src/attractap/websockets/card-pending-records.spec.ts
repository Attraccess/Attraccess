/* eslint-disable @typescript-eslint/no-explicit-any */
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CardKind } from '../card-crypto/card-operations';
import { UID, createRelayReader, createServices, detect } from './card-relay.test-fixture';

/** Recovery records (NFCCardPendingChange): written only when a key write can follow, never duplicated, never stale. */
describe.each<CardKind>(['desfire', 'ntag424'])('recovery records (%s)', (kind) => {
  const OTHER_UID = '04112233445566';
  const enrollmentFor = (userId: number) => ({
    userId,
    auditPrincipal: { userId: 1, authenticationMethod: 'session' as const },
  });
  const resetBy = (cardId: number, actorId = 1) => ({
    cardId,
    auditPrincipal: { userId: actorId, authenticationMethod: 'session' as const },
  });

  async function enrolled() {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const reader = createRelayReader(card, services.conversations);
    expect(await services.operations.enroll(reader.socket, detect(), enrollmentFor(5))).toEqual({ ok: true });
    return { ...services, card };
  }

  it('saves the enrollment record only after the card accepted the master key, before the key write', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const reader = createRelayReader(card, services.conversations);
    const atSave: Array<{ lastApdu: string; key: Buffer }> = [];
    const save = services.operations['pendingRepository'].save;
    save.mockImplementation(async (change: any) => {
      atSave.push({ lastApdu: reader.apdus().at(-1).payload.apdu, key: Buffer.from(card.keys[1]) });
      const saved = { id: 1000, ...change };
      services.pending.push(saved);
      return saved;
    });

    expect(await services.operations.enroll(reader.socket, detect(), enrollmentFor(5))).toEqual({ ok: true });

    expect(atSave).toHaveLength(1);
    // The last APDU before the save is the second half of the master-key login (90 AF ...), not the ChangeKey.
    expect(atSave[0].lastApdu.slice(0, 4)).toBe('90af');
    expect(atSave[0].key.equals(Buffer.alloc(16))).toBe(true);
  });

  it('writes no enrollment record when the master key is refused', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    card.keys[0] = Buffer.alloc(16, 7);
    const reader = createRelayReader(card, services.conversations);

    const result = await services.operations.enroll(reader.socket, detect(), enrollmentFor(5));

    expect(result.ok).toBe(false);
    expect(services.operations['pendingRepository'].save).not.toHaveBeenCalled();
  });

  it('writes no reset record when the master key is refused', async () => {
    const { operations, cards, conversations } = await enrolled();
    const copy = new EmulatedCard(kind);
    copy.keys[0] = Buffer.alloc(16, 7);
    copy.keys[1] = Buffer.alloc(16, 9);
    const reader = createRelayReader(copy, conversations);
    operations['pendingRepository'].save.mockClear();

    expect((await operations.reset(reader.socket, detect(), resetBy(cards[0].id))).ok).toBe(false);
    expect(operations['pendingRepository'].save).not.toHaveBeenCalled();
  });

  it('keeps one reset record per card across failed attempts', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    card.failWritesAfter = 1;

    for (let attempt = 0; attempt < 3; attempt++) {
      const reader = createRelayReader(card, conversations);
      expect((await operations.reset(reader.socket, detect(), resetBy(cards[0].id))).ok).toBe(false);
    }

    expect(pending.filter((change) => change.kind === 'reset')).toHaveLength(1);
  });

  it('drops every reset record of a card that still proves its key', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    pending.push(
      { id: 90, uid: UID, kind: 'reset', cardId: cards[0].id, keyNo: 1, key: null, actorId: 1 },
      { id: 91, uid: UID, kind: 'reset', cardId: cards[0].id, keyNo: 1, key: null, actorId: 1 },
      { id: 92, uid: UID, kind: 'reset', cardId: 4242, keyNo: 1, key: null, actorId: 1 },
    );
    const reader = createRelayReader(card, conversations);

    expect((await operations.verifyCard(reader.socket, 'tap', detect())).ok).toBe(true);
    expect(pending.filter((change) => change.kind === 'reset')).toHaveLength(0);
  });

  it('audits a reset that a later tap finished, for the admin who started it', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    const cardId = cards[0].id;
    // The reset reached the card, nobody heard back.
    card.keys[1] = Buffer.alloc(16);
    card.keyVersions[1] = 0;
    pending.push({ id: 99, uid: UID, kind: 'reset', cardId, keyNo: 1, key: null, actorId: 42 });
    const audit = operations['audit'].recordAttractap;
    audit.mockClear();
    const reader = createRelayReader(card, conversations);

    expect((await operations.verifyCard(reader.socket, 'tap', detect())).ok).toBe(false);

    expect(cards).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'card.unlinked',
        actorId: 42,
        authenticationMethod: 'session',
        subjectId: cardId,
        details: expect.objectContaining({ source: 'reader-recovery' }),
      }),
    );
  });

  it('records an older interrupted enrollment found later without switching off the newer card', async () => {
    const services = createServices();
    const oldCard = new EmulatedCard(kind);
    const interrupted = createRelayReader(oldCard, services.conversations);
    interrupted.dropAfterWrite();
    expect((await services.operations.enroll(interrupted.socket, detect(OTHER_UID), enrollmentFor(5))).ok).toBe(false);
    expect(services.pending).toHaveLength(1);

    const newCard = new EmulatedCard(kind);
    const reader = createRelayReader(newCard, services.conversations);
    expect(await services.operations.enroll(reader.socket, detect(), enrollmentFor(5))).toEqual({ ok: true });
    // The old card's record stays: its key is on that card and only the record can recover it.
    expect(services.pending.map((change) => change.uid)).toEqual([OTHER_UID]);

    // The old card shows up again: it is recorded (so it can be reset) but stays inactive.
    const tap = createRelayReader(oldCard, services.conversations);
    expect(await services.operations.verifyCard(tap.socket, 'tap', detect(OTHER_UID))).toEqual({
      ok: false,
      error: 'CARD_NOT_ACTIVE',
    });
    expect(services.cards.map((card) => [card.uid, card.isActive])).toEqual([
      [UID, true],
      [OTHER_UID, false],
    ]);
    expect(services.pending).toHaveLength(0);
  });

  it('keeps the user’s other enrollment records when one enrollment is recovered', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const first = createRelayReader(card, services.conversations);
    first.dropAfterWrite();
    await services.operations.enroll(first.socket, detect(), enrollmentFor(5));
    services.pending.push({ id: 77, uid: OTHER_UID, kind: 'enroll', userId: 5, keyNo: 1, key: 'x', actorId: 1 });

    const tap = createRelayReader(card, services.conversations);
    expect((await services.operations.verifyCard(tap.socket, 'tap', detect())).ok).toBe(true);

    expect(services.pending.map((change) => change.id)).toEqual([77]);
  });
});
