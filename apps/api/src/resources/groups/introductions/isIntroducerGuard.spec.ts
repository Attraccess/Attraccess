import { GroupIntroducerPersistence } from '../persistence/port';
import { BadRequestException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { IsResourceGroupIntroducerGuard } from './isIntroducerGuard';
const persistence: jest.Mocked<GroupIntroducerPersistence> = {
  grants: jest.fn(),
  grant: jest.fn(),
  createGrant: jest.fn(),
  removeGrant: jest.fn(),
};
const guard = new IsResourceGroupIntroducerGuard(persistence);
function context(user: unknown, groupId?: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user, params: { groupId } }) }) } as ExecutionContext;
}
beforeEach(() => {
  persistence.grant.mockReset();
});
it('rejects anonymous users and bypasses group lookup for authorized system managers', async () => {
  await expect(guard.canActivate(context(null, '3'))).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(
    guard.canActivate(context({ id: 7, effectivePermissions: new Set(['resources.access.manage']) }, '3')),
  ).resolves.toBe(true);
  expect(persistence.grant).not.toHaveBeenCalled();
});
it('requires a numeric group and checks introductions for exactly that user and group', async () => {
  const user = { id: 7, effectivePermissions: new Set() };
  await expect(guard.canActivate(context(user))).resolves.toBe(false);
  await expect(guard.canActivate(context(user, 'not-a-number'))).rejects.toBeInstanceOf(BadRequestException);
  persistence.grant
    .mockResolvedValueOnce({ id: 1 } as unknown as import('@attraccess/application-models').ResourceIntroducer)
    .mockResolvedValueOnce(null);
  await expect(guard.canActivate(context(user, '3'))).resolves.toBe(true);
  expect(persistence.grant).toHaveBeenLastCalledWith(3, 7);
  await expect(guard.canActivate(context(user, '4'))).resolves.toBe(false);
});
it('fails closed when introduction lookup is unavailable', async () => {
  persistence.grant.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(guard.canActivate(context({ id: 7 }, '3'))).resolves.toBe(false);
});
