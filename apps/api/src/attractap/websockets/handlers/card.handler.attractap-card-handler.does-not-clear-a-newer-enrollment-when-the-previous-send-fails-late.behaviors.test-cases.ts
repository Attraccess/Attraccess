/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerFixture0 } from './card.handler.attractap-card-handler.test-fixture';
import { AttractapEvent, AttractapEventType } from '../websocket.types';

export function registerCases0_7(fixture: ReturnType<typeof registerFixture0>) {
  it('does not clear a newer enrollment when the previous send fails late', async () => {
    const socket = fixture.createMockSocket();
    fixture.websocketService.sockets.set(socket.id, socket);
    let finish!: (delivered: boolean) => void;
    socket.sendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    await new Promise(setImmediate);
    await fixture.handler.onEnrollNewCardCancel(socket);
    await fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
    const replacement = socket.state.enrollment;
    finish(false);
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
  });
}

export function registerCases0_5(fixture: ReturnType<typeof registerFixture0>) {
  it.each(['lookup', 'key generation'])('does not revive cancelled enrollment after %s', async (stage) => {
    const socket = fixture.createMockSocket();
    socket.state.enrollment = { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } };
    let finish!: (value: any) => void;
    const pendingLookup = new Promise((resolve) => {
      finish = resolve;
    });
    (stage === 'lookup'
      ? fixture.attractapService.getNFCCardByUID
      : fixture.attractapService.generateNTAG424Key
    ).mockReturnValueOnce(pendingLookup);
    const pending = fixture.handler.onEnrollNewCardRequestNFCKey(socket, { payload: { uid: 'abc', keyNo: 1 } } as any);
    await new Promise(setImmediate);
    await fixture.handler.onEnrollNewCardCancel(socket);
    finish(stage === 'lookup' ? null : new Uint8Array([1, 2, 3]));
    await pending;
    expect(socket.state.enrollNewCardData).toBeNull();
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });
}

export function registerCases0_2(fixture: ReturnType<typeof registerFixture0>) {
  describe('onResetNfcCardCancel', () => {
    it('clears reset state', async () => {
      const socket = fixture.createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });

      await fixture.handler.onResetNfcCardCancel(socket);

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });
}

export function registerCases0_1(fixture: ReturnType<typeof registerFixture0>) {
  describe('onResetNfcCard', () => {
    it('sends RESET_NFC_CARD_DATA_NOT_SET when no reset state', async () => {
      const socket = fixture.createMockSocket();
      const data = { payload: { success: true } } as AttractapEvent['data'];

      await fixture.handler.onResetNfcCard(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESET_NFC_CARD,
            payload: { error: 'RESET_NFC_CARD_DATA_NOT_SET' },
          }),
        }),
      );
      expect(fixture.attractapService.deleteNFCCard).not.toHaveBeenCalled();
    });

    it('does not delete and keeps state when the reader reports failure', async () => {
      const socket = fixture.createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });
      const data = { payload: { success: false } } as AttractapEvent['data'];

      await fixture.handler.onResetNfcCard(socket, data);

      expect(fixture.attractapService.deleteNFCCard).not.toHaveBeenCalled();
      expect(socket.state.resetNfcCardData).toEqual({ cardId: 7, key: 'x', keyNo: 1 });
    });

    it('deletes the card and clears state on success', async () => {
      const socket = fixture.createMockSocket({
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

      await fixture.handler.onResetNfcCard(socket, data);

      expect(fixture.attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
      expect(fixture.audit.recordAttractap).toHaveBeenCalledWith({
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
      fixture.attractapService.deleteNFCCard.mockResolvedValueOnce({ affected: 0 });
      const socket = fixture.createMockSocket({
        state: {
          resetNfcCardData: {
            cardId: 7,
            key: 'x',
            keyNo: 1,
            auditPrincipal: { userId: 1, authenticationMethod: 'session' },
          },
        },
      });

      await fixture.handler.onResetNfcCard(socket, { payload: { success: true } } as AttractapEvent['data']);

      expect(fixture.audit.recordAttractap).not.toHaveBeenCalled();
    });
  });
}

export function registerCases0_6(fixture: ReturnType<typeof registerFixture0>) {
  it('preserves a newer enrollment while auditing an older committed card', async () => {
    const socket = fixture.createMockSocket();
    fixture.websocketService.sockets.set(socket.id, socket);
    const principal = { userId: 1, authenticationMethod: 'api-token', apiTokenId: 9 };
    socket.state.enrollment = { userId: 1, auditPrincipal: principal };
    socket.state.enrollNewCardData = { key: 'deadbeef', keyNo: 1, cardUID: 'abc', auditPrincipal: principal };
    let finish!: (value: { id: number }) => void;
    fixture.attractapService.createNFCCard.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = fixture.handler.onEnrollNewCard(socket, { payload: { success: true } } as any);
    await new Promise(setImmediate);
    await fixture.handler.onEnrollNewCardCancel(socket);
    fixture.usersService.findOne.mockResolvedValueOnce({ id: 2, username: 'second' });
    await fixture.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 2 });
    const replacement = socket.state.enrollment;
    finish({ id: 8 });
    await pending;
    expect(socket.state.enrollment).toBe(replacement);
    expect(replacement.userId).toBe(2);
    expect(fixture.audit.recordAttractap).toHaveBeenCalledTimes(1);
    expect(fixture.audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 1, apiTokenId: 9, subjectId: 8 }),
    );
    expect(socket.sendMessage).toHaveBeenCalledTimes(1);
  });
}
