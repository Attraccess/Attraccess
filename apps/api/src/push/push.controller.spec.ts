import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PushController } from './push.controller';
import { PushService } from './push.service';

describe('PushController', () => {
  let controller: PushController;
  let pushService: {
    getPublicKey: jest.Mock;
    upsertSubscription: jest.Mock;
    deleteSubscription: jest.Mock;
  };

  const request = { user: { id: 42 } } as AuthenticatedRequest;

  beforeEach(async () => {
    pushService = {
      getPublicKey: jest.fn(),
      upsertSubscription: jest.fn(),
      deleteSubscription: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [{ provide: PushService, useValue: pushService }],
    }).compile();

    controller = module.get<PushController>(PushController);
  });

  it('returns the VAPID public key', () => {
    pushService.getPublicKey.mockReturnValue('public-key');

    expect(controller.getVapidPublicKey()).toEqual({ publicKey: 'public-key' });
  });

  it('returns null as public key when push is disabled', () => {
    pushService.getPublicKey.mockReturnValue(null);

    expect(controller.getVapidPublicKey()).toEqual({ publicKey: null });
  });

  it('upserts a subscription for the authenticated user', async () => {
    const dto = {
      endpoint: 'https://push.example.com/sub-1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    };
    pushService.upsertSubscription.mockResolvedValue({ id: 1, ...dto });

    await controller.upsertSubscription(dto, request);

    expect(pushService.upsertSubscription).toHaveBeenCalledWith(42, dto);
  });

  it('deletes a subscription of the authenticated user by endpoint', async () => {
    await controller.deleteSubscription({ endpoint: 'https://push.example.com/sub-1' }, request);

    expect(pushService.deleteSubscription).toHaveBeenCalledWith(42, 'https://push.example.com/sub-1');
  });
});
