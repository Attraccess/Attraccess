import { UserInvitationsController } from './user-invitations.controller';

describe('CSV invitation role permission boundary', () => {
  it.each([false, true])('requires role-management permission for CSV roles, string config=%s', async (encoded) => {
    const service = { inviteUsersFromCsv: jest.fn().mockResolvedValue([{ id: 7 }]) };
    const controller = new UserInvitationsController(service as never);
    const request = { user: { id: 3, locale: 'de', effectivePermissions: new Set<string>() } };
    const config = { emailKey: 'email', usernameKey: 'username', roleKeyColumn: 'role' };
    const input = encoded ? JSON.stringify(config) : config;
    await expect(controller.inviteUsersFromCsv(request as never, undefined, input)).rejects.toThrow(
      'users.roles.manage',
    );
    expect(service.inviteUsersFromCsv).not.toHaveBeenCalled();
    request.user.effectivePermissions.add('users.roles.manage');
    expect(await controller.inviteUsersFromCsv(request as never, undefined, input)).toEqual([{ id: 7 }]);
    expect(service.inviteUsersFromCsv).toHaveBeenCalledWith(undefined, input, 'de', 3);
  });
  it('leaves malformed config validation to the service and permits ordinary CSV invitations', async () => {
    const service = { inviteUsersFromCsv: jest.fn().mockResolvedValue([]) };
    const controller = new UserInvitationsController(service as never);
    const request = { user: { id: 3, locale: 'en' } };
    await controller.inviteUsersFromCsv(request as never, undefined, '{');
    expect(service.inviteUsersFromCsv).toHaveBeenCalledWith(undefined, '{', 'en', 3);
    await controller.inviteUsersFromCsv(request as never, undefined, { emailKey: 'email', usernameKey: 'username' });
    expect(service.inviteUsersFromCsv).toHaveBeenCalledTimes(2);
  });
});
