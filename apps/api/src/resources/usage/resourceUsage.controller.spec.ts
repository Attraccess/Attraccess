import { Test } from '@nestjs/testing';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceUsageController } from './resourceUsage.controller';
import { ResourceUsageService } from './resourceUsage.service';

it('passes the authenticated requester separately from the usage-history user filter', async () => {
  const getResourceUsageHistory = jest.fn().mockResolvedValue({ data: [], total: 0 });
  const moduleRef = await Test.createTestingModule({
    controllers: [ResourceUsageController],
    providers: [{ provide: ResourceUsageService, useValue: { getResourceUsageHistory } }],
  }).compile();
  const controller = moduleRef.get(ResourceUsageController);
  const request = {
    user: { id: 1, effectivePermissions: new Set(['resources.update']) },
  } as AuthenticatedRequest;

  await controller.getHistory(5, { page: 1, limit: 10, userId: 2 }, request);

  expect(getResourceUsageHistory).toHaveBeenCalledWith(5, 1, 1, 10, 2);
});
