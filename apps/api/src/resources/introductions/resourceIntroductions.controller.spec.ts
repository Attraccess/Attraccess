import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import { ResourceIntroductionsService } from './resouceIntroductions.service';

describe('ResourceIntroductionsController', () => {
  let controller: ResourceIntroductionsController;
  const resourceIntroductionsService = { grant: jest.fn(), revoke: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ResourceIntroductionsController(
      resourceIntroductionsService as unknown as ResourceIntroductionsService,
    );
  });

  it.each(['grant', 'revoke'] as const)('delegates the authenticated user on introduction %s', async (action) => {
    const data = { comment: 'Approved' };
    const req = { user: { id: 9 } } as AuthenticatedRequest;

    await controller[action](7, 3, data, req);

    expect(resourceIntroductionsService[action]).toHaveBeenCalledWith(7, 3, data, { performedByUserId: 9 });
  });
});
