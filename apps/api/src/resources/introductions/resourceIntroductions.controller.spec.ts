import { createMock } from '@golevelup/ts-jest';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';

describe('People introduction visibility', () => {
  const introductions = createMock<ResourceIntroductionsService>();
  const introducers = createMock<ResourceIntroducersService>();
  const controller = new ResourceIntroductionsController(introductions, introducers);
  beforeEach(() => {
    jest.clearAllMocks();
    introducers.isIntroducer.mockResolvedValue(false);
  });
  function request(permissions: string[] = []) {
    return createMock<AuthenticatedRequest>({ user: { id: 7, effectivePermissions: new Set(permissions) } });
  }
  it.each(['resources.update', 'resources.access.manage'])(
    'allows %s viewers without expanding mutation permissions',
    async (permission) => {
      await controller.getPeople(2, request([permission]));
      expect(introductions.getMany).toHaveBeenCalledWith(2, true);
      expect(introducers.isIntroducer).not.toHaveBeenCalled();
    },
  );
  it('allows introducers, including group-inherited introducers', async () => {
    introducers.isIntroducer.mockResolvedValue(true);
    await controller.getPeople(2, request());
    expect(introducers.isIntroducer).toHaveBeenCalledWith(2, 7, true);
    expect(introductions.getMany).toHaveBeenCalledWith(2, true);
  });
  it('denies ordinary resource readers', async () => {
    await expect(controller.getPeople(2, request(['resources.read']))).rejects.toThrow(ForbiddenException);
    expect(introductions.getMany).not.toHaveBeenCalled();
  });
  it('preserves the existing direct-only endpoint', async () => {
    await controller.getManyByResource(2);
    expect(introductions.getMany).toHaveBeenCalledWith(2);
  });
});

describe('ResourceIntroductionsController', () => {
  let controller: ResourceIntroductionsController;
  const resourceIntroductionsService = { grant: jest.fn(), revoke: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ResourceIntroductionsController(
      createMock<ResourceIntroductionsService>(resourceIntroductionsService),
      createMock<ResourceIntroducersService>(),
    );
  });

  it.each(['grant', 'revoke'] as const)(
    'delegates the authenticated user on introduction %s',
    async (action) => {
      const data = { comment: 'Approved' };
      const req = { user: { id: 9 } } as AuthenticatedRequest;

      await controller[action](7, 3, data, req);

      expect(resourceIntroductionsService[action]).toHaveBeenCalledWith(7, 3, data, {
        performedByUserId: 9,
        authenticationMethod: undefined,
        apiTokenId: undefined,
      });
    },
  );
});
