import { ReaderActiveUsageService } from './reader-active-usage.service';

describe('ReaderActiveUsageService', () => {
  it('asks the resource reads for the resources with an active usage session', async () => {
    const reads = { findResourceIdsWithActiveUsage: jest.fn().mockResolvedValue(new Set([2, 3])) };
    const service = new ReaderActiveUsageService(reads as never);
    expect([...(await service.activeResourceIds([1, 2, 3]))]).toEqual([2, 3]);
    expect(reads.findResourceIdsWithActiveUsage).toHaveBeenCalledWith([1, 2, 3]);
  });
});
