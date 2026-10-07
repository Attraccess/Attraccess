/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType, AttractapEvent } from '../websocket.types';
import { ReaderAccessWithTheActualResourceGuardTestScope } from './session.handler.spec';
export function registerReaderAccessWithTheActualResourceGuardRejectsSWithoutLookingUpOrDisclosingReadings(
  scope: ReaderAccessWithTheActualResourceGuardTestScope,
): void {
  it.each(['USER_NOT_AUTHENTICATED', 'RESOURCE_NOT_ASSOCIATED_WITH_READER'])(
    'rejects %s without looking up or disclosing readings',
    async (error) => {
      if (error === 'USER_NOT_AUTHENTICATED')
        (scope.parentScope.mockSocket.state as any).lastAuthenticatedUserId = null;
      else scope.reader.resources = [];
      await scope.parentScope.handler.handleResourceUsageStats(scope.parentScope.mockSocket as any, scope.request);
      expect(scope.parentScope.mockSocket.sendMessage).toHaveBeenCalledWith(
        new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, { requestId: 7, error }),
      );
      expect(scope.parentScope.mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
      expect(scope.parentScope.metering.getLive).not.toHaveBeenCalled();
      expect(scope.parentScope.operating.getForResource).not.toHaveBeenCalled();
    },
  );
}
