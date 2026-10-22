import { SignupDomainPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { SignupDomainService } from './signup-domain.service';
import { UserRegistrationService } from './user-registration.service';
import { UsersService } from './users.service';

export function registerUserRegistrationServiceFixture() {
  let service: UserRegistrationService;

  let usersService: UsersService;

  let authService: AuthService;

  let emailService: EmailService;

  let persistence: jest.Mocked<SignupDomainPersistence>;

  beforeEach(async () => {
    persistence = { readWhitelist: jest.fn(), updateWhitelist: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRegistrationService,
        // Real SignupDomainService so the domain-whitelist check is genuinely exercised
        SignupDomainService,
        { provide: SignupDomainPersistence, useValue: persistence },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findMany: jest.fn(),
            createOne: jest.fn(),
            deleteOne: jest.fn(),
            withTransaction: jest.fn(async (handler) => handler({})),
            recordCreatedUser: jest.fn(),
            rollbackFailedRegistration: jest.fn(),
            releaseFirstTimeSetupAdminIdentifiers: jest.fn(),
            rollbackFirstTimeSetupAdminReplacement: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            addAuthenticationDetails: jest.fn(),
            hashPassword: jest.fn(async (password) => `hashed-${password}`),
            generateEmailVerificationToken: jest.fn(),
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: { assertSmtpConfigured: jest.fn(), sendVerificationEmail: jest.fn() },
        },
        {
          provide: PasswordPolicyService,
          useValue: {
            validate: jest.fn(async () => ({ ok: true, errors: [], zxcvbn: { score: 4, required: 3 } })),
            resolveRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserRegistrationService>(UserRegistrationService);
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);
    emailService = module.get<EmailService>(EmailService);
  });
  return {
    get service() {
      return service;
    },
    get usersService() {
      return usersService;
    },
    get authService() {
      return authService;
    },
    get emailService() {
      return emailService;
    },
    get persistence() {
      return persistence;
    },
  };
}
