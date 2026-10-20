import { createMock } from '@golevelup/ts-jest';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroducerType } from '@attraccess/database-entities';
import { ResourceIntroducerDirectoryController } from './resource-introducer-directory.controller';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { ResourceUsageService } from '../usage/sessions/resource-usage.service';

describe('equipment help directory', () => {
  const introducers = createMock<ResourceIntroducersService>();
  const usage = createMock<ResourceUsageService>();
  const controller = new ResourceIntroducerDirectoryController(introducers, usage);
  const request = (permissions: string[] = []) =>
    createMock<AuthenticatedRequest>({
      user: { id: 1, effectivePermissions: new Set(permissions) },
    });
  beforeEach(() => {
    jest.clearAllMocks();
    usage.assertSupportsSupervision.mockResolvedValue(undefined);
    introducers.getMany.mockResolvedValue([
      { userId: 2, user: { id: 2, username: 'Tutor', email: 'private@example.test', password: 'secret' } },
      { userId: 2, user: { id: 2, username: 'Tutor', email: 'private@example.test' } },
      { userId: 1, user: { id: 1, username: 'Requester' } },
      { userId: 3, user: null },
    ] as never);
  });
  it('returns exactly IDs and names, deduplicating direct and inherited contacts', async () => {
    expect(await controller.getMany(7, request(['resources.read']), 'help')).toEqual([
      { id: 2, username: 'Tutor' },
      { id: 1, username: 'Requester' },
    ]);
  });
  it('keeps help available before introduction while denying users without resource metadata access', async () => {
    await expect(controller.getMany(7, request(), 'help')).rejects.toThrow('Resource read');
    expect(introducers.getMany).not.toHaveBeenCalled();
    await controller.getMany(7, request(['resources.update']), 'help', ResourceIntroducerType.MAINTAINER);
    expect(introducers.getMany).toHaveBeenCalledWith(7, ResourceIntroducerType.MAINTAINER);
  });
  it('checks supervision eligibility, includes only introducers and excludes the requester', async () => {
    expect(await controller.getMany(7, request(), 'supervision')).toEqual([{ id: 2, username: 'Tutor' }]);
    expect(usage.assertSupportsSupervision).toHaveBeenCalledWith(7);
    expect(introducers.getMany).toHaveBeenCalledWith(7, ResourceIntroducerType.INTRODUCER);
    usage.assertSupportsSupervision.mockRejectedValue(new Error('Not eligible'));
    await expect(controller.getMany(7, request(), 'supervision')).rejects.toThrow('Not eligible');
  });
});
