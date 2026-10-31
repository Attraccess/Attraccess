import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CardKind } from '../card-crypto/card-operations';
import { AttractapService } from '../attractap.service';
import { UID, createRelayReader, createServices, detect } from './card-relay.test-fixture';

describe.each<CardKind>(['desfire', 'ntag424'])('card checks on the server (%s)', (kind) => {
  const enrollmentFor = (user: { id: number }) => ({
    userId: user.id,
    auditPrincipal: { userId: user.id, authenticationMethod: 'session' as const },
  });

  async function enrolled() {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const reader = createRelayReader(card, services.conversations);
    const result = await services.operations.enroll(reader.socket, detect(), enrollmentFor(services.user));
    expect(result).toEqual({ ok: true });
    return { ...services, card, reader };
  }

  it('enrolls only after the card proved the new random key', async () => {
    const { cards, card } = await enrolled();

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ uid: UID, keyNo: 1 });
    const stored = Buffer.from(String(cards[0].key).replace('encrypted:', ''), 'hex');
    expect(stored).toHaveLength(16);
    expect(card.keys[1].equals(stored)).toBe(true);
    expect(card.keyVersions[1]).toBe(1);
  });

  it('uses fresh random keys, not keys derived from the card', async () => {
    const first = await enrolled();
    const second = await enrolled();

    expect(first.card.keys[1].equals(second.card.keys[1])).toBe(false);
  });

  it('never sends a key to the reader', async () => {
    const { reader, card } = await enrolled();

    const wire = JSON.stringify(reader.sent);
    expect(wire).not.toContain(card.keys[1].toString('hex'));
    expect(reader.apdus().every((m) => Buffer.from(m.payload.apdu, 'hex').length <= 62)).toBe(true);
  });

  it('logs in a card whose key the server verified', async () => {
    const { operations, reader } = await enrolled();

    const verified = await operations.verifyCard(reader.socket, 'tap', detect());

    expect(verified.ok).toBe(true);
    expect(verified.card.user.id).toBe(5);
  });

  it('lets the card prove itself again after the server restarted', async () => {
    const { operations, card, cards, attractapService, user } = await enrolled();
    const fresh = createServices();
    fresh.cards.push(...cards);
    Object.assign(operations, { conversations: fresh.conversations, attractapService });
    void user;
    const reader = createRelayReader(card, fresh.conversations);

    expect((await operations.verifyCard(reader.socket, 'tap', detect())).ok).toBe(true);
  });

  it('refuses a copied UID: a card with another key cannot log in', async () => {
    const { operations, cards, attractapService } = await enrolled();
    const clone = new EmulatedCard(kind);
    const services = createServices();
    Object.assign(operations, { conversations: services.conversations, attractapService });
    const reader = createRelayReader(clone, services.conversations);
    void cards;

    const verified = await operations.verifyCard(reader.socket, 'tap', detect());

    expect(verified).toEqual({ ok: false, error: 'CARD_AUTHENTICATION_FAILED' });
    expect(reader.socket.state.verifiedUserId).toBeNull();
  });

  it('refuses a card that cannot prove the key (no proof, wrong rotation)', async () => {
    for (const misbehaviour of ['no-proof', 'wrong-rotation'] as const) {
      const { operations, card, conversations } = await enrolled();
      card.misbehaviour = misbehaviour;
      const reader = createRelayReader(card, conversations);

      expect((await operations.verifyCard(reader.socket, 'tap', detect())).ok).toBe(false);
    }
  });

  it('refuses a reader that makes up the card answers after the card was detected', async () => {
    const { operations, conversations, card } = await enrolled();
    const liar = createRelayReader(card, conversations);
    // The genuine card answers GetVersion (3 frames); every answer after that is made up.
    liar.tamper((response, _apdu, index) => (index < 3 ? response : Buffer.from([0x91, 0x00])));

    const verified = await operations.verifyCard(liar.socket, 'tap', detect());

    expect(verified).toEqual({ ok: false, error: 'CARD_AUTHENTICATION_FAILED' });
    expect(liar.socket.state.verifiedUserId).toBeNull();
  });

  it('refuses a reader that replays the answers of an earlier genuine tap', async () => {
    const { operations, conversations, card } = await enrolled();
    const recorder = createRelayReader(card, conversations);
    expect((await operations.verifyCard(recorder.socket, 'tap', detect())).ok).toBe(true);
    const recorded = [...recorder.answers];

    // Same card on the reader, but the reader answers with the recording instead of the card.
    const replayer = createRelayReader(card, conversations);
    replayer.tamper((response, _apdu, index) => recorded[index] ?? response);
    const replayed = await operations.verifyCard(replayer.socket, 'tap', detect());

    expect(replayed).toEqual({ ok: false, error: 'CARD_AUTHENTICATION_FAILED' });
  });

  it('refuses an unknown card without talking to it', async () => {
    const services = createServices();
    const reader = createRelayReader(new EmulatedCard(kind), services.conversations);

    expect(await services.operations.verifyCard(reader.socket, 'tap', detect())).toEqual({
      ok: false,
      error: 'CARD_NOT_FOUND',
    });
    expect(reader.apdus()).toHaveLength(0);
  });

  it('does not report the enrollment as done when the card write fails', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    card.failWritesAfter = 0;
    const reader = createRelayReader(card, services.conversations);

    const result = await services.operations.enroll(reader.socket, detect(), enrollmentFor(services.user));

    expect(result.ok).toBe(false);
    expect(services.cards).toHaveLength(0);
  });

  it('finishes an interrupted enrollment when the card is presented again', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const first = createRelayReader(card, services.conversations);
    first.dropAfterWrite();
    const interrupted = await services.operations.enroll(first.socket, detect(), enrollmentFor(services.user));
    expect(interrupted.ok).toBe(false);
    expect(services.cards).toHaveLength(0);
    expect(services.pending).toHaveLength(1);

    const second = createRelayReader(card, services.conversations);
    const retried = await services.operations.enroll(second.socket, detect(), enrollmentFor(services.user));

    expect(retried).toEqual({ ok: true });
    expect(services.cards).toHaveLength(1);
    expect(services.pending).toHaveLength(0);
  });

  it('finishes an interrupted enrollment on a plain tap too', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const first = createRelayReader(card, services.conversations);
    first.dropAfterWrite();
    await services.operations.enroll(first.socket, detect(), enrollmentFor(services.user));

    const tap = createRelayReader(card, services.conversations);
    const verified = await services.operations.verifyCard(tap.socket, 'tap', detect());

    expect(verified.ok).toBe(true);
    expect(services.cards).toHaveLength(1);
  });

  it('resets a card to the factory key and removes the record only after the card confirmed it', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    const reader = createRelayReader(card, conversations);

    const result = await operations.reset(reader.socket, detect(), {
      cardId: cards[0].id,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });

    expect(result).toEqual({ ok: true });
    expect(card.keys[1].equals(Buffer.alloc(16))).toBe(true);
    expect(cards).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it('keeps the record when the reset write fails, and finishes on the next presentation', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    const cardId = cards[0].id;
    card.failWritesAfter = 1;
    const failing = createRelayReader(card, conversations);

    const failed = await operations.reset(failing.socket, detect(), {
      cardId,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });
    expect(failed.ok).toBe(false);
    expect(cards).toHaveLength(1);
    expect(pending).toHaveLength(1);

    card.failWritesAfter = Infinity;
    const retry = createRelayReader(card, conversations);
    const done = await operations.reset(retry.socket, detect(), {
      cardId,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });
    expect(done).toEqual({ ok: true });
    expect(cards).toHaveLength(0);
  });

  it('notices on a plain tap that an interrupted reset got through', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    // The card was wiped but nobody recorded it.
    card.keys[1] = Buffer.alloc(16);
    card.keyVersions[1] = 0;
    pending.push({ id: 99, uid: UID, kind: 'reset', cardId: cards[0].id, keyNo: 1, key: null });
    const reader = createRelayReader(card, conversations);

    const verified = await operations.verifyCard(reader.socket, 'tap', detect());

    expect(verified.ok).toBe(false);
    expect(cards).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it('leaves no recovery record when a reset is refused before anything was written', async () => {
    const { operations, cards, conversations, pending } = await enrolled();
    // A copied UID on a card that does not hold the stored key: the login is refused, nothing is written.
    const copy = new EmulatedCard(kind);
    copy.keys[0] = Buffer.alloc(16, 7);
    copy.keys[1] = Buffer.alloc(16, 9);
    const reader = createRelayReader(copy, conversations);

    const result = await operations.reset(reader.socket, detect(), {
      cardId: cards[0].id,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });

    expect(result.ok).toBe(false);
    expect(cards).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });

  it('leaves no recovery record when an enrollment is refused before anything was written', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    // Not a factory card: its first key is already someone else's.
    card.keys[0] = Buffer.alloc(16, 7);
    const reader = createRelayReader(card, services.conversations);

    const result = await services.operations.enroll(reader.socket, detect(), enrollmentFor(services.user));

    expect(result.ok).toBe(false);
    expect(services.cards).toHaveLength(0);
    expect(services.pending).toHaveLength(0);
  });

  it('refuses to reset a different card than the one selected', async () => {
    const { operations, cards, conversations } = await enrolled();
    const reader = createRelayReader(new EmulatedCard(kind), conversations);

    const result = await operations.reset(reader.socket, detect('04deadbeef0000'), {
      cardId: cards[0].id,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });

    expect(result).toEqual({ ok: false, error: 'WRONG_CARD' });
  });

  it('stops talking when the card is pulled mid-conversation', async () => {
    const { operations, conversations } = await enrolled();
    const reader = createRelayReader(new EmulatedCard(kind), conversations);
    reader.goSilent();

    const pending = operations.verifyCard(reader.socket, 'tap', detect());
    await new Promise(setImmediate);
    conversations.handleRemoved(reader.socket, { conversationId: reader.apdus()[0].payload.conversationId });

    expect(await pending).toEqual({ ok: false, error: 'CARD_REMOVED' });
  });
});

describe('random keys', () => {
  it('are 16 bytes of CSPRNG output', () => {
    const keys = new Set(Array.from({ length: 50 }, () => AttractapService.prototype.generateCardKey()));
    expect(keys.size).toBe(50);
    expect([...keys].every((key) => /^[0-9a-f]{32}$/.test(key))).toBe(true);
  });
});
