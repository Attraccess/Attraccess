import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceGroupsIntroductionsController } from './resourceGroups.introductions.controller';
import { ResourceGroupsIntroductionsService } from './resourceGroups.introductions.service';

describe('ResourceGroupsIntroductionsController', () => {
  let controller: ResourceGroupsIntroductionsController;
  const resourceGroupsIntroductionsService = { grant: jest.fn(), revoke: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ResourceGroupsIntroductionsController(
      resourceGroupsIntroductionsService as unknown as ResourceGroupsIntroductionsService,
    );
  });

  it.each(['grant', 'revoke'] as const)('delegates the authenticated user on introduction %s', async (action) => {
    const data = { comment: 'Approved' };
    const req = { user: { id: 9 } } as AuthenticatedRequest;

    await controller[action](5, 3, data, req);

    expect(resourceGroupsIntroductionsService[action]).toHaveBeenCalledWith(5, 3, data, { performedByUserId: 9 });
  });
});
