/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { registerFixture0 } from './card.handler.attractap-card-handler.test-fixture';
export function registerCases0_4(fixture: ReturnType<typeof registerFixture0>) {
  describe('onEnrollNewCard', () => {
    it('sends ENROLL_NEW_CARD_DATA_NOT_SET when no enrollNewCardData', async () => {
      const socket = fixture.createMockSocket();
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await fixture.handler.onEnrollNewCard(socket, data);

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
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: false } } as AttractapEvent['data'];

      await fixture.handler.onEnrollNewCard(socket, data);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith('Enroll new card failed');
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends KEY_NOT_SET when stored data has no key', async () => {
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollNewCardData: { key: '', keyNo: 1, cardUID: 'abc' },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await fixture.handler.onEnrollNewCard(socket, data);

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
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollNewCardData: { key: 'deadbeef', keyNo: 0, cardUID: 'abc' },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await fixture.handler.onEnrollNewCard(socket, data);

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
      fixture.usersService.findOne.mockResolvedValueOnce(null);
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await fixture.handler.onEnrollNewCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
      expect(fixture.attractapService.createNFCCard).not.toHaveBeenCalled();
    });

    it('creates the card, clears state and sends success', async () => {
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await fixture.handler.onEnrollNewCard(socket, data);

      expect(fixture.attractapService.createNFCCard).toHaveBeenCalledWith(fixture.mockUser, {
        key: 'deadbeef',
        keyNo: 1,
        uid: 'abc',
      });
      expect(fixture.audit.recordAttractap).toHaveBeenCalledWith({
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
      let resolveUser!: (user: typeof fixture.mockUser) => void;
      fixture.usersService.findOne.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUser = resolve;
          }),
      );
      const socket = fixture.createMockSocket({
        state: {
          enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 } },
          enrollNewCardData: {
            key: 'deadbeef',
            keyNo: 1,
            cardUID: 'abc',
            auditPrincipal: { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 },
          },
        },
      });

      const enrollment = fixture.handler.onEnrollNewCard(socket, {
        payload: { success: true },
      } as AttractapEvent['data']);
      await fixture.handler.onEnrollNewCardCancel(socket);
      resolveUser(fixture.mockUser);
      await enrollment;

      expect(fixture.audit.recordAttractap).toHaveBeenCalledWith({
        action: 'card.linked',
        actorId: 1,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectId: 8,
        details: { readerId: 42, source: 'reader-enrollment' },
      });
    });
  });
}
