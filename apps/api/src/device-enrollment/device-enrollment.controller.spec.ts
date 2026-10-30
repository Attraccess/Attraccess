import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DeviceEnrollmentController } from './device-enrollment.controller';

describe('DeviceEnrollmentController', () => {
  it.each(['approve', 'listLitePending', 'approveLite'] as const)(
    '%s needs a login and the resources.update permission',
    (method) => {
      const handler = DeviceEnrollmentController.prototype[method];

      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) as { name: string }[]).map((guard) => guard.name);
      expect(guards).toEqual(expect.arrayContaining(['DualAuthGuard', 'EffectivePermissionsGuard']));

      // The permission list is stored by the Auth decorator under a private key.
      const stored = Reflect.getMetadataKeys(handler).map((key) => Reflect.getMetadata(key, handler));
      expect(stored).toContainEqual(['resources.update']);
    },
  );

  it('delegates the lite endpoints to the service with the approver', async () => {
    const enrollment = {
      listLitePending: jest.fn().mockReturnValue([]),
      approveLite: jest.fn().mockResolvedValue({ kind: 'reader', id: 3, name: 'Lite' }),
    };
    const controller = new DeviceEnrollmentController(enrollment as never);

    expect(controller.listLitePending()).toEqual([]);
    await controller.approveLite({ pendingId: 'id', pattern: ['red', 'green', 'blue', 'yellow'], name: 'Bench' }, {
      user: { id: 4, authenticationMethod: 'api-token', apiTokenId: 9 },
    } as never);

    expect(enrollment.approveLite).toHaveBeenCalledWith(
      'id',
      ['red', 'green', 'blue', 'yellow'],
      { userId: 4, authenticationMethod: 'api-token', apiTokenId: 9 },
      { name: 'Bench' },
    );
  });
});
