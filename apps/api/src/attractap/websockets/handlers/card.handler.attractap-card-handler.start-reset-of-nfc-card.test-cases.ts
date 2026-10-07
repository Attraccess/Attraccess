/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { registerFixture0 } from './card.handler.attractap-card-handler.test-fixture';
export function registerCases0_8(fixture: ReturnType<typeof registerFixture0>) {
  describe('startResetOfNfcCard', () => {
    it('reserves once when card lookups complete concurrently', async () => {
      const socket = fixture.createMockSocket();
      fixture.websocketService.sockets.set(socket.id, socket);
      fixture.usersService.findOne.mockImplementation(({ id }) => Promise.resolve({ id, username: `user-${id}` }));
      let finish!: (card: any) => void;
      fixture.attractapService.getNFCCardByID
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          }),
        )
        .mockResolvedValueOnce({ id: 8, key: 'second-key', keyNo: 2, user: fixture.mockUser });
      const first = fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }).catch((error) => error);
      await new Promise(setImmediate);
      await fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 2, cardId: 8 });
      finish({ id: 7, key: 'first-key', keyNo: 1, user: fixture.mockUser });
      expect(await first).toEqual(
        expect.objectContaining({ message: 'Reader already has an active card operation: 42' }),
      );
      expect(socket.sendMessage).toHaveBeenCalledTimes(1);
      await fixture.handler.onResetNfcCard(socket, { payload: { success: true } } as any);
      expect(fixture.attractapService.deleteNFCCard).toHaveBeenCalledWith(8);
      expect(fixture.audit.recordAttractap).toHaveBeenCalledWith(expect.objectContaining({ actorId: 2, subjectId: 8 }));
    });
    it('throws when the reader is not found', async () => {
      fixture.attractapService.findReaderById.mockResolvedValueOnce(null);

      await expect(fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'Reader not found: 42',
      );
    });

    it('throws when the user is not found', async () => {
      fixture.usersService.findOne.mockResolvedValueOnce(null);

      await expect(fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'User not found: 1',
      );
    });

    it('throws when there is no connected socket', async () => {
      await expect(fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'Reader not connected: 42',
      );
    });

    it('throws when the nfc card is not found', async () => {
      const socket = fixture.createMockSocket();
      fixture.websocketService.sockets.set('socket-1', socket);
      fixture.attractapService.getNFCCardByID.mockResolvedValueOnce(null);

      await expect(fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'NFC card not found: 7',
      );
    });

    it('stores reset state and sends RESET_NFC_CARD with the stored key material on the happy path', async () => {
      const socket = fixture.createMockSocket();
      fixture.websocketService.sockets.set('socket-1', socket);

      await expect(
        fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).resolves.toBeUndefined();

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(fixture.usersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(fixture.attractapService.getNFCCardByID).toHaveBeenCalledWith(7);
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
            payload: { username: fixture.mockUser.username, keyNo: 1, key: 'aabbccddeeff00112233445566778899' },
          }),
        }),
      );
    });

    it('retains reset state when the command is sent but its ACK is missing', async () => {
      const socket = fixture.createMockSocket({ sendMessage: jest.fn().mockResolvedValue(false) });
      fixture.websocketService.sockets.set('socket-1', socket);

      await expect(
        fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
      ).resolves.toBeUndefined();

      expect(socket.state.resetNfcCardData).toEqual(expect.objectContaining({ cardId: 7 }));
      await expect(fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'Reader already has an active card operation: 42',
      );

      await fixture.handler.onResetNfcCard(socket, { payload: { success: true } } as AttractapEvent['data']);

      expect(fixture.attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
      expect(fixture.audit.recordAttractap).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'card.unlinked',
          subjectId: 7,
        }),
      );
      expect(socket.state.resetNfcCardData).toBeNull();
    });

    it('clears reset state and propagates a send error', async () => {
      const socket = fixture.createMockSocket({ sendMessage: jest.fn().mockRejectedValue(new Error('send failed')) });
      fixture.websocketService.sockets.set('socket-1', socket);

      await expect(fixture.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'send failed',
      );

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });
}
