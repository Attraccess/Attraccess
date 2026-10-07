/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsDoesNotQueryWhenTheReaderCardGuardRejectsTheRequest(
  scope: LiveUsageStatsTestScope,
): void {
  it('does not query when the reader/card guard rejects the request', async () => {
    scope.mockResourceActionGuard.validateResourceAction.mockResolvedValue(false);
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
  });
}
