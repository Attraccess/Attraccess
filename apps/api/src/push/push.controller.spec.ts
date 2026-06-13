import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PushController } from './push.controller';
import { PushService } from './push.service';

describe('PushController', () => {
  let controller: PushController;
  let pushService: {
    getPublicKey: jest.Mock;
    getSubscriptionCount: jest.Mock;
    replaceVapidKeys: jest.Mock;
    upsertSubscription: jest.Mock;
    deleteSubscription: jest.Mock;
  };

  const request = { user: { id: 42 } } as AuthenticatedRequest;

  beforeEach(async () => {
    pushService = {
      getPublicKey: jest.fn(),
      getSubscriptionCount: jest.fn(),
      replaceVapidKeys: jest.fn(),
      upsertSubscription: jest.fn(),
      deleteSubscription: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [{ provide: PushService, useValue: pushService }],
    }).compile();

    controller = module.get<PushController>(PushController);
  });

  it('returns the VAPID public key', async () => {
    pushService.getPublicKey.mockResolvedValue('public-key');

    await expect(controller.getVapidPublicKey()).resolves.toEqual({ publicKey: 'public-key' });
  });

  it('returns the VAPID config including the subscription count', async () => {
    pushService.getPublicKey.mockResolvedValue('public-key');
    pushService.getSubscriptionCount.mockResolvedValue(7);

    await expect(controller.getVapidConfig()).resolves.toEqual({ publicKey: 'public-key', subscriptionCount: 7 });
  });

  describe('replaceVapidKeys', () => {
    it('regenerates the keys when no override is provided', async () => {
      pushService.replaceVapidKeys.mockResolvedValue({
        keys: { publicKey: 'new-public', privateKey: 'new-private' },
        deletedSubscriptions: 3,
      });

      await expect(controller.replaceVapidKeys({})).resolves.toEqual({
        publicKey: 'new-public',
        deletedSubscriptions: 3,
      });
      expect(pushService.replaceVapidKeys).toHaveBeenCalledWith(undefined);
    });

    it('passes a complete custom key pair to the service', async () => {
      pushService.replaceVapidKeys.mockResolvedValue({
        keys: { publicKey: 'custom-public', privateKey: 'custom-private' },
        deletedSubscriptions: 0,
      });

      await controller.replaceVapidKeys({ publicKey: 'custom-public', privateKey: 'custom-private' });

      expect(pushService.replaceVapidKeys).toHaveBeenCalledWith({
        publicKey: 'custom-public',
        privateKey: 'custom-private',
      });
    });

    it.each([
      ['only a public key', { publicKey: 'custom-public' }],
      ['only a private key', { privateKey: 'custom-private' }],
    ])('rejects %s', async (_label, body) => {
      await expect(controller.replaceVapidKeys(body)).rejects.toThrow(BadRequestException);
      expect(pushService.replaceVapidKeys).not.toHaveBeenCalled();
    });
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
