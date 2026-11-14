import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, DualAuthGuard, User } from '@attraccess/plugins-backend-sdk';
import request from 'supertest';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { UserInvitationService } from './user-invitation.service';
import { UserInvitationsController } from './user-invitations.controller';
import { UsersService } from './users.service';

describe('user invitation endpoints (HTTP)', () => {
  let app: INestApplication;
  const users = {
    cleanupUsername: jest.fn((value: string) => value.toLowerCase()),
    validateUsernameOrThrow: jest.fn(),
    findByEmailsOrUsernames: jest.fn(),
    ensureLicenseForNewUsers: jest.fn(),
    withTransaction: jest.fn(async (run) => run({})),
    createMany: jest.fn(),
  };
  const csv = Buffer.from('email,username,role\nalex@example.com,Alex,operator\n');
  const config = { emailKey: 'email', usernameKey: 'username' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserInvitationsController],
      providers: [
        UserInvitationService,
        { provide: UsersService, useValue: users },
        { provide: AuthService, useValue: { generateEmailVerificationToken: jest.fn().mockResolvedValue('token') } },
        { provide: EmailService, useValue: { sendUserInvitationEmail: jest.fn() } },
        { provide: BruteForceProtectionService, useValue: {} },
        { provide: AuthAuditLogger, useValue: {} },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
          if (!req.headers['x-test-user']) throw new UnauthorizedException();
          req.user = Object.assign(new User(), {
            id: Number(req.headers['x-test-user']),
            effectivePermissions: new Set(String(req.headers['x-test-permissions'] ?? '').split(',')),
          });
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    users.findByEmailsOrUsernames.mockResolvedValue([]);
    users.createMany.mockResolvedValue([{ id: 7, username: 'alex', email: 'alex@example.com' }]);
  });
  afterAll(async () => app.close());

  const post = (permissions = 'users.create') =>
    request(app.getHttpServer())
      .post('/users/invite-csv')
      .set('x-test-user', '1')
      .set('x-test-permissions', permissions);

  it('returns 400 naming config when the config field is missing', async () => {
    const response = await post().attach('file', csv, 'users.csv').expect(400);
    expect(response.body).toMatchObject({ statusCode: 400, message: 'config is required', error: 'Bad Request' });
    expect(users.findByEmailsOrUsernames).not.toHaveBeenCalled();
    expect(users.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 naming config when neither file nor config is sent', async () => {
    const response = await post().field('other', 'x').expect(400);
    expect(response.body.message).toBe('config is required');
  });

  it('returns 400 naming config for a JSON null config', async () => {
    const response = await post().attach('file', csv, 'users.csv').field('config', 'null').expect(400);
    expect(response.body.message).toBe('config is required');
  });

  it.each(['123', '"abc"', '[]', 'true'])('returns 400 naming config for the non-object config %s', async (value) => {
    const response = await post().attach('file', csv, 'users.csv').field('config', value).expect(400);
    expect(response.body.message).toBe('config must be a JSON object');
    expect(users.createMany).not.toHaveBeenCalled();
  });

  it('keeps the malformed JSON error', async () => {
    const response = await post().attach('file', csv, 'users.csv').field('config', '{').expect(400);
    expect(response.body.message).toBe('Invalid config payload');
  });

  it('invites the users of a valid CSV', async () => {
    const response = await post().attach('file', csv, 'users.csv').field('config', JSON.stringify(config)).expect(201);
    expect(response.body).toEqual([{ id: 7, username: 'alex', email: 'alex@example.com' }]);
    expect(users.createMany).toHaveBeenCalledWith(
      [{ email: 'alex@example.com', username: 'alex', row: 1, locale: undefined }],
      expect.objectContaining({ actorId: 1 }),
    );
  });

  it('requires users.roles.manage to assign roles from a column', async () => {
    await post()
      .attach('file', csv, 'users.csv')
      .field('config', JSON.stringify({ ...config, roleKeyColumn: 'role' }))
      .expect(403);
    expect(users.createMany).not.toHaveBeenCalled();
  });

  describe('POST /users/invite', () => {
    const invite = (body: object) =>
      request(app.getHttpServer())
        .post('/users/invite')
        .set('x-test-user', '1')
        .set('x-test-permissions', 'users.create')
        .send(body);

    it('returns 400 when the email is already taken', async () => {
      users.findByEmailsOrUsernames.mockResolvedValue([{ id: 3, username: 'someone', email: 'alex@example.com' }]);
      const response = await invite({ username: 'alex', email: 'alex@example.com' }).expect(400);
      expect(response.body.message).toBe('Email already exists');
      expect(users.createMany).not.toHaveBeenCalled();
    });

    it('returns 400 when the username is already taken', async () => {
      users.findByEmailsOrUsernames.mockResolvedValue([{ id: 3, username: 'alex', email: 'other@example.com' }]);
      const response = await invite({ username: 'Alex', email: 'alex@example.com' }).expect(400);
      expect(response.body.message).toBe('Username already exists');
      expect(users.createMany).not.toHaveBeenCalled();
    });

    it('invites a user whose email and username are free', async () => {
      const response = await invite({ username: 'alex', email: 'alex@example.com' }).expect(201);
      expect(response.body).toEqual({ id: 7, username: 'alex', email: 'alex@example.com' });
      expect(users.findByEmailsOrUsernames).toHaveBeenCalledWith(['alex@example.com'], ['alex']);
    });
  });
});
