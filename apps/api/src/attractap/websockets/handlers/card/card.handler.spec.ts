/* eslint-disable @typescript-eslint/no-explicit-any */

import { inheritTestScope } from '../../../../test-utils/inherit-test-scope';

import { AttractapEvent, AttractapEventType } from '../../websocket.types';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createAttractapCardHandlerFixture } from './fixtures/handler.test-fixture';

import { createHandleCardAuthenticationRequestFixture } from './fixtures/authentication.test-fixture';

export type AttractapCardHandlerTestScope = ReturnType<typeof createAttractapCardHandlerFixture>;

export type HandleCardAuthenticationRequestTestScope = ReturnType<typeof createHandleCardAuthenticationRequestFixture>;

describe('AttractapCardHandler', () => {
  const scope = createAttractapCardHandlerFixture();

  beforeEach(() => {
    resetTestFixture(scope);
  });

  describe('startEnrollOfNewNfcCard', () => {
    const startEnrollOfNewNfcCardScope = inheritTestScope(
      {
        get attractapService() {
          return scope.attractapService;
        },
        set attractapService(value: typeof scope.attractapService) {
          scope.attractapService = value;
        },
        get handler() {
          return scope.handler;
        },
        set handler(value: typeof scope.handler) {
          scope.handler = value;
        },
        get usersService() {
          return scope.usersService;
        },
        set usersService(value: typeof scope.usersService) {
          scope.usersService = value;
        },
        get createMockSocket() {
          return scope.createMockSocket;
        },
        get websocketService() {
          return scope.websocketService;
        },
        set websocketService(value: typeof scope.websocketService) {
          scope.websocketService = value;
        },
        get mockUser() {
          return scope.mockUser;
        },
      },
      scope,
    );

    it('throws when the reader is not found', async () => {
      startEnrollOfNewNfcCardScope.attractapService.findReaderById.mockResolvedValueOnce(null);

      await expect(
        startEnrollOfNewNfcCardScope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 }),
      ).rejects.toThrow('Reader not found: 42');
    });

    it('throws when the reader does not support card enrollment', async () => {
      startEnrollOfNewNfcCardScope.attractapService.findReaderById.mockResolvedValueOnce({
        id: 42,
        firmware: { capabilities: { cardEnrollment: false } },
      });

      await expect(
        startEnrollOfNewNfcCardScope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 }),
      ).rejects.toThrow('Reader does not support card enrollment: 42');
    });

    it('throws when the user is not found', async () => {
      startEnrollOfNewNfcCardScope.usersService.findOne.mockResolvedValueOnce(null);

      await expect(
        startEnrollOfNewNfcCardScope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 }),
      ).rejects.toThrow('User not found: 1');
    });

    it('throws when there is no connected socket for the reader', async () => {
      const otherSocket = startEnrollOfNewNfcCardScope.createMockSocket({ id: 'other', readerId: 99 });
      startEnrollOfNewNfcCardScope.websocketService.sockets.set('other', otherSocket);

      await expect(
        startEnrollOfNewNfcCardScope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 }),
      ).rejects.toThrow('Reader not connected: 42');
    });

    it('stores the enrollment principal and sends ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', async () => {
      const socket = startEnrollOfNewNfcCardScope.createMockSocket();
      startEnrollOfNewNfcCardScope.websocketService.sockets.set('socket-1', socket);

      await startEnrollOfNewNfcCardScope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });

      expect(socket.state.enrollment).toEqual({
        userId: startEnrollOfNewNfcCardScope.mockUser.id,
        auditPrincipal: { userId: startEnrollOfNewNfcCardScope.mockUser.id, authenticationMethod: 'session' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
            payload: { username: startEnrollOfNewNfcCardScope.mockUser.username },
          }),
        }),
      );
    });

    it('swallows a sendMessage rejection (Promise.allSettled) and logs it', async () => {
      const socket = startEnrollOfNewNfcCardScope.createMockSocket();
      socket.sendMessage.mockRejectedValueOnce(new Error('send failed'));
      startEnrollOfNewNfcCardScope.websocketService.sockets.set('socket-1', socket);

      await expect(
        startEnrollOfNewNfcCardScope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 }),
      ).resolves.toBeUndefined();

      expect(socket.state.enrollment).toBeNull();
      expect((startEnrollOfNewNfcCardScope.handler as any).logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client socket-1'),
      );
    });
  });

  it('enrolls for the target user while auditing the admin API-token principal', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    await scope.handler.startEnrollOfNewNfcCard({
      readerId: 42,
      userId: 1,
      actorId: 99,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
    await scope.handler.onEnrollNewCardRequestNFCKey(socket, {
      payload: { uid: 'abc', keyNo: 1 },
    } as AttractapEvent['data']);
    await scope.handler.onEnrollNewCard(socket, { payload: { success: true } } as AttractapEvent['data']);
    expect(scope.attractapService.generateNTAG424Key).toHaveBeenCalledWith({ userId: 1, cardUID: 'abc', keyNo: 1 });
    expect(scope.usersService.findOne).toHaveBeenLastCalledWith({ id: 1 });
    expect(scope.attractapService.createNFCCard).toHaveBeenCalledWith(scope.mockUser, {
      uid: 'abc',
      key: 'deadbeef',
      keyNo: 1,
    });
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 99, authenticationMethod: 'api-token', apiTokenId: 9 }),
    );
  });

  describe('onResetNfcCard', () => {
    const onResetNfcCardScope = inheritTestScope(
      {
        get createMockSocket() {
          return scope.createMockSocket;
        },
        get handler() {
          return scope.handler;
        },
        set handler(value: typeof scope.handler) {
          scope.handler = value;
        },
        get attractapService() {
          return scope.attractapService;
        },
        set attractapService(value: typeof scope.attractapService) {
          scope.attractapService = value;
        },
        get audit() {
          return scope.audit;
        },
        set audit(value: typeof scope.audit) {
          scope.audit = value;
        },
      },
      scope,
    );

    it('sends RESET_NFC_CARD_DATA_NOT_SET when no reset state', async () => {
      const socket = onResetNfcCardScope.createMockSocket();
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onResetNfcCardScope.handler.onResetNfcCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESET_NFC_CARD,
            payload: { error: 'RESET_NFC_CARD_DATA_NOT_SET' },
          }),
        }),
      );
      expect(onResetNfcCardScope.attractapService.deleteNFCCard).not.toHaveBeenCalled();
    });

    it('does not delete and keeps state when the reader reports failure', async () => {
      const socket = onResetNfcCardScope.createMockSocket({
        state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } },
      });
      const data = { payload: { success: false } } as AttractapEvent['data'];

      await onResetNfcCardScope.handler.onResetNfcCard(socket, data);

      expect(onResetNfcCardScope.attractapService.deleteNFCCard).not.toHaveBeenCalled();
      expect(socket.state.resetNfcCardData).toEqual({ cardId: 7, key: 'x', keyNo: 1 });
    });

    it('deletes the card and clears state on success', async () => {
      const socket = onResetNfcCardScope.createMockSocket({
        state: {
          resetNfcCardData: {
            cardId: 7,
            key: 'x',
            keyNo: 1,
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onResetNfcCardScope.handler.onResetNfcCard(socket, data);

      expect(onResetNfcCardScope.attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
      expect(onResetNfcCardScope.audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.unlinked',
        actorId: 1,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectId: 7,
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
      onResetNfcCardScope.attractapService.deleteNFCCard.mockResolvedValueOnce({ affected: 0 });
      const socket = onResetNfcCardScope.createMockSocket({
        state: {
          resetNfcCardData: {
            cardId: 7,
            key: 'x',
            keyNo: 1,
            auditPrincipal: { userId: 1, authenticationMethod: 'session' },
          },
        },
      });

      await onResetNfcCardScope.handler.onResetNfcCard(socket, {
        payload: { success: true },
      } as AttractapEvent['data']);

      expect(onResetNfcCardScope.audit.recordAttractap).not.toHaveBeenCalled();
    });
  });

  describe('onResetNfcCardCancel', () => {
    it('clears reset state', async () => {
      const socket = scope.createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });

      await scope.handler.onResetNfcCardCancel(socket);

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });

  describe('onEnrollNewCardRequestNFCKey', () => {
    const onEnrollNewCardRequestNfckeyScope = inheritTestScope(
      {
        get createMockSocket() {
          return scope.createMockSocket;
        },
        get handler() {
          return scope.handler;
        },
        set handler(value: typeof scope.handler) {
          scope.handler = value;
        },
        get attractapService() {
          return scope.attractapService;
        },
        set attractapService(value: typeof scope.attractapService) {
          scope.attractapService = value;
        },
      },
      scope,
    );

    it('sends USER_NOT_SET when no enrollment is active', async () => {
      const socket = onEnrollNewCardRequestNfckeyScope.createMockSocket();
      const data = { payload: { uid: 'abc', keyNo: 1 } } as AttractapEvent['data'];

      await onEnrollNewCardRequestNfckeyScope.handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
            payload: { error: 'USER_NOT_SET' },
          }),
        }),
      );
      expect(onEnrollNewCardRequestNfckeyScope.attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    });

    it('sends INVALID_PARAMS when uid is missing', async () => {
      const socket = onEnrollNewCardRequestNfckeyScope.createMockSocket({
        state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
      });
      const data = { payload: { uid: '', keyNo: 1 } } as AttractapEvent['data'];

      await onEnrollNewCardRequestNfckeyScope.handler.onEnrollNewCardRequestNFCKey(socket, data);

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
      const socket = onEnrollNewCardRequestNfckeyScope.createMockSocket({
        state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
      });
      const data = { payload: { uid: 'abc', keyNo: 0 } } as AttractapEvent['data'];

      await onEnrollNewCardRequestNfckeyScope.handler.onEnrollNewCardRequestNFCKey(socket, data);

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
      const socket = onEnrollNewCardRequestNfckeyScope.createMockSocket({
        state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
      });
      onEnrollNewCardRequestNfckeyScope.attractapService.getNFCCardByUID.mockResolvedValueOnce({ id: 9 });
      const data = { payload: { uid: 'abc', keyNo: 1 } } as AttractapEvent['data'];

      await onEnrollNewCardRequestNfckeyScope.handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
            payload: { error: 'CARD_ALREADY_ENROLLED' },
          }),
        }),
      );
      expect(onEnrollNewCardRequestNfckeyScope.attractapService.generateNTAG424Key).not.toHaveBeenCalled();
    });

    it('generates a key, stores enrollNewCardData and sends ENROLL_NEW_CARD on success', async () => {
      const socket = onEnrollNewCardRequestNfckeyScope.createMockSocket({
        state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
      });
      const data = { payload: { uid: 'abc', keyNo: 2 } } as AttractapEvent['data'];

      await onEnrollNewCardRequestNfckeyScope.handler.onEnrollNewCardRequestNFCKey(socket, data);

      expect(onEnrollNewCardRequestNfckeyScope.attractapService.generateNTAG424Key).toHaveBeenCalledWith({
        userId: 1,
        keyNo: 2,
        cardUID: 'abc',
      });
      expect(onEnrollNewCardRequestNfckeyScope.attractapService.uint8ArrayToHexString).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
      );
      expect(socket.state.enrollNewCardData).toEqual({
        userId: 1,
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
    const onEnrollNewCardScope = inheritTestScope(
      {
        get createMockSocket() {
          return scope.createMockSocket;
        },
        get handler() {
          return scope.handler;
        },
        set handler(value: typeof scope.handler) {
          scope.handler = value;
        },
        get usersService() {
          return scope.usersService;
        },
        set usersService(value: typeof scope.usersService) {
          scope.usersService = value;
        },
        get attractapService() {
          return scope.attractapService;
        },
        set attractapService(value: typeof scope.attractapService) {
          scope.attractapService = value;
        },
        get mockUser() {
          return scope.mockUser;
        },
        get audit() {
          return scope.audit;
        },
        set audit(value: typeof scope.audit) {
          scope.audit = value;
        },
      },
      scope,
    );

    it('sends ENROLL_NEW_CARD_DATA_NOT_SET when no enrollNewCardData', async () => {
      const socket = onEnrollNewCardScope.createMockSocket();
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onEnrollNewCardScope.handler.onEnrollNewCard(socket, data);

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
      const socket = onEnrollNewCardScope.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            userId: 1,
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: false } } as AttractapEvent['data'];

      await onEnrollNewCardScope.handler.onEnrollNewCard(socket, data);

      expect((onEnrollNewCardScope.handler as any).logger.error).toHaveBeenCalledWith('Enroll new card failed');
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends KEY_NOT_SET when stored data has no key', async () => {
      const socket = onEnrollNewCardScope.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollNewCardData: { userId: 1, key: '', keyNo: 1, cardUID: 'abc' },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onEnrollNewCardScope.handler.onEnrollNewCard(socket, data);

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
      const socket = onEnrollNewCardScope.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollNewCardData: { userId: 1, key: 'deadbeef', keyNo: 0, cardUID: 'abc' },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onEnrollNewCardScope.handler.onEnrollNewCard(socket, data);

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
      onEnrollNewCardScope.usersService.findOne.mockResolvedValueOnce(null);
      const socket = onEnrollNewCardScope.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            userId: 1,
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onEnrollNewCardScope.handler.onEnrollNewCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
      expect(onEnrollNewCardScope.attractapService.createNFCCard).not.toHaveBeenCalled();
    });

    it('creates the card, clears state and sends success', async () => {
      const socket = onEnrollNewCardScope.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            userId: 1,
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await onEnrollNewCardScope.handler.onEnrollNewCard(socket, data);

      expect(onEnrollNewCardScope.attractapService.createNFCCard).toHaveBeenCalledWith(onEnrollNewCardScope.mockUser, {
        key: 'deadbeef',
        keyNo: 1,
        uid: 'abc',
      });
      expect(onEnrollNewCardScope.audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.linked',
        actorId: 1,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectId: 8,
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
      let resolveUser!: (user: typeof onEnrollNewCardScope.mockUser) => void;
      onEnrollNewCardScope.usersService.findOne.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUser = resolve;
          }),
      );
      const socket = onEnrollNewCardScope.createMockSocket({
        state: {
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            userId: 1,
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });

      const enrollment = onEnrollNewCardScope.handler.onEnrollNewCard(socket, {
        payload: { success: true },
      } as AttractapEvent['data']);
      await onEnrollNewCardScope.handler.onEnrollNewCardCancel(socket);
      resolveUser(onEnrollNewCardScope.mockUser);
      await enrollment;

      expect(onEnrollNewCardScope.audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.linked',
        actorId: 1,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectId: 8,
        details: { readerId: 42, source: 'reader-enrollment' },
      });
    });
  });

  it.each(['lookup', 'key generation'])('does not revive cancelled enrollment after %s', async (stage) => {
    const socket = scope.createMockSocket();
    socket.state.enrollment = { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } };
    let finish!: (value: any) => void;
    const pendingLookup = new Promise((resolve) => {
      finish = resolve;
    });
    (stage === 'lookup'
      ? scope.attractapService.getNFCCardByUID
      : scope.attractapService.generateNTAG424Key
    ).mockReturnValueOnce(pendingLookup);
    const pending = scope.handler.onEnrollNewCardRequestNFCKey(socket, { payload: { uid: 'abc', keyNo: 1 } } as any);
    await new Promise(setImmediate);
    await scope.handler.onEnrollNewCardCancel(socket);
    finish(stage === 'lookup' ? null : new Uint8Array([1, 2, 3]));
    await pending;
    expect(socket.state.enrollNewCardData).toBeNull();
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it('preserves a newer enrollment while auditing an older committed card', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    const principal = { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 };
    socket.state.enrollment = { userId: 1, auditPrincipal: principal };
    socket.state.enrollNewCardData = {
      userId: 1,
      key: 'deadbeef',
      keyNo: 1,
      cardUID: 'abc',
      auditPrincipal: principal,
    };
    let finish!: (value: { id: number }) => void;
    scope.attractapService.createNFCCard.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = scope.handler.onEnrollNewCard(socket, { payload: { success: true } } as any);
    await new Promise(setImmediate);
    await scope.handler.onEnrollNewCardCancel(socket);
    scope.usersService.findOne.mockResolvedValueOnce({ id: 2, username: 'second' });
    await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 2 });
    const replacement = socket.state.enrollment;
    finish({ id: 8 });
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
    expect(replacement.userId).toBe(2);
    expect(scope.audit.recordAttractap).toHaveBeenCalledTimes(1);
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 1, apiTokenId: 9, subjectId: 8 }),
    );
    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer enrollment when the previous send fails late', async () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    let finish!: (delivered: boolean) => void;
    socket.sendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    await new Promise(setImmediate);
    await scope.handler.onEnrollNewCardCancel(socket);
    await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    const replacement = socket.state.enrollment;
    finish(false);
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
  });

  describe('startResetOfNfcCard', () => {
    const startResetOfNfcCardScope = inheritTestScope(
      {
        get createMockSocket() {
          return scope.createMockSocket;
        },
        get websocketService() {
          return scope.websocketService;
        },
        set websocketService(value: typeof scope.websocketService) {
          scope.websocketService = value;
        },
        get usersService() {
          return scope.usersService;
        },
        set usersService(value: typeof scope.usersService) {
          scope.usersService = value;
        },
        get attractapService() {
          return scope.attractapService;
        },
        set attractapService(value: typeof scope.attractapService) {
          scope.attractapService = value;
        },
        get mockUser() {
          return scope.mockUser;
        },
        get handler() {
          return scope.handler;
        },
        set handler(value: typeof scope.handler) {
          scope.handler = value;
        },
        get audit() {
          return scope.audit;
        },
        set audit(value: typeof scope.audit) {
          scope.audit = value;
        },
      },
      scope,
    );

    it('reserves once when card lookups complete concurrently', async () => {
      const socket = startResetOfNfcCardScope.createMockSocket();
      startResetOfNfcCardScope.websocketService.sockets.set(socket.id, socket);
      startResetOfNfcCardScope.usersService.findOne.mockImplementation(({ id }) =>
        Promise.resolve({ id, username: `user-${id}` }),
      );
      let finish!: (card: any) => void;
      startResetOfNfcCardScope.attractapService.getNFCCardByID
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          }),
        )
        .mockResolvedValueOnce({ id: 8, key: 'second-key', keyNo: 2, user: startResetOfNfcCardScope.mockUser });
      const first = startResetOfNfcCardScope.handler
        .startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })
        .catch((error) => error);
      await new Promise(setImmediate);
      await startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 2, cardId: 8 });
      finish({ id: 7, key: 'first-key', keyNo: 1, user: startResetOfNfcCardScope.mockUser });
      expect(await first).toEqual(
        expect.objectContaining({ message: 'Reader already has an active card operation: 42' }),
      );
      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
      await startResetOfNfcCardScope.handler.onResetNfcCard(socket, { payload: { success: true } } as any);
      expect(startResetOfNfcCardScope.attractapService.deleteNFCCard).toHaveBeenCalledWith(8);
      expect(startResetOfNfcCardScope.audit.recordAttractap).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 2, subjectId: 8 }),
      );
    });

    it('throws when the reader is not found', async () => {
      startResetOfNfcCardScope.attractapService.findReaderById.mockResolvedValueOnce(null);

      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('Reader not found: 42');
    });

    it('throws when the user is not found', async () => {
      startResetOfNfcCardScope.usersService.findOne.mockResolvedValueOnce(null);

      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('User not found: 1');
    });

    it('throws when there is no connected socket', async () => {
      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('Reader not connected: 42');
    });

    it('throws when the nfc card is not found', async () => {
      const socket = startResetOfNfcCardScope.createMockSocket();
      startResetOfNfcCardScope.websocketService.sockets.set('socket-1', socket);
      startResetOfNfcCardScope.attractapService.getNFCCardByID.mockResolvedValueOnce(null);

      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('NFC card not found: 7');
    });

    it('stores reset state and sends RESET_NFC_CARD with the stored key material on the happy path', async () => {
      const socket = startResetOfNfcCardScope.createMockSocket();
      startResetOfNfcCardScope.websocketService.sockets.set('socket-1', socket);

      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).resolves.toBeUndefined();

      expect(startResetOfNfcCardScope.attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(startResetOfNfcCardScope.usersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(startResetOfNfcCardScope.attractapService.getNFCCardByID).toHaveBeenCalledWith(7);
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
            payload: {
              username: startResetOfNfcCardScope.mockUser.username,
              keyNo: 1,
              key: 'aabbccddeeff00112233445566778899',
            },
          }),
        }),
      );
    });

    it('retains reset state when the command is sent but its ACK is missing', async () => {
      const socket = startResetOfNfcCardScope.createMockSocket({ sendMessage: jest.fn().mockResolvedValue(false) });
      startResetOfNfcCardScope.websocketService.sockets.set('socket-1', socket);

      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).resolves.toBeUndefined();

      expect(socket.state.resetNfcCardData).toEqual(expect.objectContaining({ cardId: 7 }));
      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('Reader already has an active card operation: 42');

      await startResetOfNfcCardScope.handler.onResetNfcCard(socket, {
        payload: { success: true },
      } as AttractapEvent['data']);

      expect(startResetOfNfcCardScope.attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
      expect(startResetOfNfcCardScope.audit.recordAttractap).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'card.unlinked',
          subjectId: 7,
        }),
      );
      expect(socket.state.resetNfcCardData).toBeNull();
    });

    it('clears reset state and propagates a send error', async () => {
      const socket = startResetOfNfcCardScope.createMockSocket({
        sendMessage: jest.fn().mockRejectedValue(new Error('send failed')),
      });
      startResetOfNfcCardScope.websocketService.sockets.set('socket-1', socket);

      await expect(
        startResetOfNfcCardScope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).rejects.toThrow('send failed');

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });
});
