import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceActivityVisibilityService } from './resource-activity-visibility.service';

describe('ResourceActivityVisibilityService.resolveSessions', () => {
  const build = (mode: 'all' | 'introduced', canControl: boolean) =>
    new ResourceActivityVisibilityService(
      { getResourceActivityVisibility: jest.fn(async () => mode) } as never,
      { find: jest.fn(async () => []) } as never,
      { canControllResource: jest.fn(async () => canControl) } as never,
    );
  const user = (...permissions: string[]) =>
    ({ id: 1, effectivePermissions: new Set(permissions) }) as AuthenticatedUser;

  it('keeps ordinary readers on their own sessions in "all" mode', async () => {
    expect(await build('all', false).resolveSessions(user('resources.read'), 5)).toBe('none');
  });

  it.each(['all', 'introduced'] as const)('gives access managers all sessions in "%s" mode', async (mode) => {
    expect(await build(mode, false).resolveSessions(user('resources.read', 'resources.access.manage'), 5)).toBe('full');
  });

  it.each(['all', 'introduced'] as const)('gives introduced people all sessions in "%s" mode', async (mode) => {
    expect(await build(mode, true).resolveSessions(user('resources.read'), 5)).toBe('full');
  });

  it('gives hidden viewers only their own sessions in "introduced" mode', async () => {
    expect(await build('introduced', false).resolveSessions(user('resources.read'), 5)).toBe('none');
  });
});
