import { Test } from '@nestjs/testing';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';

it('passes the authenticated user and both IDs to the usage details lookup', async () => {
  const getSessionDetails = jest.fn().mockResolvedValue({ id: 8 });
  const moduleRef = await Test.createTestingModule({
    controllers: [ResourceUsageController],
    providers: [{ provide: ResourceUsageService, useValue: { getSessionDetails } }],
  }).compile();
  const request = { user: { id: 1, effectivePermissions: new Set(['resources.update']) } } as AuthenticatedRequest;
  expect(await moduleRef.get(ResourceUsageController).getSession(5, 8, request)).toEqual({ id: 8 });
  expect(getSessionDetails).toHaveBeenCalledWith(5, 8, request.user);
});
