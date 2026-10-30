import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  ResourceActivityAccess,
  ResourceActivityVisibilityService,
} from '../usage/authorization/resource-activity-visibility.service';
import { ResourceActivityVisibleGuard } from './resource-activity-visible.guard';

describe('ResourceActivityVisibleGuard', () => {
  const user = { id: 3, effectivePermissions: new Set(['resources.read']) };
  const contextFor = (resourceId: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user, params: { resourceId } }) }) }) as unknown as ExecutionContext;
  const guardWith = (access: ResourceActivityAccess) => {
    const resolve = jest.fn(async () => access);
    return {
      guard: new ResourceActivityVisibleGuard({ resolve } as unknown as ResourceActivityVisibilityService),
      resolve,
    };
  };

  it.each<ResourceActivityAccess>(['full', 'anonymous'])('lets %s access open the stream', async (access) => {
    const { guard, resolve } = guardWith(access);
    await expect(guard.canActivate(contextFor('7'))).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith(user, 7);
  });

  it('refuses before the stream opens when activity is hidden', async () => {
    const { guard } = guardWith('none');
    await expect(guard.canActivate(contextFor('7'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('leaves a malformed id to the route pipe', async () => {
    const { guard, resolve } = guardWith('none');
    await expect(guard.canActivate(contextFor('abc'))).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });
});
