/* eslint-disable @typescript-eslint/no-explicit-any */
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CARD_CONVERSATION_LIMITS } from './card-conversation.service';
import { CardDetectedRouter } from './card-detected.router';
import { UID, createRelayReader, createServices } from './card-relay.test-fixture';
import { createAttractapCardHandlerFixture } from './handlers/card/fixtures/handler.test-fixture';
import { resetTestFixture } from './handlers/card/fixtures/setup.test-fixture';
import { AttractapEventType } from './websocket.types';

let nextDetectionId = 1;

/** CARD_DETECTED through the router, with the real card handler, conversation service and card checks. */
async function setup(kind: 'desfire' | 'ntag424' = 'ntag424') {
  const services = createServices();
  const card = new EmulatedCard(kind);
  // An enrolled card: the stored key sits in slot 1.
  const key = Buffer.alloc(16, 0x42);
  card.keys[1] = key;
  card.keyVersions[1] = 1;
  card.appExists = true;
  services.cards.push({ id: 1, uid: UID, keyNo: 1, key: key.toString('hex'), isActive: true, user: services.user });

  const handlerScope = createAttractapCardHandlerFixture();
  resetTestFixture(handlerScope);
  const cardHandler: any = handlerScope.handler;
  cardHandler.cardOperations = services.operations;
  cardHandler.cardConversations = services.conversations;
  const supervisionHandler = { handleSupervisorCardDetected: jest.fn().mockResolvedValue(undefined) };
  const massIntroductionHandler = { handleCardDetected: jest.fn().mockResolvedValue(undefined) };
  const router = Object.assign(new CardDetectedRouter(), {
    cardHandler,
    supervisionHandler,
    massIntroductionHandler,
    conversations: services.conversations,
  });
  const reader = (options?: { readerId?: number; socketId?: string; latencyMs?: number }) =>
    createRelayReader(card, services.conversations, options?.latencyMs ?? 0, options);
  const detected = (socket: any, payload: Record<string, unknown>) =>
    router.route(socket, { type: AttractapEventType.CARD_DETECTED, payload } as any);
  const tap = (socket: any, overrides: Record<string, unknown> = {}) =>
    detected(socket, { purpose: 'tap', uid: UID, resourceId: 10, detectionId: nextDetectionId++, ...overrides });
  return { ...services, card, router, reader, detected, tap, supervisionHandler, cardHandler };
}

const replies = (socket: any, type: AttractapEventType) =>
  socket.sendMessage.mock.calls.map(([event]: any[]) => event.data).filter((data: any) => data.type === type);

const lastEnd = (reader: ReturnType<typeof createRelayReader>) => reader.ends().at(-1)?.payload;

