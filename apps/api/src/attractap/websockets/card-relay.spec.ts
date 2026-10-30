/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from 'node:crypto';
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CardKind } from '../card-crypto/card-operations';
import { AttractapService } from '../attractap.service';
import { CARD_CONVERSATION_LIMITS, CardConversationService } from './card-conversation.service';
import { CardOperationsService } from './card-operations.service';
import { AttractapEventType } from './websocket.types';

const UID = '04aabbccddee80';

/** A reader that does nothing but relay: it forwards CARD_APDU to the card and answers CARD_APDU_RESPONSE. */
function createRelayReader(card: EmulatedCard | null, conversations: CardConversationService) {
  const sent: Array<{ type: string; payload: any }> = [];
  let rewrite: ((response: Buffer) => Buffer) | null = null;
  let silent = false;
  let dropAfterWrite = false;
  const socket: any = {
    id: 'reader-socket',
    readerId: 7,
    bufferedAmount: 0,
    state: { verifiedUserId: null, verifiedCardUid: null, cardConversation: null },
    sendRaw: (message: any) => {
      const { type, payload } = message.data;
      sent.push({ type, payload });
      if (type === AttractapEventType.CARD_APDU && card && !silent) {
        setImmediate(() => {
          const apdu = Buffer.from(payload.apdu, 'hex');
          const response = card.transceive(apdu);
          if (dropAfterWrite && apdu[1] === 0xc4) {
            // The key write reached the card, then the reader went away: nobody hears the answer.
            conversations.abort(socket, 'READER_UNREACHABLE');
            return;
          }
          conversations.handleResponse(socket, {
            conversationId: payload.conversationId,
            seq: payload.seq,
            response: (rewrite ? rewrite(response) : response).toString('hex'),
          });
        });
      }
      return true;
    },
    sendMessage: jest.fn().mockResolvedValue(true),
  };
  return {
    socket,
    sent,
    apdus: () => sent.filter((m) => m.type === AttractapEventType.CARD_APDU),
    tamper: (fn: (response: Buffer) => Buffer) => (rewrite = fn),
    goSilent: () => (silent = true),
    dropAfterWrite: () => (dropAfterWrite = true),
  };
}

function createServices() {
  const cards: any[] = [];
  const pending: any[] = [];
  let nextId = 1;
  const attractapService: any = {
    getNFCCardByUID: jest.fn(async (uid: string) => cards.find((card) => card.uid === uid)),
    getNFCCardByID: jest.fn(async (id: number) => cards.find((card) => card.id === id)),
    createNFCCard: jest.fn(async (user: any, data: any) => {
      const card = { id: nextId++, ...data, user, isActive: true };
      cards.push(card);
      return { ...card, key: `encrypted:${data.key}` };
    }),
    deleteNFCCard: jest.fn(async (id: number) => {
      const index = cards.findIndex((card) => card.id === id);
      if (index >= 0) cards.splice(index, 1);
      return { affected: index >= 0 ? 1 : 0 };
    }),
    generateCardKey: AttractapService.prototype.generateCardKey,
  };
  const pendingRepository: any = {
    findOne: jest.fn(async ({ where }: any) =>
      pending.find((change) => Object.entries(where).every(([key, value]) => change[key] === value)),
    ),
    find: jest.fn(async ({ where }: any) =>
      pending.filter((change) => Object.entries(where).every(([key, value]) => change[key] === value)),
    ),
    save: jest.fn(async (change: any) => {
      const saved = { id: nextId++, ...change };
      pending.push(saved);
      return saved;
    }),
    delete: jest.fn(async (criteria: any) => {
      const ids = Array.isArray(criteria) ? criteria : typeof criteria === 'number' ? [criteria] : null;
      for (let i = pending.length - 1; i >= 0; i--) {
        const hit = ids
          ? ids.includes(pending[i].id)
          : Object.entries(criteria).every(([key, value]) => pending[i][key] === value);
        if (hit) pending.splice(i, 1);
      }
    }),
  };
  const user = { id: 5, username: 'alice' };
  const conversations = new CardConversationService();
  const operations = Object.assign(new CardOperationsService(), {
    attractapService,
    conversations,
    pendingRepository,
    encryption: {
      encrypt: (v: string) => `encrypted:${v}`,
      decryptIfEncrypted: (v: string) => v.replace('encrypted:', ''),
    },
    usersService: { findOne: jest.fn().mockResolvedValue(user) },
    audit: { recordAttractap: jest.fn().mockResolvedValue(undefined) },
  });
  // Mirrors the real service: stored card keys come back decrypted.
  const originalGet = attractapService.getNFCCardByUID;
  attractapService.getNFCCardByUID = jest.fn(async (uid: string) => {
    const card = await originalGet(uid);
    return card ? { ...card, key: String(card.key).replace('encrypted:', '') } : card;
  });
  const originalGetById = attractapService.getNFCCardByID;
  attractapService.getNFCCardByID = jest.fn(async (id: number) => {
    const card = await originalGetById(id);
    return card ? { ...card, key: String(card.key).replace('encrypted:', '') } : card;
  });
  return { cards, pending, attractapService, conversations, operations, user };
}

