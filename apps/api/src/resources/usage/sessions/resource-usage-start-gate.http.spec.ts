import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { SessionEndNotifier } from '../pre-start/session-end-notifier.service';
import { PreStartService } from '../pre-start/pre-start.service';
import { StartBlockedException, StartConfirmationRequiredException } from '../pre-start/start-confirmation.errors';
import { ResourceListVisibilityService } from '../../visibility/resource-list-visibility.service';

let principal: Record<string, unknown> = { authenticationMethod: 'session' };

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.user = { id: 7, effectivePermissions: new Set(), locale: 'de', ...principal };
    return true;
  }
}

describe('POST /resources/:id/usage/start through the pre-start gate', () => {
  let app: INestApplication;
  const gateHttp = jest.fn();
  const startSession = jest.fn();

  const applyDefault = jest.fn();
  const endSession = jest.fn();

  beforeEach(async () => {
    principal = { authenticationMethod: 'session' };
    applyDefault.mockReset();
    endSession.mockReset().mockResolvedValue({ id: 12, userId: 7 });
    gateHttp.mockReset();
    startSession.mockReset().mockResolvedValue({ id: 99 });
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        { provide: ResourceListVisibilityService, useValue: { canSee: jest.fn(async () => true) } },
        { provide: ResourceUsageService, useValue: { startSession, endSession } },
        { provide: ResourceActivityVisibilityService, useValue: {} },
        { provide: PreStartService, useValue: { gateHttp } },
        { provide: SessionEndNotifier, useValue: { applyDefault } },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(FakeAuth)
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('answers 409 CONFIRMATION_REQUIRED with the confirmation and a stepId, and starts nothing', async () => {
    const confirmation = { title: 'Reserved', body: 'Start anyway?', expiresAtMs: 1790000060000 };
    gateHttp.mockRejectedValue(new StartConfirmationRequiredException('k3J9vQ2mXc8LrT0aW5yZbQ', confirmation));
    const response = await request(app.getHttpServer()).post('/resources/5/usage/start').send({});
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      stepId: 'k3J9vQ2mXc8LrT0aW5yZbQ',
      confirmation,
    });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('answers 403 START_BLOCKED with the literal reason', async () => {
    const reason = { code: 'RESERVED', title: 'Reserved', body: 'Booked until 16:00' };
    gateHttp.mockRejectedValue(new StartBlockedException(reason));
    const response = await request(app.getHttpServer()).post('/resources/5/usage/start').send({});
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'START_BLOCKED', reason });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('passes confirmedStepIds and the principal to the gate, then starts the session', async () => {
    gateHttp.mockResolvedValue(undefined);
    const response = await request(app.getHttpServer())
      .post('/resources/5/usage/start')
      .send({ confirmedStepIds: ['k3J9vQ2mXc8LrT0aW5yZbQ'] });
    expect(response.status).toBe(201);
    expect(gateHttp).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ id: 7 }),
      expect.objectContaining({ confirmedStepIds: ['k3J9vQ2mXc8LrT0aW5yZbQ'] }),
      { origin: 'web', authenticationMethod: 'session' },
    );
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('maps an API token to origin api with its token id', async () => {
    principal = { authenticationMethod: 'api-token', apiTokenId: 31 };
    gateHttp.mockResolvedValue(undefined);
    await request(app.getHttpServer()).post('/resources/5/usage/start').send({});
    expect(gateHttp).toHaveBeenCalledWith(5, expect.objectContaining({ id: 7 }), expect.anything(), {
      origin: 'api',
      apiTokenId: 31,
      authenticationMethod: 'api-token',
    });
  });

  it('maps an MCP OAuth client to origin api, not to the web', async () => {
    principal = { authenticationMethod: 'mcp-oauth' };
    gateHttp.mockResolvedValue(undefined);
    await request(app.getHttpServer()).post('/resources/5/usage/start').send({});
    expect(gateHttp).toHaveBeenCalledWith(5, expect.objectContaining({ id: 7 }), expect.anything(), {
      origin: 'api',
      authenticationMethod: 'mcp-oauth',
    });
  });

  it.each([
    ['web for a session', { authenticationMethod: 'session' }, 'web', { id: 7, authenticationMethod: 'session' }],
    [
      'api for an API token',
      { authenticationMethod: 'api-token', apiTokenId: 31 },
      'api',
      { id: 7, authenticationMethod: 'api-token', apiTokenId: 31 },
    ],
  ])('starts with the step keys the gate confirmed and origin %s', async (_label, user, origin, auditOrigin) => {
    principal = user;
    gateHttp.mockResolvedValue({ reservations: ['override-4'] });
    const response = await request(app.getHttpServer()).post('/resources/5/usage/start').send({});
    expect(response.status).toBe(201);
    expect(startSession).toHaveBeenCalledWith(5, expect.objectContaining({ id: 7 }), expect.anything(), {
      auditOrigin,
      origin,
      confirmedStepKeys: { reservations: ['override-4'] },
    });
  });

  it('applies the session-end default for an API stop in the user language, never through the start gate', async () => {
    principal = { authenticationMethod: 'api-token', apiTokenId: 31 };
    const response = await request(app.getHttpServer()).put('/resources/5/usage/end').send({});
    expect(response.status).toBe(200);
    expect(gateHttp).not.toHaveBeenCalled();
    expect(applyDefault).toHaveBeenCalledWith({ resourceId: 5, userId: 7, sessionId: 12 }, 'api', 'de');
  });
});
