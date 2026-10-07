import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnResetNfcCardTestScope } from './card.handler.spec';
export function registerOnResetNfcCardDeletesTheCardAndClearsStateOnSuccess(scope: OnResetNfcCardTestScope): void {
  it('deletes the card and clears state on success', async () => {
    const socket = scope.createMockSocket({
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

    await scope.handler.onResetNfcCard(socket, data);

    expect(scope.attractapService.deleteNFCCard).toHaveBeenCalledWith(7);
    expect(scope.audit.recordAttractap).toHaveBeenCalledWith({
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
}
