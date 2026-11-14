import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { LicenseError } from '../../license/license.service';
import { UserInvitationService } from './user-invitation.service';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { CsvInviteConfigDto } from './dtos/csvInvite.dto';
import { FileUpload } from '../../common/types/file-upload.types';

describe('UserInvitationService – parseCsvFile', () => {
  let service: UserInvitationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserInvitationService,
        {
          provide: UsersService,
          useValue: {
            cleanupUsername: jest.fn((value: string) => value),
            validateUsernameOrThrow: jest.fn(),
          },
        },
        { provide: AuthService, useValue: { generateEmailVerificationToken: jest.fn() } },
        { provide: EmailService, useValue: { sendUserInvitationEmail: jest.fn() } },
      ],
    }).compile();

    service = module.get<UserInvitationService>(UserInvitationService);
  });

  const buildConfig = (overrides?: Partial<CsvInviteConfigDto>): CsvInviteConfigDto => ({
    emailKey: 'email',
    usernameKey: 'username',
    ...overrides,
  });

  it('parses quoted values and honors ignored rows', async () => {
    const csv = 'email,username,perm\n"john@example.com","user1","tr,ue"\nsecond@example.com,user2,tr,ue\n';
    const file: FileUpload = { buffer: Buffer.from(csv) } as FileUpload;
    const config = buildConfig({
      ignoredRows: [2],
    });

    const result = await service.parseCsvFile(file, config);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      {
        email: 'john@example.com',
        username: 'user1',
        row: 1,
      },
    ]);
  });

  it('throws for missing header row', async () => {
    const file: FileUpload = { buffer: Buffer.from('\n\n') } as FileUpload;
    const config = buildConfig();

    await expect(service.parseCsvFile(file, config)).rejects.toThrow('MISSING_HEADER_ROW');
  });

  it('records duplicate email errors', async () => {
    const csv = 'email,username\nfirst@example.com,user1\nfirst@example.com,user2\n';
    const file: FileUpload = { buffer: Buffer.from(csv) } as FileUpload;
    const config = buildConfig();

    const result = await service.parseCsvFile(file, config);

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 2, field: 'email', message: 'DUPLICATE_IN_CSV' })]),
    );
  });
});

describe('CSV invitations', () => {
  const config = { emailKey: 'email', usernameKey: 'username', roleKeyColumn: 'role' };
  const file = (csv: string) => ({ buffer: Buffer.from(csv) }) as FileUpload;
  const setup = () => {
    const manager = {};
    const users = {
      cleanupUsername: jest.fn((value: string) => value.toLowerCase()),
      validateUsernameOrThrow: jest.fn(),
      findByEmailsOrUsernames: jest.fn().mockResolvedValue([]),
      ensureLicenseForNewUsers: jest.fn(),
      withTransaction: jest.fn(async (run) => run(manager)),
      createMany: jest.fn().mockResolvedValue([{ id: 7, username: 'alex', email: 'alex@example.com' }]),
    };
    const auth = { generateEmailVerificationToken: jest.fn().mockResolvedValue('verification-token') };
    const email = { sendUserInvitationEmail: jest.fn() };
    const service = new UserInvitationService(users as never, auth as never, email as never);
    return { service, users, auth, email, manager };
  };
  it('parses the config and sends invitations in the user creation transaction', async () => {
    const { service, users, auth, email, manager } = setup();
    const result = await service.inviteUsersFromCsv(
      file('email,username,role\nalex@example.com,Alex,operator\n'),
      JSON.stringify(config),
      'de',
      9,
    );
    expect(result).toEqual([{ id: 7, username: 'alex', email: 'alex@example.com' }]);
    expect(users.ensureLicenseForNewUsers).toHaveBeenCalledWith(1);
    expect(users.createMany).toHaveBeenCalledWith(
      [{ email: 'alex@example.com', username: 'alex', row: 1, roleKey: 'operator', locale: 'de' }],
      { grantAllPermissionsToFirst: true, manager, actorId: 9 },
    );
    expect(auth.generateEmailVerificationToken).toHaveBeenCalledWith(result[0], manager);
    expect(email.sendUserInvitationEmail).toHaveBeenCalledWith(result[0], 'verification-token', manager);
  });
  it('maps a LicenseError to a ForbiddenException with the reason', async () => {
    const { service, users } = setup();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    users.ensureLicenseForNewUsers.mockRejectedValue(
      new LicenseError('Trying to use more than the allowed amount of users'),
    );
    const promise = service.inviteUsersFromCsv(file('email,username,role\nalex@example.com,Alex,\n'), config);
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toMatchObject({ message: 'Trying to use more than the allowed amount of users' });
    expect(users.createMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Blocking user invitation due to license: Trying to use more than the allowed amount of users',
    );
    warn.mockRestore();
  });
  it('re-throws non-license errors from the license check unchanged', async () => {
    const { service, users } = setup();
    const failure = new Error('database down');
    users.ensureLicenseForNewUsers.mockRejectedValue(failure);
    await expect(
      service.inviteUsersFromCsv(file('email,username,role\nalex@example.com,Alex,\n'), config),
    ).rejects.toBe(failure);
  });
  it('reports database email and username collisions at their source row', async () => {
    const { service, users } = setup();
    users.findByEmailsOrUsernames.mockResolvedValue([{ email: 'ALEX@example.com', username: 'Alex' }]);
    await expect(
      service.inviteUsersFromCsv(file('email,username,role\nalex@example.com,Alex,\n'), config),
    ).rejects.toMatchObject({
      response: {
        message: 'DUPLICATE_IN_DB',
        errors: expect.arrayContaining([
          expect.objectContaining({ row: 1, field: 'email' }),
          expect.objectContaining({ row: 1, field: 'username' }),
        ]),
      },
    });
    expect(users.createMany).not.toHaveBeenCalled();
  });
  it('rejects invalid config and CSV rows before creating accounts', async () => {
    const { service, users } = setup();
    const csv = file('email,username,role\ninvalid,Alex,\n');
    await expect(service.inviteUsersFromCsv(csv, '{')).rejects.toThrow('Invalid config payload');
    await expect(service.inviteUsersFromCsv(csv, { ...config, ignoredRows: ['invalid'] } as never)).rejects.toThrow();
    await expect(service.inviteUsersFromCsv(csv, config)).rejects.toMatchObject({
      response: { message: 'INVALID_CSV' },
    });
    await expect(service.inviteUsersFromCsv(csv, { ...config, ignoredRows: [1] })).rejects.toMatchObject({
      response: { message: 'NO_CANDIDATES_IN_CSV' },
    });
    expect(users.createMany).not.toHaveBeenCalled();
  });
  it('rejects a missing or non-object config before reading the file', async () => {
    const { service, users } = setup();
    await expect(service.inviteUsersFromCsv(undefined, undefined)).rejects.toThrow('config is required');
    await expect(service.inviteUsersFromCsv(undefined, 'null')).rejects.toThrow('config is required');
    for (const rawConfig of ['123', '"abc"', '[]', 'true']) {
      await expect(service.inviteUsersFromCsv(undefined, rawConfig)).rejects.toThrow('config must be a JSON object');
    }
    expect(users.findByEmailsOrUsernames).not.toHaveBeenCalled();
    expect(users.createMany).not.toHaveBeenCalled();
  });
  it('collects missing, invalid and duplicate identity errors without accepting those rows', async () => {
    const { service, users } = setup();
    users.validateUsernameOrThrow.mockImplementation((value) => {
      if (value === 'bad') throw new Error('INVALID_USERNAME');
    });
    const parsed = await service.parseCsvFile(
      file('email,username,role\n,Alex,\ninvalid,Bad,\nvalid@example.com,Alex,\nother@example.com,,\n,,\n'),
      config,
    );
    expect(parsed.candidates).toEqual([]);
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 1, field: 'email', message: 'REQUIRED' }),
        expect.objectContaining({ row: 2, field: 'email', message: 'INVALID' }),
        expect.objectContaining({ row: 2, field: 'username', message: 'INVALID_USERNAME' }),
        expect.objectContaining({ row: 3, field: 'username', message: 'DUPLICATE_IN_CSV' }),
        expect.objectContaining({ row: 4, field: 'username', message: 'REQUIRED' }),
        expect.objectContaining({ row: 5, message: 'Row is empty' }),
      ]),
    );
  });
});