describe('CardDetectedRouter', () => {
  it('logs in a card the server verified, and says when it is done with the detection', async () => {
    const { reader, tap } = await setup();
    const r = reader();

    await tap(r.socket, { detectionId: 500 });

    expect(r.socket.state.verifiedUserId).toBe(5);
    expect(replies(r.socket, AttractapEventType.CARD_AUTHENTICATION_DATA)[0].payload).toEqual(
      expect.objectContaining({ username: 'alice' }),
    );
    expect(r.apdus().every((apdu) => apdu.payload.detectionId === 500)).toBe(true);
    expect(lastEnd(r)).toEqual({ detectionId: 500 });
  });

  it.each([
    ['FIRMWARE_UPDATE_REQUIRED', { cardRelay: false }, {}],
    ['INVALID_PARAMS', {}, { detectionId: undefined }],
    ['INVALID_PARAMS', {}, { detectionId: -1 }],
    ['INVALID_PARAMS', {}, { detectionId: 0x1_0000_0000 }],
    ['INVALID_PARAMS', {}, { detectionId: 1.5 }],
    ['INVALID_UID', {}, { uid: 'not hex' }],
    ['INVALID_PARAMS', {}, { resourceId: 'x' }],
  ])('answers %s and forgets the logged in user before anything else', async (error, state, payload) => {
    const { reader, tap, attractapService } = await setup();
    const r = reader();
    Object.assign(r.socket.state, { verifiedUserId: 9, verifiedCardUid: 'aabb', ...state });

    await tap(r.socket, payload);

    expect(replies(r.socket, AttractapEventType.CARD_AUTHENTICATION_DATA)).toEqual([
      { type: AttractapEventType.CARD_AUTHENTICATION_DATA, payload: { error } },
    ]);
    expect(r.socket.state.verifiedUserId).toBeNull();
    expect(r.socket.state.verifiedCardUid).toBeNull();
    expect(attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    expect(r.apdus()).toHaveLength(0);
    // The reader must stop waiting for commands, also before its FIRMWARE_INFO was processed.
    // (Rows that override detectionId test an invalid one, which has nothing to end.)
    if (!('detectionId' in payload)) expect(lastEnd(r)).toEqual({ detectionId: expect.any(Number) });
  });

  it('says busy before any database work and still ends the detection', async () => {
    const { reader, tap, attractapService } = await setup();
    const r = reader();
    r.socket.state.verifiedUserId = 9;
    r.socket.bufferedAmount = CARD_CONVERSATION_LIMITS.maxBufferedBytes + 1;

    await tap(r.socket, { detectionId: 77 });

    expect(replies(r.socket, AttractapEventType.CARD_AUTHENTICATION_DATA)[0].payload).toEqual({ error: 'BUSY' });
    expect(attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    expect(r.socket.state.verifiedUserId).toBeNull();
    expect(lastEnd(r)).toEqual({ detectionId: 77 });
  });

  it('ends the detection after every early error that has a detection id', async () => {
    const { reader, tap } = await setup();
    const r = reader();

    await tap(r.socket, { detectionId: 11, uid: 'zz' });
    await tap(r.socket, { detectionId: 12, resourceId: undefined });
    await tap(r.socket, { detectionId: 13, uid: '04ffffffffffff' }); // CARD_NOT_FOUND

    expect(r.ends().map((end) => end.payload)).toEqual([{ detectionId: 11 }, { detectionId: 12 }, { detectionId: 13 }]);
  });

  it('ends the detection when a handler throws', async () => {
    const { reader, detected, supervisionHandler } = await setup();
    const r = reader();
    supervisionHandler.handleSupervisorCardDetected.mockRejectedValueOnce(new Error('boom'));

    await expect(
      detected(r.socket, { purpose: 'supervisor', uid: UID, resourceId: 10, detectionId: 31 }),
    ).rejects.toThrow('boom');

    expect(lastEnd(r)).toEqual({ detectionId: 31 });
  });

  it('keeps the logged in user while a supervisor card is checked', async () => {
    const { reader, detected, supervisionHandler } = await setup();
    const r = reader();
    r.socket.state.verifiedUserId = 9;

    await detected(r.socket, { purpose: 'supervisor', uid: UID, resourceId: 10, detectionId: 40 });

    expect(r.socket.state.verifiedUserId).toBe(9);
    expect(supervisionHandler.handleSupervisorCardDetected).toHaveBeenCalledWith(
      r.socket,
      { uid: UID, detectionId: 40 },
      10,
    );
  });

  it('forgets the user when a tapped card fails its check', async () => {
    const { reader, tap, card } = await setup();
    const r = reader();
    await tap(r.socket);
    expect(r.socket.state.verifiedUserId).toBe(5);

    card.keys[1] = Buffer.alloc(16, 0x13); // a copy with the same UID but another key
    await tap(r.socket);

    expect(r.socket.state.verifiedUserId).toBeNull();
    expect(replies(r.socket, AttractapEventType.CARD_AUTHENTICATION_DATA).at(-1).payload).toEqual({
      error: 'CARD_AUTHENTICATION_FAILED',
    });
  });

  it('does not log in a tap that a newer detection superseded mid-conversation', async () => {
    const { reader, tap } = await setup();
    const r = reader({ latencyMs: 5 });

    const superseded = tap(r.socket, { detectionId: 60 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(r.apdus().length).toBeGreaterThan(0);
    // The reader saw a new card (here an unreadable UID) before the first conversation finished.
    await tap(r.socket, { detectionId: 61, uid: 'zz' });
    await superseded;

    expect(r.socket.state.verifiedUserId).toBeNull();
    expect(replies(r.socket, AttractapEventType.CARD_AUTHENTICATION_DATA).map((reply: any) => reply.payload)).toEqual([
      { error: 'INVALID_UID' },
      { error: 'CARD_REMOVED' },
    ]);
  });

  it('ties a verified card to the connection it was verified on', async () => {
    const { reader, tap } = await setup();
    const a = reader({ socketId: 'a', readerId: 7 });
    const b = reader({ socketId: 'b', readerId: 8 });

    await tap(a.socket);

    expect(a.socket.state.verifiedUserId).toBe(5);
    expect(b.socket.state.verifiedUserId).toBeNull();
    expect(b.socket.state.verifiedCardUid).toBeNull();
  });
});
