import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyRole } from '@attraccess/database-entities';
import { DEFAULT_PASSWORD_POLICY } from '@attraccess/shared';
import { AdminPasswordPolicyController } from './admin-password-policy.controller';

describe('AdminPasswordPolicyController', () => {
  let controller: AdminPasswordPolicyController;
  let service: {
    getPolicy: jest.Mock;
    updatePolicy: jest.Mock;
    listOverrides: jest.Mock;
    getOverride: jest.Mock;
    upsertOverride: jest.Mock;
    deleteOverride: jest.Mock;
  };

  beforeEach(() => {
    service = {
      getPolicy: jest.fn(async () => ({ ...DEFAULT_PASSWORD_POLICY })),
      updatePolicy: jest.fn(async (patch) => ({ ...DEFAULT_PASSWORD_POLICY, ...patch })),
      listOverrides: jest.fn(async () => []),
      getOverride: jest.fn(async () => null),
      upsertOverride: jest.fn(async (role, body) => ({
        role,
        minLength: null,
        maxLength: null,
        allowAllUnicode: null,
        requireUppercase: null,
        requireLowercase: null,
        requireDigit: null,
        requireSpecial: null,
        checkHIBP: null,
        checkCommonPasswords: null,
        minZxcvbnScore: null,
        historySize: null,
        rotationDays: null,
        ...body,
      })),
      deleteOverride: jest.fn(async () => undefined),
    };
    controller = new AdminPasswordPolicyController(service as never);
  });

  const adminReq = {
    user: { id: 1, username: 'root', systemPermissions: { canManageSystemConfiguration: true } },
  } as never;

  it('GET returns the global policy', async () => {
    const out = await controller.getPolicy();
    expect(out.minLength).toBe(DEFAULT_PASSWORD_POLICY.minLength);
  });

  it('PATCH updates and returns the new policy', async () => {
    const out = await controller.updatePolicy({ minLength: 20 }, adminReq);
    expect(service.updatePolicy).toHaveBeenCalledWith({ minLength: 20 });
    expect(out.minLength).toBe(20);
  });

  it('PATCH rejects when effective minLength would exceed effective maxLength', async () => {
    service.getPolicy = jest.fn(async () => ({ ...DEFAULT_PASSWORD_POLICY, minLength: 12, maxLength: 16 }));
    await expect(controller.updatePolicy({ minLength: 32 }, adminReq)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updatePolicy).not.toHaveBeenCalled();
  });

  it('PUT override delegates to service and returns saved row', async () => {
    const out = await controller.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 24 }, adminReq);
    expect(service.upsertOverride).toHaveBeenCalledWith(PasswordPolicyRole.ADMIN, { minLength: 24 });
    expect(out.minLength).toBe(24);
  });

  it('DELETE override delegates to service', async () => {
    await controller.deleteOverride(PasswordPolicyRole.ADMIN, adminReq);
    expect(service.deleteOverride).toHaveBeenCalledWith(PasswordPolicyRole.ADMIN);
  });
});
