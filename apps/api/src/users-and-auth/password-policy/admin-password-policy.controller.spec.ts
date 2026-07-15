import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyRole } from '@attraccess/database-entities';
import { DEFAULT_PASSWORD_POLICY } from '@attraccess/shared';
import { AdminPasswordPolicyController } from './admin-password-policy.controller';

describe('AdminPasswordPolicyController', () => {
  let controller: AdminPasswordPolicyController;
  let service: {
    getPolicy: jest.Mock;
    getEffectivePolicy: jest.Mock;
    updatePolicy: jest.Mock;
    listOverrides: jest.Mock;
    getOverride: jest.Mock;
    upsertOverride: jest.Mock;
    deleteOverride: jest.Mock;
    validate: jest.Mock;
  };

  const auditContext = {
    actorId: 1,
    actorUsername: 'root',
    ip: '127.0.0.1',
    userAgent: 'jest',
    requestId: 'req-1',
  };

  const adminReq = {
    user: { id: 1, username: 'root' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
  } as never;

  beforeEach(() => {
    service = {
      getPolicy: jest.fn(async () => ({ ...DEFAULT_PASSWORD_POLICY })),
      getEffectivePolicy: jest.fn(async () => ({ ...DEFAULT_PASSWORD_POLICY })),
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
      validate: jest.fn(async () => ({ ok: true, errors: [], zxcvbn: { score: 4, required: 3 } })),
    };
    controller = new AdminPasswordPolicyController(service as never);
  });

  it('GET returns the global policy', async () => {
    const out = await controller.getPolicy();
    expect(out.minLength).toBe(DEFAULT_PASSWORD_POLICY.minLength);
  });

  it('PATCH forwards body + audit context to service', async () => {
    const out = await controller.updatePolicy({ minLength: 20 }, adminReq);
    expect(service.updatePolicy).toHaveBeenCalledWith({ minLength: 20 }, auditContext);
    expect(out.minLength).toBe(20);
  });

  it('PATCH surfaces BadRequestException raised by the service guard', async () => {
    service.updatePolicy = jest.fn(async () => {
      throw new BadRequestException('Effective minLength (32) must be <= maxLength (16) for global');
    });
    await expect(controller.updatePolicy({ minLength: 32 }, adminReq)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PUT override forwards role + body + audit context to service', async () => {
    const out = await controller.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 24 }, adminReq);
    expect(service.upsertOverride).toHaveBeenCalledWith(PasswordPolicyRole.ADMIN, { minLength: 24 }, auditContext);
    expect(out.minLength).toBe(24);
  });

  it('DELETE override forwards role + audit context to service', async () => {
    await controller.deleteOverride(PasswordPolicyRole.ADMIN, adminReq);
    expect(service.deleteOverride).toHaveBeenCalledWith(PasswordPolicyRole.ADMIN, auditContext);
  });

  it('POST preview runs server-side validate against draft policy', async () => {
    service.getEffectivePolicy = jest.fn(async () => ({ ...DEFAULT_PASSWORD_POLICY }));
    service.validate = jest.fn(async () => ({
      ok: false,
      errors: [{ code: 'MIN_LENGTH', params: { min: 50, actual: 5 } }],
      zxcvbn: { score: 2, required: 3 },
    }));
    const out = await controller.preview({
      password: 'hello',
      draftPolicy: { minLength: 50 },
    });
    expect(out.ok).toBe(false);
    expect(out.errors[0].code).toBe('MIN_LENGTH');
    expect(service.validate).toHaveBeenCalledWith(
      'hello',
      {},
      expect.objectContaining({ policyOverride: expect.objectContaining({ minLength: 50 }) }),
    );
  });
});
