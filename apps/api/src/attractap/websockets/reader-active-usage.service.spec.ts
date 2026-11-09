import { In } from 'typeorm';
import { activeUsageWhere } from '../../resources/usage/sessions/active-usage';
import { ReaderActiveUsageService } from './reader-active-usage.service';

describe('ReaderActiveUsageService', () => {
  it('returns only the resources that have an active usage session, reading just their ids', async () => {
    const usages = { find: jest.fn().mockResolvedValue([{ resourceId: 2 }, { resourceId: 3 }, { resourceId: 3 }]) };
    const service = new ReaderActiveUsageService(usages as never);
    expect([...(await service.activeResourceIds([1, 2, 3]))]).toEqual([2, 3]);
    expect(usages.find).toHaveBeenCalledWith({
      where: { resourceId: In([1, 2, 3]), ...activeUsageWhere() },
      select: { resourceId: true },
    });
  });

  it('asks nothing for a reader without resources', async () => {
    const usages = { find: jest.fn() };
    expect((await new ReaderActiveUsageService(usages as never).activeResourceIds([])).size).toBe(0);
    expect(usages.find).not.toHaveBeenCalled();
  });

  it('counts a failed read as idle so the slots still sync', async () => {
    const usages = { find: jest.fn().mockRejectedValue(new Error('database gone')) };
    expect((await new ReaderActiveUsageService(usages as never).activeResourceIds([1])).size).toBe(0);
  });
});
