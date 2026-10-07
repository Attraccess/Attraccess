/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEventType } from '../websocket.types';
import { registerFixture0 } from './card.handler.attractap-card-handler.test-fixture';
export function registerCases0_0(fixture: ReturnType<typeof registerFixture0>) {
  describe('startEnrollOfNewNfcCard', () => {
    it('throws when the reader is not found', async () => {
      fixture.attractapService.findReaderById.mockResolvedValueOnce(null);

      await expect(fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader not found: 42',
      );
    });

    it('throws when the reader does not support card enrollment', async () => {
      fixture.attractapService.findReaderById.mockResolvedValueOnce({
        id: 42,
        firmware: { capabilities: { cardEnrollment: false } },
      });

      await expect(fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader does not support card enrollment: 42',
      );
    });

    it('throws when the user is not found', async () => {
      fixture.usersService.findOne.mockResolvedValueOnce(null);

      await expect(fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'User not found: 1',
      );
    });

    it('throws when there is no connected socket for the reader', async () => {
      const otherSocket = fixture.createMockSocket({ id: 'other', readerId: 99 });
      fixture.websocketService.sockets.set('other', otherSocket);

      await expect(fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
        'Reader not connected: 42',
      );
    });

    it('stores the enrollment principal and sends ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', async () => {
      const socket = fixture.createMockSocket();
      fixture.websocketService.sockets.set('socket-1', socket);

      await fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });

      expect(socket.state.enrollment).toEqual({
        userId: fixture.mockUser.id,
        auditPrincipal: { userId: fixture.mockUser.id, authenticationMethod: 'session' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
            payload: { username: fixture.mockUser.username },
          }),
        }),
      );
    });

    it('swallows a sendMessage rejection (Promise.allSettled) and logs it', async () => {
      const socket = fixture.createMockSocket();
      socket.sendMessage.mockRejectedValueOnce(new Error('send failed'));
      fixture.websocketService.sockets.set('socket-1', socket);

      await expect(fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).resolves.toBeUndefined();

      expect(socket.state.enrollment).toBeNull();
      expect((fixture.handler as any).logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client socket-1'),
      );
    });
  });
}
