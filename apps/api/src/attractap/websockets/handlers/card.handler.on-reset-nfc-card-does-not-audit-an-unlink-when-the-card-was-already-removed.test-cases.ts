import { AttractapEvent } from '../websocket.types';
import { OnResetNfcCardTestScope } from './card.handler.spec';
export function registerOnResetNfcCardDoesNotAuditAnUnlinkWhenTheCardWasAlreadyRemoved(
  scope: OnResetNfcCardTestScope,
): void {
  it('does not audit an unlink when the card was already removed', async () => {
    scope.attractapService.deleteNFCCard.mockResolvedValueOnce({ affected: 0 });
    const socket = scope.createMockSocket({
      state: {
        resetNfcCardData: {
          cardId: 7,
          key: 'x',
          keyNo: 1,
          auditPrincipal: { userId: 1, authenticationMethod: 'session' },
        },
      },
    });

    await scope.handler.onResetNfcCard(socket, { payload: { success: true } } as AttractapEvent['data']);

    expect(scope.audit.recordAttractap).not.toHaveBeenCalled();
  });
}
