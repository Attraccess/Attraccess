/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsFormatsTheCapturedRateUsingTheConfiguredCurrencyPrecision(
  scope: LiveUsageStatsTestScope,
): void {
  it('formats the captured rate using the configured currency precision', async () => {
    scope.mockBillingService.getConfiguration.mockResolvedValue({ currency: 'KWD', minorUnit: 3 });
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters[0]).toMatchObject({
      name: 'Heartbeats',
      creditsPerUnit: 2,
      formattedRate: '0,002 KWD',
    });
  });
}
