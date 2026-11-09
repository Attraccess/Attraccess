import { ReaderActiveUsageService } from './reader-active-usage.service';

describe('ReaderActiveUsageService', () => {
  it('returns only the resources that have an active usage session', async () => {
    const usage = {
      getActiveSessions: jest.fn().mockResolvedValue(
        new Map([
          [1, []],
          [2, [{}]],
          [3, [{}, {}]],
        ]),
      ),
    };
    const service = new ReaderActiveUsageService(usage as never);
    expect([...(await service.activeResourceIds([1, 2, 3]))]).toEqual([2, 3]);
    expect(usage.getActiveSessions).toHaveBeenCalledWith([1, 2, 3]);
  });
});