describe.each<CardKind>(['desfire', 'ntag424'])('card checks on the server (%s)', (kind) => {
  const enrollmentFor = (user: { id: number }) => ({
    userId: user.id,
    auditPrincipal: { userId: user.id, authenticationMethod: 'session' as const },
  });

  async function enrolled() {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const reader = createRelayReader(card, services.conversations);
    const result = await services.operations.enroll(reader.socket, UID, enrollmentFor(services.user));
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

    const verified = await operations.verifyCard(reader.socket, 'tap', UID);

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

    expect((await operations.verifyCard(reader.socket, 'tap', UID)).ok).toBe(true);
  });

  it('refuses a copied UID: a card with another key cannot log in', async () => {
    const { operations, cards, attractapService } = await enrolled();
    const clone = new EmulatedCard(kind);
    const services = createServices();
    Object.assign(operations, { conversations: services.conversations, attractapService });
    const reader = createRelayReader(clone, services.conversations);
    void cards;

    const verified = await operations.verifyCard(reader.socket, 'tap', UID);

    expect(verified).toEqual({ ok: false, error: 'CARD_AUTHENTICATION_FAILED' });
    expect(reader.socket.state.verifiedUserId).toBeNull();
  });

  it('refuses a card that cannot prove the key (no proof, wrong rotation)', async () => {
    for (const misbehaviour of ['no-proof', 'wrong-rotation'] as const) {
      const { operations, card, conversations } = await enrolled();
      card.misbehaviour = misbehaviour;
      const reader = createRelayReader(card, conversations);

      expect((await operations.verifyCard(reader.socket, 'tap', UID)).ok).toBe(false);
    }
  });

  it('refuses a reader that makes up the card answers', async () => {
    const { operations, conversations } = await enrolled();
    const liar = createRelayReader(new EmulatedCard(kind), conversations);
    liar.tamper(() => Buffer.from([0x91, 0x00]));

    expect((await operations.verifyCard(liar.socket, 'tap', UID)).ok).toBe(false);
  });

  it('refuses an unknown card without talking to it', async () => {
    const services = createServices();
    const reader = createRelayReader(new EmulatedCard(kind), services.conversations);

    expect(await services.operations.verifyCard(reader.socket, 'tap', UID)).toEqual({
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

    const result = await services.operations.enroll(reader.socket, UID, enrollmentFor(services.user));

    expect(result.ok).toBe(false);
    expect(services.cards).toHaveLength(0);
  });

  it('finishes an interrupted enrollment when the card is presented again', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const first = createRelayReader(card, services.conversations);
    first.dropAfterWrite();
    const interrupted = await services.operations.enroll(first.socket, UID, enrollmentFor(services.user));
    expect(interrupted.ok).toBe(false);
    expect(services.cards).toHaveLength(0);
    expect(services.pending).toHaveLength(1);

    const second = createRelayReader(card, services.conversations);
    const retried = await services.operations.enroll(second.socket, UID, enrollmentFor(services.user));

    expect(retried).toEqual({ ok: true });
    expect(services.cards).toHaveLength(1);
    expect(services.pending).toHaveLength(0);
  });

  it('finishes an interrupted enrollment on a plain tap too', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const first = createRelayReader(card, services.conversations);
    first.dropAfterWrite();
    await services.operations.enroll(first.socket, UID, enrollmentFor(services.user));

    const tap = createRelayReader(card, services.conversations);
    const verified = await services.operations.verifyCard(tap.socket, 'tap', UID);

    expect(verified.ok).toBe(true);
    expect(services.cards).toHaveLength(1);
  });

  it('resets a card to the factory key and removes the record only after the card confirmed it', async () => {
    const { operations, cards, card, conversations, pending } = await enrolled();
    const reader = createRelayReader(card, conversations);

    const result = await operations.reset(reader.socket, UID, {
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

    const failed = await operations.reset(failing.socket, UID, {
      cardId,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });
    expect(failed.ok).toBe(false);
    expect(cards).toHaveLength(1);
    expect(pending).toHaveLength(1);

    card.failWritesAfter = Infinity;
    const retry = createRelayReader(card, conversations);
    const done = await operations.reset(retry.socket, UID, {
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

    const verified = await operations.verifyCard(reader.socket, 'tap', UID);

    expect(verified.ok).toBe(false);
    expect(cards).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it('refuses to reset a different card than the one selected', async () => {
    const { operations, cards, conversations } = await enrolled();
    const reader = createRelayReader(new EmulatedCard(kind), conversations);

    const result = await operations.reset(reader.socket, '04deadbeef0000', {
      cardId: cards[0].id,
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });

    expect(result).toEqual({ ok: false, error: 'WRONG_CARD' });
  });

  it('stops talking when the card is pulled mid-conversation', async () => {
    const { operations, conversations } = await enrolled();
    const reader = createRelayReader(new EmulatedCard(kind), conversations);
    reader.goSilent();

    const pending = operations.verifyCard(reader.socket, 'tap', UID);
    await new Promise(setImmediate);
    conversations.handleRemoved(reader.socket, { conversationId: reader.apdus()[0].payload.conversationId });

    expect(await pending).toEqual({ ok: false, error: 'CARD_REMOVED' });
  });
});

describe('conversation limits', () => {
  const run = (conversations: CardConversationService, socket: any, work?: (channel: any) => Promise<unknown>) =>
    conversations.run(
      socket,
      'tap',
      UID,
      work ?? (async (channel) => channel.exchange(Buffer.from([0x90, 0x60, 0, 0, 0]))),
    );

  const idle = () => createRelayReader(null, new CardConversationService());

  it('ignores answers with the wrong conversation id or sequence number', async () => {
    const conversations = new CardConversationService();
    const reader = createRelayReader(null, conversations);
    const result = run(conversations, reader.socket);
    await new Promise(setImmediate);
    const { conversationId, seq } = reader.apdus()[0].payload;

    conversations.handleResponse(reader.socket, { conversationId: 'other', seq, response: '9100' });
    conversations.handleResponse(reader.socket, { conversationId, seq: seq + 1, response: '9100' });
    conversations.handleResponse(reader.socket, { conversationId, seq, response: 'zz' });
    expect(reader.socket.state.cardConversation.pending).not.toBeNull();

    conversations.handleResponse(reader.socket, { conversationId, seq, response: '9100' });
    expect(await result).toMatchObject({ ok: true });
  });

  it('allows one conversation per reader: a new tap replaces the old one', async () => {
    const conversations = new CardConversationService();
    const reader = createRelayReader(null, conversations);
    const first = run(conversations, reader.socket);
    await new Promise(setImmediate);

    const second = run(conversations, reader.socket);
    expect(await first).toEqual({ ok: false, reason: 'CARD_REMOVED' });
    await new Promise(setImmediate);
    const [, latest] = reader.apdus();
    conversations.handleResponse(reader.socket, { ...latest.payload, response: '9100' });
    expect(await second).toMatchObject({ ok: true });
    expect(conversations.activeConversations).toBe(0);
  });

  it('says busy once the server-wide limit is reached', async () => {
    const conversations = new CardConversationService();
    const readers = Array.from({ length: CARD_CONVERSATION_LIMITS.maxConcurrent }, () => idle());
    const open = readers.map((reader) => run(conversations, reader.socket));
    const extra = idle();

    expect(await run(conversations, extra.socket)).toEqual({ ok: false, reason: 'BUSY' });

    readers.forEach((reader) => conversations.abort(reader.socket, 'READER_UNREACHABLE'));
    await Promise.all(open);
    expect(conversations.activeConversations).toBe(0);
  });

  it('says busy when the reader cannot drain its send queue', async () => {
    const conversations = new CardConversationService();
    const reader = idle();
    reader.socket.bufferedAmount = CARD_CONVERSATION_LIMITS.maxBufferedBytes + 1;

    expect(await run(conversations, reader.socket)).toEqual({ ok: false, reason: 'BUSY' });
  });

  it('ends a conversation that needs more than the allowed number of exchanges', async () => {
    const conversations = new CardConversationService();
    const reader = createRelayReader(new EmulatedCard('ntag424'), conversations);
    const apdu = Buffer.from([0x90, 0x60, 0, 0, 0]);
    reader.socket.sendRaw = ((original) => (message: any) => {
      const sent = original(message);
      return sent;
    })(reader.socket.sendRaw);

    const result = await conversations.run(reader.socket, 'tap', UID, async (channel) => {
      for (let i = 0; i <= CARD_CONVERSATION_LIMITS.maxExchanges; i++) await channel.exchange(apdu);
    });

    expect(result).toEqual({ ok: false, reason: 'TOO_MANY_EXCHANGES' });
  });

  it('gives up on a card answer that never comes', async () => {
    jest.useFakeTimers();
    try {
      const conversations = new CardConversationService();
      const reader = idle();
      const result = run(conversations, reader.socket);
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.exchangeTimeoutMs + 10);
      expect(await result).toEqual({ ok: false, reason: 'TIMEOUT' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('cuts off a conversation that takes too long overall', async () => {
    jest.useFakeTimers();
    try {
      const conversations = new CardConversationService();
      const reader = idle();
      const slow = run(conversations, reader.socket, async (channel) => {
        for (;;) {
          const pending = channel.exchange(Buffer.from([0x90, 0x60, 0, 0, 0]));
          await jest.advanceTimersByTimeAsync(0);
          const { conversationId, seq } = reader.apdus().at(-1)!.payload;
          setTimeout(
            () => conversations.handleResponse(reader.socket, { conversationId, seq, response: '9100' }),
            CARD_CONVERSATION_LIMITS.exchangeTimeoutMs - 500,
          );
          await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.exchangeTimeoutMs - 400);
          await pending;
        }
      });
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.conversationTimeoutMs + 100);
      expect(await slow).toMatchObject({ ok: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('forgets the verified user when a new login tap starts', async () => {
    const conversations = new CardConversationService();
    const reader = idle();
    reader.socket.state.verifiedUserId = 5;
    reader.socket.state.verifiedCardUid = UID;

    const tap = run(conversations, reader.socket);
    expect(reader.socket.state.verifiedUserId).toBeNull();
    conversations.abort(reader.socket, 'READER_SESSION_ENDED');
    await tap;
  });

  it('keeps the logged in user while a supervisor card is checked', async () => {
    const conversations = new CardConversationService();
    const reader = idle();
    reader.socket.state.verifiedUserId = 5;

    const supervisor = conversations.run(reader.socket, 'supervisor', UID, async (channel) =>
      channel.exchange(Buffer.from([0x90, 0x60, 0, 0, 0])),
    );
    expect(reader.socket.state.verifiedUserId).toBe(5);
    conversations.abort(reader.socket, 'CARD_REMOVED');
    await supervisor;
  });

  it('tells the reader when the conversation is over', async () => {
    const conversations = new CardConversationService();
    const reader = idle();

    await conversations.run(reader.socket, 'tap', UID, async () => undefined);

    expect(reader.sent.at(-1)?.type).toBe(AttractapEventType.CARD_CONVERSATION_END);
  });
});

describe('random keys', () => {
  it('are 16 bytes of CSPRNG output', () => {
    const keys = new Set(Array.from({ length: 50 }, () => AttractapService.prototype.generateCardKey()));
    expect(keys.size).toBe(50);
    expect([...keys].every((key) => /^[0-9a-f]{32}$/.test(key))).toBe(true);
    void randomBytes;
  });
});
