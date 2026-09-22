import { BadRequestException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { type ResourceIntroducer } from '@attraccess/database-entities';
import { type Repository } from 'typeorm';
import { IsResourceGroupIntroducerGuard } from './isIntroducerGuard';
const repository = { findOne: jest.fn() };
const guard = new IsResourceGroupIntroducerGuard(repository as unknown as Repository<ResourceIntroducer>);
function context(user: unknown, groupId?: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user, params: { groupId } }) }) } as ExecutionContext;
}
beforeEach(() => {
  repository.findOne.mockReset();
});
it('rejects anonymous users and bypasses group lookup for authorized system managers', async () => {
  await expect(guard.canActivate(context(null, '3'))).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(
    guard.canActivate(context({ id: 7, effectivePermissions: new Set(['resources.access.manage']) }, '3')),
  ).resolves.toBe(true);
  expect(repository.findOne).not.toHaveBeenCalled();
});
it('requires a numeric group and checks introductions for exactly that user and group', async () => {
  const user = { id: 7, effectivePermissions: new Set() };
  await expect(guard.canActivate(context(user))).resolves.toBe(false);
  await expect(guard.canActivate(context(user, 'not-a-number'))).rejects.toBeInstanceOf(BadRequestException);
  repository.findOne.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
  await expect(guard.canActivate(context(user, '3'))).resolves.toBe(true);
  expect(repository.findOne).toHaveBeenLastCalledWith({ where: { user: { id: 7 }, resourceGroup: { id: 3 } } });
  await expect(guard.canActivate(context(user, '4'))).resolves.toBe(false);
});
it('fails closed when introduction lookup is unavailable', async () => {
  repository.findOne.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(guard.canActivate(context({ id: 7 }, '3'))).resolves.toBe(false);
});
