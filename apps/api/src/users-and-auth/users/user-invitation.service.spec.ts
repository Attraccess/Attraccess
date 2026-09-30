import { Test, TestingModule } from '@nestjs/testing';
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
