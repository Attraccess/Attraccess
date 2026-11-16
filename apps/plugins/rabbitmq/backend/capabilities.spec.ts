import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCapabilitiesController } from './capabilities';
import { RABBITMQ_MANAGE_PERMISSION, RABBITMQ_VIEW_PERMISSION } from './permissions';

const requestWith = (...permissions: string[]) =>
  ({ user: { effectivePermissions: new Set(permissions) } }) as unknown as AuthenticatedRequest;

describe('RabbitmqCapabilitiesController', () => {
  const controller = new RabbitmqCapabilitiesController();

  it('reports canManage only for the manage tier', () => {
    expect(controller.capabilities(requestWith(RABBITMQ_VIEW_PERMISSION))).toEqual({ canManage: false });
    expect(controller.capabilities(requestWith(RABBITMQ_VIEW_PERMISSION, RABBITMQ_MANAGE_PERMISSION))).toEqual({
      canManage: true,
    });
  });
});
