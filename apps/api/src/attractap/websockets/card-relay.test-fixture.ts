/* eslint-disable @typescript-eslint/no-explicit-any */
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { AttractapService } from '../attractap.service';
import { CardAlreadyEnrolledError } from '../card-store.port';
import { CardConversationService } from './card-conversation.service';
import { CardOperationsService } from './card-operations.service';
import { AttractapEventType, CardDetection } from './websocket.types';

export const UID = '04aabbccddee80';

let detectionCounter = 0;
/** A fresh card presentation (CARD_DETECTED). Ids only grow, as the reader's per-boot counter does. */
export const detect = (uid: string = UID): CardDetection => ({ uid, detectionId: ++detectionCounter });

/** A reader that does nothing but relay: it forwards CARD_APDU to the card and answers CARD_APDU_RESPONSE. */
export function createRelayReader(
  card: EmulatedCard | null,
  conversations: CardConversationService,
  /** One-way network delay between the server and the reader. */
  latencyMs = 0,
  options: { readerId?: number; socketId?: string } = {},
) {
  const sent: Array<{ type: string; payload: any }> = [];
  let rewrite: ((response: Buffer, apdu: Buffer, index: number) => Buffer) | null = null;
  let silent = false;
  let dropAfterWrite = false;
  /** Every card answer this reader relayed, in order (what a hostile reader could record). */
  const answers: Buffer[] = [];
  let exchanged = 0;
  const socket: any = {
    id: options.socketId ?? 'reader-socket',
    readerId: options.readerId ?? 7,
    readyState: 1, // WebSocket.OPEN
    bufferedAmount: 0,
    state: { verifiedUserId: null, verifiedCardUid: null, cardConversation: null, cardRelay: true },
    sendRaw: (message: any) => {
      const { type, payload } = message.data;
      sent.push({ type, payload });
      if (type === AttractapEventType.CARD_APDU && card && !silent) {
        const deliver = latencyMs > 0 ? (fn: () => void) => setTimeout(fn, latencyMs) : setImmediate;
        deliver(() => {
          const apdu = Buffer.from(payload.apdu, 'hex');
          const response = card.transceive(apdu);
          if (dropAfterWrite && apdu[1] === 0xc4) {
            // The key write reached the card, then the reader went away: nobody hears the answer.
            conversations.abort(socket, 'READER_UNREACHABLE');
            return;
          }
          const relayed = rewrite ? rewrite(response, apdu, exchanged) : response;
          exchanged++;
          answers.push(relayed);
          const answer = {
            conversationId: payload.conversationId,
            seq: payload.seq,
            response: relayed.toString('hex'),
          };
          if (latencyMs > 0) setTimeout(() => conversations.handleResponse(socket, answer), latencyMs);
          else conversations.handleResponse(socket, answer);
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
    ends: () => sent.filter((m) => m.type === AttractapEventType.CARD_CONVERSATION_END),
    answers,
    /** Rewrites the card's answers; `index` counts the exchanges this reader relayed (0 = first GetVersion frame). */
    tamper: (fn: (response: Buffer, apdu: Buffer, index: number) => Buffer) => {
      rewrite = fn;
      exchanged = 0;
    },
    goSilent: () => (silent = true),
    dropAfterWrite: () => (dropAfterWrite = true),
  };
}

export function createServices() {
  const cards: any[] = [];
  const pending: any[] = [];
  let nextId = 1;
  const attractapService: any = {
    getNFCCardByUID: jest.fn(async (uid: string) => cards.find((card) => card.uid === uid)),
    getNFCCardByID: jest.fn(async (id: number) => cards.find((card) => card.id === id)),
    createNFCCard: jest.fn(async (user: any, data: any, options: { activate?: boolean } = {}) => {
      const activate = options.activate ?? true;
      // The unique index on lower(uid): the failed insert changes nothing.
      if (cards.some((card) => card.uid.toLowerCase() === data.uid.toLowerCase())) throw new CardAlreadyEnrolledError();
      if (activate) for (const other of cards) if (other.user?.id === user.id) other.isActive = false;
      const card = { id: nextId++, type: 'aes', ...data, user, isActive: activate };
      cards.push(card);
      return { ...card, key: card.key == null ? null : `encrypted:${data.key}` };
    }),
    userHasActiveNFCCard: jest.fn(async (userId: number) =>
      cards.some((card) => card.user?.id === userId && card.isActive),
    ),
    deleteNFCCard: jest.fn(async (id: number) => {
      const index = cards.findIndex((card) => card.id === id);
      if (index >= 0) cards.splice(index, 1);
      return index >= 0;
    }),
    generateCardKey: AttractapService.prototype.generateCardKey,
  };
  const cardStore: any = {
    findPendingEnroll: jest.fn(
      async (uid: string) => pending.find((c) => c.uid === uid && c.kind === 'enroll') ?? null,
    ),
    listPendingEnrolls: jest.fn(async (uid: string) => pending.filter((c) => c.uid === uid && c.kind === 'enroll')),
    listPendingResets: jest.fn(async (uid: string) => pending.filter((c) => c.uid === uid && c.kind === 'reset')),
    savePending: jest.fn(async (change: any) => {
      const saved = { id: nextId++, ...change };
      pending.push(saved);
      return saved;
    }),
    deletePendingById: jest.fn(async (ids: number | number[]) => {
      const list = Array.isArray(ids) ? ids : [ids];
      for (let i = pending.length - 1; i >= 0; i--) if (list.includes(pending[i].id)) pending.splice(i, 1);
    }),
    deletePendingByUid: jest.fn(async (uid: string, kind: string) => {
      for (let i = pending.length - 1; i >= 0; i--)
        if (pending[i].uid === uid && pending[i].kind === kind) pending.splice(i, 1);
    }),
  };
  const settings = { uidOnlyAllowed: false };
  const user = { id: 5, username: 'alice' };
  const conversations = new CardConversationService();
  const operations = Object.assign(new CardOperationsService(), {
    attractapService,
    conversations,
    cardStore,
    encryption: {
      encrypt: (v: string) => `encrypted:${v}`,
      decryptIfEncrypted: (v: string) => v.replace('encrypted:', ''),
    },
    usersService: { findOne: jest.fn().mockResolvedValue(user) },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
    policy: { isUidOnlyAllowed: jest.fn(async () => settings.uidOnlyAllowed) },
  });
  // Mirrors the real service: stored card keys come back decrypted.
  const originalGet = attractapService.getNFCCardByUID;
  attractapService.getNFCCardByUID = jest.fn(async (uid: string) => {
    const card = await originalGet(uid);
    return card && card.key != null ? { ...card, key: String(card.key).replace('encrypted:', '') } : card;
  });
  const originalGetById = attractapService.getNFCCardByID;
  attractapService.getNFCCardByID = jest.fn(async (id: number) => {
    const card = await originalGetById(id);
    return card && card.key != null ? { ...card, key: String(card.key).replace('encrypted:', '') } : card;
  });
  return { cards, pending, cardStore, attractapService, conversations, operations, user, settings };
}
