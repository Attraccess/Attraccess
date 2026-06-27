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
    permissions: {
      canManageResources: { keyMapping: 'perm', yesValue: 'true' },
      canManageSystemConfiguration: { keyMapping: 'perm', yesValue: 'true' },
      canManageUsers: { keyMapping: 'perm', yesValue: 'true' },
      canManageBilling: { keyMapping: 'perm', yesValue: 'true' },
    },
    ...overrides,
  });

  it('parses quoted values and honors ignored rows', async () => {
    const csv = 'email,username,perm\n"john@example.com","user1","tr,ue"\nsecond@example.com,user2,tr,ue\n';
    const file: FileUpload = { buffer: Buffer.from(csv) } as FileUpload;
    const config = buildConfig({
      permissions: {
        canManageResources: { keyMapping: 'perm', yesValue: 'true' },
        canManageSystemConfiguration: { keyMapping: 'perm', yesValue: 'true' },
        canManageUsers: { keyMapping: 'perm', yesValue: 'tr,ue' },
        canManageBilling: { keyMapping: 'perm', yesValue: 'true' },
      },
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
