import { BadRequestException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { IsResourceGroupIntroducerGuard } from './isIntroducerGuard';
const repository = { find: jest.fn() };
const guard = new IsResourceGroupIntroducerGuard(repository as never);
function context(user: unknown, groupId?: string, method = 'POST'): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user, method, params: { groupId } }) }) } as ExecutionContext;
}
beforeEach(() => {
  repository.find.mockReset();
});
it('rejects anonymous users and bypasses group lookup for authorized system managers', async () => {
  await expect(guard.canActivate(context(null, '3'))).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(
    guard.canActivate(context({ id: 7, effectivePermissions: new Set(['resources.access.manage']) }, '3')),
  ).resolves.toBe(true);
  expect(repository.find).not.toHaveBeenCalled();
});
it('requires a numeric group and checks introductions for exactly that user and group', async () => {
  const user = { id: 7, effectivePermissions: new Set() };
  await expect(guard.canActivate(context(user))).resolves.toBe(false);
  await expect(guard.canActivate(context(user, 'not-a-number'))).rejects.toBeInstanceOf(BadRequestException);
  repository.find.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
  await expect(guard.canActivate(context(user, '3'))).resolves.toBe(true);
  expect(repository.find).toHaveBeenLastCalledWith(3, 7);
  await expect(guard.canActivate(context(user, '4'))).resolves.toBe(false);
});
it('fails closed when introduction lookup is unavailable', async () => {
  repository.find.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(guard.canActivate(context({ id: 7 }, '3'))).resolves.toBe(false);
});
it('lets resource managers read the list and history but not grant or revoke', async () => {
  const manager = { id: 7, effectivePermissions: new Set(['resources.update']) };
  await expect(guard.canActivate(context(manager, '3', 'GET'))).resolves.toBe(true);
  expect(repository.find).not.toHaveBeenCalled();
  repository.find.mockResolvedValueOnce(null);
  await expect(guard.canActivate(context(manager, '3', 'POST'))).resolves.toBe(false);
});
