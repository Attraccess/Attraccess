import { NetworkRestrictionService } from '../../../network-restriction/network-restriction.service';
import {
  CanActivate,
  ClassSerializerInterceptor,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ResourceUsageAction } from '@attraccess/application-models';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { SessionEndNotifier } from '../pre-start/session-end-notifier.service';
import { PreStartService } from '../pre-start/pre-start.service';
import { ResourceListVisibilityService } from '../../visibility/resource-list-visibility.service';

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = {
      id: 7,
      authenticationMethod: 'session',
      effectivePermissions: new Set(['resources.update']),
    };
    return true;
  }
}

/**
 * A user as the session keeps it (with the mail address flows and notifications need), plus the private columns of
 * a full account record, as if one ever reached a session: none of them may be answered.
 */
const user = (id: number) => ({
  id,
  username: `user-${id}`,
  locale: 'en',
  dateTimeLocale: null,
  isEmailVerified: true,
  isDisabled: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
  externalIdentifier: null,
  creditBalance: 10,
  billingFactor: 100,
  email: `user-${id}@example.test`,
  passwordResetToken: 'reset-token',
  emailVerificationToken: 'verify-token',
  deleteAccountToken: 'delete-token',
  nfcKeySeedToken: 'nfc-seed-token',
});

const session = {
  id: 8,
  usageAction: ResourceUsageAction.Usage,
  resourceId: 5,
  userId: 7,
  startTime: new Date('2026-08-28T10:00:00.000Z'),
  endTime: new Date('2026-08-28T11:00:00.000Z'),
  supervisorUserId: 3,
  user: user(7),
  supervisorUser: user(3),
  project: { id: 9, name: 'Thesis', owner: user(7) },
  formSubmissions: [{ id: 1, formId: 11, userId: 7, user: user(7), data: {} }],
};

const PRIVATE = ['@example.test', 'reset-token', 'verify-token', 'delete-token', 'nfc-seed-token'];

describe('usage session responses', () => {
  let app: INestApplication;
  const service = {
    startSession: jest.fn().mockResolvedValue(session),
    endSession: jest.fn().mockResolvedValue(session),
    lockDoor: jest.fn().mockResolvedValue(session),
    unlockDoor: jest.fn().mockResolvedValue(session),
    isAccessOnlyDoor: jest.fn().mockResolvedValue(false),
    unlatchDoor: jest.fn().mockResolvedValue(session),
    updateSessionProject: jest.fn().mockResolvedValue(session),
    getResourceUsageHistory: jest.fn().mockResolvedValue({ data: [session], total: 1 }),
    getActiveSessionOverview: jest.fn().mockResolvedValue({
      usage: session,
      usages: [session],
      activeSessionCount: 1,
      maxParallelSessions: 1,
      isFull: true,
    }),
    getSessionDetails: jest.fn().mockResolvedValue(session),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        { provide: ResourceListVisibilityService, useValue: { canSee: jest.fn(async () => true) } },
        { provide: ResourceUsageService, useValue: service },
        {
          provide: ResourceActivityVisibilityService,
          useValue: Object.assign(new ResourceActivityVisibilityService({} as never, {} as never, {} as never), {
            resolve: jest.fn().mockResolvedValue('full'),
            resolveSessions: jest.fn().mockResolvedValue('full'),
          }),
        },
        { provide: PreStartService, useValue: { gateHttp: jest.fn().mockResolvedValue(undefined) } },
        { provide: SessionEndNotifier, useValue: { applyDefault: jest.fn() } },
        { provide: NetworkRestrictionService, useValue: { assertAllowed: jest.fn() } },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(FakeAuth)
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    // As in main.bootstrap: plain records pass the serializer unchanged, so only the mapping keeps data private.
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it.each([
    ['post', '/resources/5/usage/start', {}],
    ['put', '/resources/5/usage/end', {}],
    ['post', '/resources/5/usage/lock', {}],
    ['post', '/resources/5/usage/unlock', {}],
    ['post', '/resources/5/usage/unlatch', {}],
    ['put', '/resources/5/usage/sessions/8/project', { projectId: null }],
    ['get', '/resources/5/usage/history?page=1&limit=10', undefined],
    ['get', '/resources/5/usage/active', undefined],
    ['get', '/resources/5/usage/8', undefined],
  ] as const)('%s %s answers users without their mail address or tokens', async (method, path, body) => {
    const call = request(app.getHttpServer())[method](path);
    const response = body === undefined ? await call : await call.send(body);

    expect(response.status).toBeLessThan(300);
    const text = JSON.stringify(response.body);
    for (const value of PRIVATE) expect(text).not.toContain(value);
    for (const key of ['email', 'passwordResetToken', 'emailVerificationToken', 'nfcKeySeedToken']) {
      expect(text).not.toContain(`"${key}"`);
    }
    expect(text).toContain('"username":"user-7"');
  });
});
