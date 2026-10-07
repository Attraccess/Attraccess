/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEvent } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardLogsErrorAndReturnsWithoutAMessageWhenPayloadSuccessIsFalse(
  scope: OnEnrollNewCardTestScope,
): void {
  it('logs error and returns without a message when payload.success is false', async () => {
    const socket = scope.createMockSocket({
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

    await scope.handler.onEnrollNewCard(socket, data);

    expect((scope.handler as any).logger.error).toHaveBeenCalledWith('Enroll new card failed');
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });
}
