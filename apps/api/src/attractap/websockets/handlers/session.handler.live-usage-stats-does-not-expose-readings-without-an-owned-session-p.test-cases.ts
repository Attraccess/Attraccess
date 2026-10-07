/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsDoesNotExposeReadingsWithoutAnOwnedSessionP(
  scope: LiveUsageStatsTestScope,
): void {
  it.each([null, { id: 99, userId: 2, startTime: scope.startTime }])(
    'does not expose readings without an owned session (%p)',
    async (usage) => {
      scope.mockResourceUsageService.getActiveSession.mockResolvedValue(usage);
      await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
      expect(scope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
      expect(scope.metering.getLive).not.toHaveBeenCalled();
    },
  );
}
