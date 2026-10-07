/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { LiveUsageStatsTestScope } from './session.handler.spec';
export function registerLiveUsageStatsReturnsMultipleNamedMetersPreservingZeroAndUnavailableValues(
  scope: LiveUsageStatsTestScope,
): void {
  it('returns multiple named meters, preserving zero and unavailable values', async () => {
    scope.metering.getLive.mockResolvedValue({
      meters: [
        {
          id: 1,
          name: 'Energy (kWh)',
          session: { usageId: 99, meterName: 'Energy (kWh)', creditsPerUnit: 0, latestValue: '0' },
        },
        {
          id: 2,
          name: 'Heartbeats',
          session: {
            usageId: 99,
            meterName: 'Heartbeats',
            creditsPerUnit: Number.MAX_SAFE_INTEGER,
            latestValue: '9007199254740993.125',
          },
        },
        {
          id: 3,
          name: 'Water',
          session: { usageId: 99, meterName: 'Water', creditsPerUnit: 100, latestValue: null },
        },
        { id: 4, name: 'Other usage', session: { usageId: 100, latestValue: '9' } },
        { id: 5, name: 'Idle meter', session: null },
      ],
    });
    await scope.handler.handleResourceUsageStats(scope.mockSocket as any, scope.request);
    expect(scope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters).toEqual([
      { id: 1, name: 'Energy (kWh)', creditsPerUnit: 0, formattedRate: '0,00 EUR', value: '0' },
      {
        id: 2,
        name: 'Heartbeats',
        creditsPerUnit: Number.MAX_SAFE_INTEGER,
        formattedRate: '90.071.992.547.409,91 EUR',
        value: '9007199254740993.125',
      },
      { id: 3, name: 'Water', creditsPerUnit: 100, formattedRate: '1,00 EUR', value: null },
    ]);
  });
}
