/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsDiscardsResultsWhenTheCardChangesDuringTheLookup(
  scope: LiveUsageStatsTestScope,
): void {
  it('discards results when the card changes during the lookup', async () => {
    scope.metering.getLive.mockImplementation(async () => {
      scope.mockSocket.state.lastAuthenticatedUserId = 2;
      return { meters: [] };
    });
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockSocket.sendMessage).not.toHaveBeenCalled();
  });
}
