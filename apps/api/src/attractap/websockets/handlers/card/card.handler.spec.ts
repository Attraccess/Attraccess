/* eslint-disable @typescript-eslint/no-explicit-any */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { inheritTestScope } from '../../../../test-utils/inherit-test-scope';

import { AttractapEventType } from '../../websocket.types';

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
      ).rejects.toThrow(NotFoundException);
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
      ).rejects.toThrow(ConflictException);
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

  describe('enrollment and reset of cards that only relay APDUs', () => {
    it('refuses to arm enrollment on a reader without relay firmware', async () => {
      const socket = scope.createMockSocket({ state: { cardRelay: false } });
      scope.websocketService.sockets.set(socket.id, socket);

      await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader firmware must be updated to enroll cards: 42',
      );
      expect(socket.state.enrollment).toBeFalsy();
    });

    it('refuses to arm enrollment on a reader the admin policy excludes', async () => {
      const socket = scope.createMockSocket();
      scope.websocketService.sockets.set(socket.id, socket);
      (scope.handler as any).cardWriterPolicy.assertAllowed.mockRejectedValueOnce(new Error('not allowed'));

      await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow('not allowed');
      expect(socket.state.enrollment).toBeNull();
    });

    it('enrolls for the target user and keeps the admin API-token principal for the audit trail', async () => {
      const socket = scope.createMockSocket();
      scope.websocketService.sockets.set(socket.id, socket);
      await scope.handler.startEnrollOfNewNfcCard({
        readerId: 42,
        userId: 1,
        actorId: 99,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
      });
      await scope.handler.handleEnrollCard(socket, '04aabbcc');

      expect((scope.handler as any).cardOperations.enroll).toHaveBeenCalledWith(socket, '04aabbcc', {
        userId: 1,
        auditPrincipal: { userId: 99, authenticationMethod: 'api-token', apiTokenId: 9 },
      });
    });

    it('reports success to the reader only after the server enrolled the card', async () => {
      const socket = scope.createMockSocket();
      scope.websocketService.sockets.set(socket.id, socket);
      await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
      socket.sendMessage.mockClear();

      await scope.handler.handleEnrollCard(socket, '04aabbcc');

      expect(socket.state.enrollment).toBeNull();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AttractapEventType.ENROLL_NEW_CARD, payload: { success: true } }),
        }),
      );
    });

    it('keeps the enrollment armed and reports the reason when the card was not confirmed', async () => {
      const socket = scope.createMockSocket();
      scope.websocketService.sockets.set(socket.id, socket);
      await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
      socket.sendMessage.mockClear();
      (scope.handler as any).cardOperations.enroll.mockResolvedValueOnce({ ok: false, error: 'ENROLL_NOT_CONFIRMED' });

      await scope.handler.handleEnrollCard(socket, '04aabbcc');

      expect(socket.state.enrollment).not.toBeNull();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'ENROLL_NOT_CONFIRMED' },
          }),
        }),
      );
    });

    it('does not enroll a card when no enrollment was armed', async () => {
      const socket = scope.createMockSocket();

      await scope.handler.handleEnrollCard(socket, '04aabbcc');

      expect((scope.handler as any).cardOperations.enroll).not.toHaveBeenCalled();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payload: { error: 'USER_NOT_SET' } }) }),
      );
    });

    it('clears the armed enrollment when the reader cancels', async () => {
      const socket = scope.createMockSocket({ state: { enrollment: { userId: 1 } } });

      await scope.handler.onEnrollNewCardCancel(socket);

      expect(socket.state.enrollment).toBeNull();
    });

    it('reports reset success only after the server reset the card', async () => {
      const socket = scope.createMockSocket();
      scope.websocketService.sockets.set(socket.id, socket);
      await scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 });
      socket.sendMessage.mockClear();

      await scope.handler.handleResetCard(socket, '04aabbcc');

      expect((scope.handler as any).cardOperations.reset).toHaveBeenCalledWith(socket, '04aabbcc', {
        cardId: 7,
        auditPrincipal: { userId: 1, authenticationMethod: 'session' },
      });
      expect(socket.state.resetNfcCardData).toBeNull();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AttractapEventType.RESET_NFC_CARD, payload: { success: true } }),
        }),
      );
    });

    it('keeps the reset armed so the reader can retry when the card was not confirmed', async () => {
      const socket = scope.createMockSocket();
      scope.websocketService.sockets.set(socket.id, socket);
      await scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 });
      (scope.handler as any).cardOperations.reset.mockResolvedValueOnce({ ok: false, error: 'RESET_NOT_CONFIRMED' });

      await scope.handler.handleResetCard(socket, '04aabbcc');

      expect(socket.state.resetNfcCardData).not.toBeNull();
    });

    it('answers a reset presentation without an armed reset', async () => {
      const socket = scope.createMockSocket();

      await scope.handler.handleResetCard(socket, '04aabbcc');

      expect((scope.handler as any).cardOperations.reset).not.toHaveBeenCalled();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { error: 'RESET_NFC_CARD_DATA_NOT_SET' } }),
        }),
      );
    });

    it('clears the armed reset when the reader cancels', async () => {
      const socket = scope.createMockSocket({ state: { resetNfcCardData: { cardId: 7 } } });

      await scope.handler.onResetNfcCardCancel(socket);

      expect(socket.state.resetNfcCardData).toBeNull();
    });
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
      expect(socket.state.resetNfcCardData).toEqual(expect.objectContaining({ cardId: 8 }));
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

    it('stores reset state and sends RESET_NFC_CARD without any key material on the happy path', async () => {
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
        auditPrincipal: { userId: 1, authenticationMethod: 'session' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESET_NFC_CARD,
            payload: { username: startResetOfNfcCardScope.mockUser.username },
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
      ).rejects.toThrow(ConflictException);

      expect(socket.state.resetNfcCardData).toEqual(expect.objectContaining({ cardId: 7 }));
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
