import { Test, TestingModule } from '@nestjs/testing';
import { PasswordPolicyController } from './password-policy.controller';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyController', () => {
  let controller: PasswordPolicyController;
  let serviceMock: { getPublicPolicy: jest.Mock };

  beforeEach(async () => {
    serviceMock = {
      getPublicPolicy: jest.fn(async () => ({
        minLength: 12,
        maxLength: 128,
        allowAllUnicode: true,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        minZxcvbnScore: 3,
      })),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PasswordPolicyController],
      providers: [{ provide: PasswordPolicyService, useValue: serviceMock }],
    }).compile();
    controller = module.get(PasswordPolicyController);
  });

  it('GET /password-policy/public returns sanitized policy', async () => {
    const result = await controller.getPublic();
    expect(result).toEqual({
      minLength: 12,
      maxLength: 128,
      allowAllUnicode: true,
      requireUppercase: false,
      requireLowercase: false,
      requireDigit: false,
      requireSpecial: false,
      minZxcvbnScore: 3,
    });
  });
});
