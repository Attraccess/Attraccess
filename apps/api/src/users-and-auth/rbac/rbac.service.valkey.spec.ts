import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RbacService } from './rbac.service';

class TestRbacService extends RbacService {
  notifyPermissionsChanged(userId?: number) {
    return this.permissionsChanged(userId);
  }
}

describe('RbacService authorization cache invalidation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs a failed publish by its message, never the error object with the password', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const authError = Object.assign(new Error('WRONGPASS invalid username-password pair'), {
      command: { name: 'auth', args: ['default', 'secret-password'] },
    });
    const valkeyClient = { publish: jest.fn().mockRejectedValue(authError) } as unknown as Redis;
    const service = new TestRbacService(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      { emit: jest.fn() } as never,
      valkeyClient,
      null as never,
    );

    await service.notifyPermissionsChanged(10);

    expect(error.mock.calls).toEqual([
      ['Failed to publish authorization cache invalidation (WRONGPASS invalid username-password pair)'],
    ]);
  });
});
