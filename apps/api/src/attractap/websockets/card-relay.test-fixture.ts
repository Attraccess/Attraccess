/* eslint-disable @typescript-eslint/no-explicit-any */
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { AttractapService } from '../attractap.service';
import { CardConversationService } from './card-conversation.service';
import { CardOperationsService } from './card-operations.service';
import { AttractapEventType } from './websocket.types';

export const UID = '04aabbccddee80';

/** A reader that does nothing but relay: it forwards CARD_APDU to the card and answers CARD_APDU_RESPONSE. */
export function createRelayReader(
  card: EmulatedCard | null,
  conversations: CardConversationService,
  /** One-way network delay between the server and the reader. */
  latencyMs = 0,
) {
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
        const deliver = latencyMs > 0 ? (fn: () => void) => setTimeout(fn, latencyMs) : setImmediate;
        deliver(() => {
          const apdu = Buffer.from(payload.apdu, 'hex');
          const response = card.transceive(apdu);
          if (dropAfterWrite && apdu[1] === 0xc4) {
            // The key write reached the card, then the reader went away: nobody hears the answer.
            conversations.abort(socket, 'READER_UNREACHABLE');
            return;
          }
          const answer = {
            conversationId: payload.conversationId,
            seq: payload.seq,
            response: (rewrite ? rewrite(response) : response).toString('hex'),
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
    tamper: (fn: (response: Buffer) => Buffer) => (rewrite = fn),
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