describe('single invitations', () => {
  const setup = () => {
    const users = {
      cleanupUsername: jest.fn((value: string) => value.trim().toLowerCase()),
      findByEmailsOrUsernames: jest.fn().mockResolvedValue([]),
      ensureLicenseForNewUsers: jest.fn(),
      withTransaction: jest.fn(async (run) => run({})),
      createMany: jest.fn().mockResolvedValue([{ id: 7, username: 'alex', email: 'alex@example.com' }]),
    };
    const auth = { generateEmailVerificationToken: jest.fn().mockResolvedValue('verification-token') };
    const email = { sendUserInvitationEmail: jest.fn() };
    const service = new UserInvitationService(users as never, auth as never, email as never);
    return { service, users, email };
  };

  it.each([
    ['email', [{ id: 3, username: 'someone', email: 'alex@example.com' }], 'Email already exists'],
    ['username', [{ id: 3, username: 'alex', email: 'other@example.com' }], 'Username already exists'],
    [
      'email before username',
      [
        { id: 3, username: 'alex', email: 'other@example.com' },
        { id: 4, username: 'someone', email: 'alex@example.com' },
      ],
      'Email already exists',
    ],
  ])('rejects a taken %s before creating the account', async (_case, existing, message) => {
    const { service, users, email } = setup();
    users.findByEmailsOrUsernames.mockResolvedValue(existing);
    await expect(service.inviteUser({ username: ' Alex ', email: ' alex@example.com ' })).rejects.toThrow(message);
    expect(users.findByEmailsOrUsernames).toHaveBeenCalledWith(['alex@example.com'], ['alex']);
    expect(users.createMany).not.toHaveBeenCalled();
    expect(email.sendUserInvitationEmail).not.toHaveBeenCalled();
  });

  it('does not treat an email that differs only in case as taken', async () => {
    const { service, users } = setup();
    users.findByEmailsOrUsernames.mockResolvedValue([{ id: 3, username: 'alex', email: 'Alex@Example.com' }]);
    await expect(service.inviteUser({ username: 'alex', email: 'alex@example.com' })).rejects.toThrow(
      'Username already exists',
    );
  });

  it('invites a user whose email and username are free', async () => {
    const { service, users, email } = setup();
    await expect(service.inviteUser({ username: 'alex', email: 'alex@example.com' }, 'de')).resolves.toEqual({
      id: 7,
      username: 'alex',
      email: 'alex@example.com',
    });
    expect(users.createMany).toHaveBeenCalledTimes(1);
    expect(email.sendUserInvitationEmail).toHaveBeenCalledTimes(1);
  });
});
