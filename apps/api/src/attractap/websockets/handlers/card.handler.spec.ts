/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapCardHandler } from './card.handler';
import { AttractapEvent, AttractapEventType } from '../websocket.types';

describe('AttractapCardHandler', () => {
  let handler: AttractapCardHandler;
  let websocketService: { sockets: Map<string, any> };
  let attractapService: {
    findReaderById: jest.Mock;
    getNFCCardByUID: jest.Mock;
    getNFCCardByID: jest.Mock;
    generateNTAG424Key: jest.Mock;
    uint8ArrayToHexString: jest.Mock;
    createNFCCard: jest.Mock;
    deleteNFCCard: jest.Mock;
  };
  let usersService: { findOne: jest.Mock };
  let resourceUsageService: { canControllResource: jest.Mock };
  let resourceIntroducersService: { isIntroducer: jest.Mock };
  let metricsService: { attractapNfcTapsTotal: { inc: jest.Mock } };
  let resourceRepository: { findOne: jest.Mock };
  let rbacService: { getEffectivePermissions: jest.Mock };
  let audit: { recordAttractap: jest.Mock };

  const mockUser = { id: 1, username: 'testuser' };
  const mockReaderWithEnrollment = {
    id: 42,
    firmware: { capabilities: { cardEnrollment: true } },
  };

  function createMockSocket(overrides: any = {}): any {
    return {
      id: 'socket-1',
      readerId: 42,
      state: {
        lastAuthenticatedUserId: null,
        enrollment: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        ...(overrides.state || {}),
      },
      sendMessage: jest.fn().mockResolvedValue(true),
      sendBinaryData: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    handler = Object.create(AttractapCardHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    websocketService = { sockets: new Map() };
    attractapService = {
      findReaderById: jest.fn().mockResolvedValue(mockReaderWithEnrollment),
      getNFCCardByUID: jest.fn().mockResolvedValue(null),
      getNFCCardByID: jest
        .fn()
        .mockResolvedValue({ id: 7, key: 'aabbccddeeff00112233445566778899', keyNo: 1, user: mockUser }),
      generateNTAG424Key: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      uint8ArrayToHexString: jest.fn().mockReturnValue('deadbeef'),
      createNFCCard: jest.fn().mockResolvedValue({ id: 8 }),
      deleteNFCCard: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    usersService = { findOne: jest.fn().mockResolvedValue(mockUser) };
    resourceUsageService = { canControllResource: jest.fn().mockResolvedValue(true) };
    resourceIntroducersService = { isIntroducer: jest.fn().mockResolvedValue(false) };
    metricsService = { attractapNfcTapsTotal: { inc: jest.fn() } };
    // Default: a resource that does not support supervision (introduction_required).
    resourceRepository = { findOne: jest.fn().mockResolvedValue({ id: 10, supervisionMode: 'introduction_required' }) };
    rbacService = { getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()) };
    audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };

    (handler as any).resourceListService = { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) };
    (handler as any).websocketService = websocketService;
    (handler as any).attractapService = attractapService;
    (handler as any).usersService = usersService;
    (handler as any).resourceUsageService = resourceUsageService;
    (handler as any).resourceIntroducersService = resourceIntroducersService;
    (handler as any).metricsService = metricsService;
    (handler as any).resourceRepository = resourceRepository;
    (handler as any).rbacService = rbacService;
    (handler as any).audit = audit;
  });

  describe('startEnrollOfNewNfcCard', () => {
    it('throws when the reader is not found', async () => {
      attractapService.findReaderById.mockResolvedValueOnce(null);

      await expect(handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader not found: 42',
      );
    });

    it('throws when the reader does not support card enrollment', async () => {
      attractapService.findReaderById.mockResolvedValueOnce({
        id: 42,
        firmware: { capabilities: { cardEnrollment: false } },
      });

      await expect(handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader does not support card enrollment: 42',
      );
    });

    it('throws when the user is not found', async () => {
      usersService.findOne.mockResolvedValueOnce(null);

      await expect(handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'User not found: 1',
      );
    });

    it('throws when there is no connected socket for the reader', async () => {
      const otherSocket = createMockSocket({ id: 'other', readerId: 99 });
      websocketService.sockets.set('other', otherSocket);

      await expect(handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader not connected: 42',
      );
    });

    it('stores the enrollment principal and sends ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', async () => {
      const socket = createMockSocket();
      websocketService.sockets.set('socket-1', socket);

      await handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });

      expect(socket.state.enrollment).toEqual({
        userId: mockUser.id,
        auditPrincipal: { userId: mockUser.id, authenticationMethod: 'session' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
            payload: { username: mockUser.username },
          }),
        }),
      );
    });

    it('swallows a sendMessage rejection (Promise.allSettled) and logs it', async () => {
      const socket = createMockSocket();
      socket.sendMessage.mockRejectedValueOnce(new Error('send failed'));
      websocketService.sockets.set('socket-1', socket);

      await expect(handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).resolves.toBeUndefined();

      expect(socket.state.enrollment).toBeNull();
      expect((handler as any).logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client socket-1'),
      );
    });
  });

  describe('onResetNfcCard', () => {
    it('sends RESET_NFC_CARD_DATA_NOT_SET when no reset state', async () => {
      const socket = createMockSocket();
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onResetNfcCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESET_NFC_CARD,
            payload: { error: 'RESET_NFC_CARD_DATA_NOT_SET' },
          }),
        }),
      );
      expect(attractapService.deleteNFCCard).not.toHaveBeenCalled();
    });

    it('does not delete and keeps state when the reader reports failure', async () => {
      const socket = createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });
      const data = { payload: { success: false } } as AttractapEvent['data'];

      await handler.onResetNfcCard(socket, data);

      expect(attractapService.deleteNFCCard).not.toHaveBeenCalled();
      expect(socket.state.resetNfcCardData).toEqual({ cardId: 7, key: 'x', keyNo: 1 });
    });

    it('deletes the card and clears state on success', async () => {
      const socket = createMockSocket({
        state: {
          resetNfcCardData: {
            cardId: 7, key: 'x', keyNo: 1,
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onResetNfcCard(socket, data);

      expect(attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
      expect(audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.unlinked', actorId: 1, authenticationMethod: 'api-token', apiTokenId: 9, subjectId: 7,
        details: { readerId: 42, source: 'reader-reset' },
      });
      expect(socket.state.resetNfcCardData).toBeNull();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESET_NFC_CARD,
            payload: { success: true },
          }),
        }),
      );
    });

    it('does not audit an unlink when the card was already removed', async () => {
      attractapService.deleteNFCCard.mockResolvedValueOnce({ affected: 0 });
      const socket = createMockSocket({
        state: {
          resetNfcCardData: {
            cardId: 7, key: 'x', keyNo: 1,
            auditPrincipal: { userId: 1, authenticationMethod: 'session' },
          },
        },
      });

      await handler.onResetNfcCard(socket, { payload: { success: true } } as AttractapEvent['data']);

      expect(audit.recordAttractap).not.toHaveBeenCalled();
    });
  });

  describe('onResetNfcCardCancel', () => {
    it('clears reset state', async () => {
      const socket = createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });

      await handler.onResetNfcCardCancel(socket);

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });

  describe('onEnrollNewCardRequestNFCKey', () => {
    it('sends USER_NOT_SET when no enrollment is active', async () => {
      const socket = createMockSocket();
      const data = { payload: { uid: 'abc', keyNo: 1 } } as AttractapEvent['data'];

      await handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
            payload: { error: 'USER_NOT_SET' },
          }),
        }),
      );
      expect(attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    });

    it('sends INVALID_PARAMS when uid is missing', async () => {
      const socket = createMockSocket({ state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } } });
      const data = { payload: { uid: '', keyNo: 1 } } as AttractapEvent['data'];

      await handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
            payload: { error: 'INVALID_PARAMS' },
          }),
        }),
      );
    });

    it('sends INVALID_PARAMS when keyNo is missing', async () => {
      const socket = createMockSocket({ state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } } });
      const data = { payload: { uid: 'abc', keyNo: 0 } } as AttractapEvent['data'];

      await handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
            payload: { error: 'INVALID_PARAMS' },
          }),
        }),
      );
    });

    it('sends CARD_ALREADY_ENROLLED when a card with the uid already exists', async () => {
      const socket = createMockSocket({ state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } } });
      attractapService.getNFCCardByUID.mockResolvedValueOnce({ id: 9 });
      const data = { payload: { uid: 'abc', keyNo: 1 } } as AttractapEvent['data'];

      await handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
            payload: { error: 'CARD_ALREADY_ENROLLED' },
          }),
        }),
      );
      expect(attractapService.generateNTAG424Key).not.toHaveBeenCalled();
    });

    it('generates a key, stores enrollNewCardData and sends ENROLL_NEW_CARD on success', async () => {
      const socket = createMockSocket({ state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } } });
      const data = { payload: { uid: 'abc', keyNo: 2 } } as AttractapEvent['data'];

      await handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(attractapService.generateNTAG424Key).toHaveBeenCalledWith({
        userId: 1,
        keyNo: 2,
        cardUID: 'abc',
      });
      expect(attractapService.uint8ArrayToHexString).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
      expect(socket.state.enrollNewCardData).toEqual({
        keyNo: 2,
        key: 'deadbeef',
        cardUID: 'abc',
        auditPrincipal: { userId: 1, authenticationMethod: 'session' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { key: 'deadbeef', keyNo: 2 },
          }),
        }),
      );
    });
  });

  describe('onEnrollNewCard', () => {
    it('sends ENROLL_NEW_CARD_DATA_NOT_SET when no enrollNewCardData', async () => {
      const socket = createMockSocket();
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onEnrollNewCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'ENROLL_NEW_CARD_DATA_NOT_SET' },
          }),
        }),
      );
    });

    it('logs error and returns without a message when payload.success is false', async () => {
      const socket = createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: { key: 'deadbeef', keyNo: 1, cardUID: 'abc', auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
        },
      });
      const data = { payload: { success: false } } as AttractapEvent['data'];

      await handler.onEnrollNewCard(socket, data);

      expect((handler as any).logger.error).toHaveBeenCalledWith('Enroll new card failed');
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends KEY_NOT_SET when stored data has no key', async () => {
      const socket = createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollNewCardData: { key: '', keyNo: 1, cardUID: 'abc' },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onEnrollNewCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'KEY_NOT_SET' },
          }),
        }),
      );
    });

    it('sends KEY_NOT_SET when stored data has no keyNo', async () => {
      const socket = createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollNewCardData: { key: 'deadbeef', keyNo: 0, cardUID: 'abc' },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onEnrollNewCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'KEY_NOT_SET' },
          }),
        }),
      );
    });

    it('sends USER_NOT_FOUND when the user does not exist', async () => {
      usersService.findOne.mockResolvedValueOnce(null);
      const socket = createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: { key: 'deadbeef', keyNo: 1, cardUID: 'abc', auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onEnrollNewCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
      expect(attractapService.createNFCCard).not.toHaveBeenCalled();
    });

    it('creates the card, clears state and sends success', async () => {
      const socket = createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: { key: 'deadbeef', keyNo: 1, cardUID: 'abc', auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await handler.onEnrollNewCard(socket, data);

      expect(attractapService.createNFCCard).toHaveBeenCalledWith(mockUser, {
        key: 'deadbeef',
        keyNo: 1,
        uid: 'abc',
      });
      expect(audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.linked', actorId: 1, authenticationMethod: 'api-token', apiTokenId: 9, subjectId: 8,
        details: { readerId: 42, source: 'reader-enrollment' },
      });
      expect(socket.state.enrollNewCardData).toBeNull();
      expect(socket.state.enrollment).toBeNull();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { success: true },
          }),
        }),
      );
    });

    it('audits with the enrollment principal when cancellation clears socket state during persistence', async () => {
      let resolveUser!: (user: typeof mockUser) => void;
      usersService.findOne.mockImplementationOnce(() => new Promise((resolve) => {
        resolveUser = resolve;
      }));
      const socket = createMockSocket({
        state: {
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            key: 'deadbeef', keyNo: 1, cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });

      const enrollment = handler.onEnrollNewCard(socket, { payload: { success: true } } as AttractapEvent['data']);
      await handler.onEnrollNewCardCancel(socket);
      resolveUser(mockUser);
      await enrollment;

      expect(audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.linked', actorId: 1, authenticationMethod: 'api-token', apiTokenId: 9, subjectId: 8,
        details: { readerId: 42, source: 'reader-enrollment' },
      });
    });
  });

  it.each(['lookup', 'key generation'])('does not revive cancelled enrollment after %s', async (stage) => {
    const socket = createMockSocket();
    socket.state.enrollment = { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } };
    let finish!: (value: any) => void;
    const pendingLookup = new Promise((resolve) => { finish = resolve; });
    (stage === 'lookup' ? attractapService.getNFCCardByUID : attractapService.generateNTAG424Key)
      .mockReturnValueOnce(pendingLookup);
    const pending = handler.onEnrollNewCardRequestNFCKey(socket, { payload: { uid: 'abc', keyNo: 1 } } as any);
    await new Promise(setImmediate);
    await handler.onEnrollNewCardCancel(socket);
    finish(stage === 'lookup' ? null : new Uint8Array([1, 2, 3]));
    await pending;
    expect(socket.state.enrollNewCardData).toBeNull();
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it('preserves a newer enrollment while auditing an older committed card', async () => {
    const socket = createMockSocket();
    websocketService.sockets.set(socket.id, socket);
    const principal = { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 };
    socket.state.enrollment = { userId: 1, auditPrincipal: principal };
    socket.state.enrollNewCardData = { key: 'deadbeef', keyNo: 1, cardUID: 'abc', auditPrincipal: principal };
    let finish!: (value: { id: number }) => void;
    attractapService.createNFCCard.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = handler.onEnrollNewCard(socket, { payload: { success: true } } as any);
    await new Promise(setImmediate);
    await handler.onEnrollNewCardCancel(socket);
    usersService.findOne.mockResolvedValueOnce({ id: 2, username: 'second' });
    await handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 2 });
    const replacement = socket.state.enrollment;
    finish({ id: 8 });
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
    expect(replacement.userId).toBe(2);
    expect(audit.recordAttractap).toHaveBeenCalledTimes(1);
    expect(audit.recordAttractap).toHaveBeenCalledWith(expect.objectContaining({ actorId: 1, apiTokenId: 9, subjectId: 8 }));
    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer enrollment when the previous send fails late', async () => {
    const socket = createMockSocket();
    websocketService.sockets.set(socket.id, socket);
    let finish!: (delivered: boolean) => void;
    socket.sendMessage.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    await new Promise(setImmediate);
    await handler.onEnrollNewCardCancel(socket);
    await handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    const replacement = socket.state.enrollment;
    finish(false);
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
  });

  describe('startResetOfNfcCard', () => {
    it('reserves once when card lookups complete concurrently', async () => {
      const socket = createMockSocket();
      websocketService.sockets.set(socket.id, socket);
      usersService.findOne.mockImplementation(({ id }) => Promise.resolve({ id, username: `user-${id}` }));
      let finish!: (card: any) => void;
      attractapService.getNFCCardByID
        .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
        .mockResolvedValueOnce({ id: 8, key: 'second-key', keyNo: 2, user: mockUser });
      const first = handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }).catch((error) => error);
      await new Promise(setImmediate);
      await handler.startResetOfNfcCard({ readerId: 42, userId: 2, cardId: 8 });
      finish({ id: 7, key: 'first-key', keyNo: 1, user: mockUser });
      expect(await first).toEqual(expect.objectContaining({ message: 'Reader already has an active card operation: 42' }));
      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
      await handler.onResetNfcCard(socket, { payload: { success: true } } as any);
      expect(attractapService.deleteNFCCard).toHaveBeenCalledWith(8);
      expect(audit.recordAttractap).toHaveBeenCalledWith(expect.objectContaining({ actorId: 2, subjectId: 8 }));
    });
    it('throws when the reader is not found', async () => {
      attractapService.findReaderById.mockResolvedValueOnce(null);

      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('Reader not found: 42');
    });

    it('throws when the user is not found', async () => {
      usersService.findOne.mockResolvedValueOnce(null);

      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('User not found: 1');
    });

    it('throws when there is no connected socket', async () => {
      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('Reader not connected: 42');
    });

    it('throws when the nfc card is not found', async () => {
      const socket = createMockSocket();
      websocketService.sockets.set('socket-1', socket);
      attractapService.getNFCCardByID.mockResolvedValueOnce(null);

      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('NFC card not found: 7');
    });

    it('stores reset state and sends RESET_NFC_CARD with the stored key material on the happy path', async () => {
      const socket = createMockSocket();
      websocketService.sockets.set('socket-1', socket);

      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).resolves.toBeUndefined();

      expect(attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(usersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(attractapService.getNFCCardByID).toHaveBeenCalledWith(7);
      expect(socket.state.resetNfcCardData).toEqual({
        cardId: 7,
        key: 'aabbccddeeff00112233445566778899',
        keyNo: 1,
        auditPrincipal: { userId: 1, authenticationMethod: 'session' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESET_NFC_CARD,
            payload: { username: mockUser.username, keyNo: 1, key: 'aabbccddeeff00112233445566778899' },
          }),
        }),
      );
    });

    it('retains reset state when the command is sent but its ACK is missing', async () => {
      const socket = createMockSocket({ sendMessage: jest.fn().mockResolvedValue(false) });
      websocketService.sockets.set('socket-1', socket);

      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).resolves.toBeUndefined();

      expect(socket.state.resetNfcCardData).toEqual(expect.objectContaining({ cardId: 7 }));
      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('Reader already has an active card operation: 42');

      await handler.onResetNfcCard(socket, { payload: { success: true } } as AttractapEvent['data']);

      expect(attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
      expect(audit.recordAttractap).toHaveBeenCalledWith(expect.objectContaining({
        action: 'card.unlinked',
        subjectId: 7,
      }));
      expect(socket.state.resetNfcCardData).toBeNull();
    });

    it('clears reset state and propagates a send error', async () => {
      const socket = createMockSocket({ sendMessage: jest.fn().mockRejectedValue(new Error('send failed')) });
      websocketService.sockets.set('socket-1', socket);

      await expect(
        handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('send failed');

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });

  describe('handleCardAuthenticationRequest', () => {
    const activeCard = {
      keyNo: 3,
      key: 'cardkey',
      isActive: true,
      user: {
        id: 5,
        username: 'carduser',
      },
    };

    it.each(['pending', 'failed'])('authenticates while the supplemental resource list is %s', async (state) => {
      const socket = createMockSocket();
      const failure = new Error('Resource list unavailable');
      attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      (handler as any).resourceListService.sendResourceListToSocket.mockImplementation(() =>
        state === 'pending' ? new Promise(() => undefined) : Promise.reject(failure),
      );

      await handler.handleCardAuthenticationRequest(socket, {
        payload: { uid: 'abc', resourceId: 10 },
      } as AttractapEvent['data']);

      expect(socket.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CARD_AUTHENTICATION_DATA,
          payload: expect.objectContaining({ key: activeCard.key, username: activeCard.user.username }),
        }),
      }));
      if (state === 'failed') expect((handler as any).logger.error).toHaveBeenCalledWith(expect.any(String), failure);
    });

    it('always increments attractapNfcTapsTotal', async () => {
      const socket = createMockSocket();
      const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(metricsService.attractapNfcTapsTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('sends INVALID_UID when uid is invalid', async () => {
      const socket = createMockSocket();
      const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'INVALID_UID' },
          }),
        }),
      );
      expect(attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    });

    it('sends CARD_NOT_FOUND when the card does not exist', async () => {
      const socket = createMockSocket();
      attractapService.getNFCCardByUID.mockResolvedValueOnce(null);
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'CARD_NOT_FOUND' },
          }),
        }),
      );
    });

    it('sends CARD_NOT_ACTIVE when the card is inactive', async () => {
      const socket = createMockSocket();
      attractapService.getNFCCardByUID.mockResolvedValueOnce({ ...activeCard, isActive: false });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'CARD_NOT_ACTIVE' },
          }),
        }),
      );
      expect(resourceUsageService.canControllResource).not.toHaveBeenCalled();
    });

    it('sets lastAuthenticatedUserId and sends CARD_AUTHENTICATION_DATA on success', async () => {
      const socket = createMockSocket();
      const user = { ...activeCard.user, locale: 'de-DE' };
      attractapService.getNFCCardByUID.mockResolvedValueOnce({
        ...activeCard,
        user,
      });
      resourceUsageService.canControllResource.mockResolvedValueOnce(true);
      resourceIntroducersService.isIntroducer.mockResolvedValueOnce(true);
      rbacService.getEffectivePermissions.mockResolvedValueOnce(new Set(['resources.update']));
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.state.lastAuthenticatedUserId).toBe(activeCard.user.id);
      expect(resourceUsageService.canControllResource).toHaveBeenCalledWith(10, user);
      expect(resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(10, user.id, true);
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: {
              keyNo: activeCard.keyNo,
              key: activeCard.key,
              username: activeCard.user.username,
              language: 'de',
              canManageResource: true,
              hasIntroduction: true,
              isIntroducer: true,
              supervisionMode: 'introduction_required',
              requiresSupervisor: false,
            },
          }),
        }),
      );
    });

    it('flags requiresSupervisor for a SUPERVISION_REQUIRED resource even when introduced', async () => {
      const socket = createMockSocket();
      attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      resourceUsageService.canControllResource.mockResolvedValueOnce(true);
      resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
      resourceRepository.findOne.mockResolvedValueOnce({ id: 10, supervisionMode: 'supervision_required' });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({ supervisionMode: 'supervision_required', requiresSupervisor: true }),
          }),
        }),
      );
    });

    it('keeps requiresSupervisor in the auth payload for SUPERVISION_ALLOWED when the user has no introduction', async () => {
      const socket = createMockSocket();
      attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      resourceUsageService.canControllResource.mockResolvedValueOnce(false);
      resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
      resourceRepository.findOne.mockResolvedValueOnce({ id: 10, supervisionMode: 'supervision_allowed' });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({ supervisionMode: 'supervision_allowed', requiresSupervisor: true }),
          }),
        }),
      );
    });
  });
});
