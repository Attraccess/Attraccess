import { ClassSerializerInterceptor, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { BillingTransaction, ResourceUsage, User } from '@attraccess/database-entities';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ResourceOperatingAttributionService } from '../resources/operating-intervals/resource-operating-attribution.service';
import { UsersAdminController } from '../users-and-auth/users/users-admin.controller';
import { UsersService } from '../users-and-auth/users/users.service';
import { UserPasswordService } from '../users-and-auth/users/user-password.service';
import { BruteForceProtectionService } from '../users-and-auth/rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';

// `User.email` is @Exclude()d globally. The analytics export responses expose it through explicit flat
// fields only; this proves that, and that a regular user endpoint still never serializes it.
describe('email exposure (HTTP integration, with the global ClassSerializerInterceptor)', () => {
  let app: INestApplication;
  let permissions: string[];

  const makeUser = (id: number, email: string) =>
    Object.assign(new User(), { id, username: `user${id}`, email, externalIdentifier: `EXT-${id}` });

  const usage = Object.assign(new ResourceUsage(), {
    id: 1,
    resourceId: 1,
    user: makeUser(1, 'user@example.com'),
    supervisorUser: makeUser(2, 'mentor@example.com'),
    resource: { id: 1, name: 'Lathe', metadata: { costCenter: '4711' } },
  });
  const transaction = Object.assign(new BillingTransaction(), {
    id: 5,
    user: makeUser(1, 'user@example.com'),
    initiator: makeUser(3, 'initiator@example.com'),
    resourceUsage: { id: 1, resource: { id: 1, name: 'Lathe', metadata: { costCenter: '4711' } } },
    items: [],
  });

  const usersService = { findOne: jest.fn() };

  beforeAll(async () => {
    usersService.findOne.mockResolvedValue(makeUser(1, 'user@example.com'));

    const module = await Test.createTestingModule({
      controllers: [AnalyticsController, UsersAdminController],
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(ResourceUsage), useValue: { findAndCount: async () => [[usage], 1] } },
        { provide: getRepositoryToken(BillingTransaction), useValue: { findAndCount: async () => [[transaction], 1] } },
        { provide: ResourceOperatingAttributionService, useValue: {} },
        { provide: UsersService, useValue: usersService },
        { provide: UserPasswordService, useValue: {} },
        { provide: BruteForceProtectionService, useValue: {} },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
        DualAuthGuard,
        EffectivePermissionsGuard,
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: 1,
            jwtTokenId: 'tok',
            authenticationMethod: 'session',
            effectivePermissions: new Set(permissions),
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    permissions = ['resources.reports.export', 'resources.update', 'users.read'];
  });

  const range = 'start=2023-01-01T00:00:00.000Z&end=2023-01-31T00:00:00.000Z';

  it('exposes user and supervisor email, external identifier and resource metadata in the usage export', async () => {
    const response = await request(app.getHttpServer()).get(`/analytics/resource-usage-hours?${range}`).expect(200);
    const row = response.body.data[0];

    expect(row.userEmail).toBe('user@example.com');
    expect(row.supervisorEmail).toBe('mentor@example.com');
    expect(row.user.externalIdentifier).toBe('EXT-1');
    expect(row.resource.metadata).toEqual({ costCenter: '4711' });
    // the nested user objects stay email-free
    expect(row.user).not.toHaveProperty('email');
    expect(row.supervisorUser).not.toHaveProperty('email');
  });

  it('exposes user and initiator email and resource metadata in the billing export', async () => {
    const response = await request(app.getHttpServer()).get(`/analytics/billing-transactions?${range}`).expect(200);
    const row = response.body.data[0];

    expect(row.userEmail).toBe('user@example.com');
    expect(row.initiatorEmail).toBe('initiator@example.com');
    expect(row.user.externalIdentifier).toBe('EXT-1');
    expect(row.resourceUsage.resource.metadata).toEqual({ costCenter: '4711' });
    expect(row.user).not.toHaveProperty('email');
    expect(row.initiator).not.toHaveProperty('email');
  });

  it('nulls the billing emails for a caller with only resources.update', async () => {
    permissions = ['resources.update'];

    const response = await request(app.getHttpServer()).get(`/analytics/billing-transactions?${range}`).expect(200);
    const row = response.body.data[0];

    expect(row.userEmail).toBeNull();
    expect(row.initiatorEmail).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('@example.com');
  });

  it('exposes the billing emails for a caller with resources.update and billing.manage', async () => {
    permissions = ['resources.update', 'billing.manage'];

    const response = await request(app.getHttpServer()).get(`/analytics/billing-transactions?${range}`).expect(200);
    const row = response.body.data[0];

    expect(row.userEmail).toBe('user@example.com');
    expect(row.initiatorEmail).toBe('initiator@example.com');
    expect(row.user).not.toHaveProperty('email');
    expect(row.initiator).not.toHaveProperty('email');
  });

  it('still excludes the email from a regular user endpoint (GET /users/:id)', async () => {
    const response = await request(app.getHttpServer()).get('/users/1').expect(200);

    expect(response.body.username).toBe('user1');
    expect(response.body).not.toHaveProperty('email');
    expect(JSON.stringify(response.body)).not.toContain('user@example.com');
  });
});
