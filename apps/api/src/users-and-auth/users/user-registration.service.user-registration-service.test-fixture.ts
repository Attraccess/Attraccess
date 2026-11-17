import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { SETTINGS_ROWS } from '../../settings/settings-rows.port';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { SignupDomainService } from './signup-domain.service';
import { UserRegistrationService } from './user-registration.service';
import { UsersService } from './users.service';

const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

export function registerUserRegistrationServiceFixture() {
  let service: UserRegistrationService;

  let usersService: UsersService;

  let authService: AuthService;

  let emailService: EmailService;

  let settingsRows: { findValue: jest.Mock; upsertValue: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AUDIT_RECORDER, useValue: audit },
        UserRegistrationService,
        // Real SignupDomainService so the domain-whitelist check is genuinely exercised
        SignupDomainService,
        {
          provide: SETTINGS_ROWS,
          useValue: { findValue: jest.fn(), upsertValue: jest.fn(), remove: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findMany: jest.fn(),
            createOne: jest.fn(),
            deleteOne: jest.fn(),
            withTransaction: jest.fn(async (handler) => handler({ isOpen: true, afterCommit: jest.fn() })),
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
    settingsRows = module.get(SETTINGS_ROWS);
  });
  return {
    get audit() {
      return audit;
    },
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
    get settingsRows() {
      return settingsRows;
    },
  };
}
