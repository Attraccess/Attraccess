import { UserAdministrationService } from './user-administration.service';

describe('UserAdministrationService', () => {
  const origin = { actor: { id: 1, authenticationMethod: 'session' }, request: undefined } as never;

  it('changes a name and audits it as an update of the field name', async () => {
    const updated = { id: 7, firstName: 'Ada', lastName: null };
    const usersService = { changeName: jest.fn().mockResolvedValue(updated) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new UserAdministrationService(usersService as never, {} as never, audit as never);

    await expect(service.changeName(7, { firstName: 'Ada', lastName: null }, origin)).resolves.toBe(updated);

    expect(usersService.changeName).toHaveBeenCalledWith(7, { firstName: 'Ada', lastName: null });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'identity',
        action: 'identity.user_updated',
        subject: { type: 'identity.user', id: 7 },
        details: { field: 'name' },
      }),
    );
  });

  it('does not audit a refused change', async () => {
    const usersService = { changeName: jest.fn().mockRejectedValue(new Error('SSO_NAME_CHANGE_FORBIDDEN')) };
    const audit = { record: jest.fn() };
    const service = new UserAdministrationService(usersService as never, {} as never, audit as never);

    await expect(service.changeName(7, { firstName: 'Ada', lastName: null }, origin)).rejects.toThrow(
      'SSO_NAME_CHANGE_FORBIDDEN',
    );
    expect(audit.record).not.toHaveBeenCalled();
  });
});
