import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { MachineBusyError } from '../errors/machine-busy.error';
import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { SessionEndNotifier } from '../pre-start/session-end-notifier.service';
import { PreStartService } from '../pre-start/pre-start.service';
import { SESSION_CHANGE_WAIT_MS, SessionChangeQueue } from './session-change-queue';
import {
  CARD_SESSION_GRACE_MS,
  CARD_SESSION_MAX_HOLD_MS,
  UNLOCKED_TIMEOUT_MS,
} from '../../../attractap/websockets/handlers/ui/card-session.service';

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = {
      id: 7,
      effectivePermissions: new Set(),
      locale: 'en',
      authenticationMethod: 'session',
    };
    return true;
  }
}

/** The web path: HTTP request -> controller -> a start/stop that has to queue behind the one holding the machine. */
describe('waiting for a shared machine over the web API', () => {
  let app: INestApplication;
  const queue = new SessionChangeQueue();
  let releaseHolder: () => void;

  beforeEach(async () => {
    // Someone else's change holds machine 5 for the whole test.
    const holder = new Promise<void>((resolve) => (releaseHolder = resolve));
    void queue.run(5, () => holder);
    // The web path waits the same way a real service does, here with a short limit instead of 30 s.
    const waitForMachine = (resourceId: number) =>
      resourceId === 6
        ? Promise.reject(new SessionChangeInterruptedError())
        : queue.run(5, async () => ({ id: 1, userId: 7 }), 100);
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        { provide: ResourceUsageService, useValue: { startSession: waitForMachine, endSession: waitForMachine } },
        { provide: ResourceActivityVisibilityService, useValue: {} },
        { provide: PreStartService, useValue: { gateHttp: jest.fn().mockResolvedValue({ kind: 'proceed' }) } },
        { provide: SessionEndNotifier, useValue: { applyDefault: jest.fn() } },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(FakeAuth)
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    releaseHolder();
    await app.close();
  });

  it.each([
    ['start', 'post', 'start'],
    ['stop', 'put', 'end'],
  ] as const)('answers a %s that waited too long with a retryable 503, not a 500', async (_name, method, path) => {
    const startedAt = Date.now();
    const response = await request(app.getHttpServer())[method](`/resources/5/usage/${path}`).send({});
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ message: 'MachineBusyError', statusCode: 503 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90);
  });

  it.each([
    ['start', 'post', 'start'],
    ['stop', 'put', 'end'],
  ] as const)('answers a %s interrupted by a restart with a retryable 503 as well', async (_name, method, path) => {
    const response = await request(app.getHttpServer())[method](`/resources/6/usage/${path}`).send({});
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ message: 'SessionChangeInterruptedError', statusCode: 503 });
  });
});

describe('the 30 s wait for a shared machine', () => {
  it('is exactly 30 s: a waiter is refused at 30 s, not before', async () => {
    jest.useFakeTimers();
    try {
      const queue = new SessionChangeQueue();
      void queue.run(1, () => new Promise<void>(() => undefined));
      let outcome: unknown = 'pending';
      queue
        .run(1, async () => 'ran')
        .then(
          (value) => (outcome = value),
          (error) => (outcome = error),
        );
      await jest.advanceTimersByTimeAsync(SESSION_CHANGE_WAIT_MS - 1);
      expect(outcome).toBe('pending');
      await jest.advanceTimersByTimeAsync(1);
      expect(outcome).toBeInstanceOf(MachineBusyError);
      expect(SESSION_CHANGE_WAIT_MS).toBe(30_000);
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * Nothing between a reader or browser and the queue may give up before the server's 30 s wait is over.
 * These pin the timeouts that exist in this repository; a new, shorter one must fail here.
 */
describe('client and transport timeouts versus the 30 s wait', () => {
  const root = join(__dirname, '../../../../../..');
  const readerActionWatchdogMs = () => {
    const source = readFileSync(join(root, 'apps/attractap/firmware/src/application/application_state.cpp'), 'utf8');
    const match = /now - this->pendingUiStartedAt > (\d+)/.exec(source);
    expect(match).not.toBeNull();
    return Number(match?.[1]);
  };

  it('lets Node keep HTTP requests open longer than the wait', () => {
    const server = createServer();
    expect(server.requestTimeout).toBeGreaterThan(SESSION_CHANGE_WAIT_MS);
    expect(server.timeout).toBe(0);
    server.close();
  });

  it('sets no shorter HTTP server timeout in the API bootstrap', () => {
    const bootstrap = readFileSync(join(__dirname, '../../../main.bootstrap.ts'), 'utf8');
    expect(bootstrap).not.toMatch(/requestTimeout|headersTimeout|server\.setTimeout|\.timeout\s*=/);
  });

  it('keeps the reader signed in on the server while a start waits and runs, at least as long as the reader waits', () => {
    // Without a hold a card session lives this long; a start or stop in flight holds it (CardSessionService.hold).
    expect(UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS).toBeGreaterThan(SESSION_CHANGE_WAIT_MS);
    expect(CARD_SESSION_MAX_HOLD_MS).toBeGreaterThanOrEqual(readerActionWatchdogMs());
  });

  it('lets the reader wait for a start or stop longer than the server waits for the machine', () => {
    // The reader gives up on an unconfirmed action after this long ("Action not confirmed").
    expect(readerActionWatchdogMs()).toBeGreaterThan(SESSION_CHANGE_WAIT_MS);
  });

  it('keeps the reader socket alive while it waits: probes arrive well within the liveness timeout', () => {
    const header = readFileSync(join(root, 'apps/attractap/firmware/src/websocket/websocket.hpp'), 'utf8');
    const ms = (name: string) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(header)?.[1]);
    const probeEvery = ms('PONG_PROBE_INTERVAL_MS');
    const liveness = ms('INBOUND_LIVENESS_TIMEOUT_MS');
    expect(probeEvery).toBeGreaterThan(0);
    // Pongs count as inbound frames, so a reader waiting 30 s for its start reply is never declared dead.
    expect(probeEvery * 2).toBeLessThan(liveness);
  });

  it('has no fixed reply timeout in the reader for start/stop requests', () => {
    const application = readFileSync(join(root, 'apps/attractap/firmware/src/application/application.hpp'), 'utf8');
    expect(application).not.toMatch(/(START|STOP|ACTION)_(RESPONSE|REPLY)_TIMEOUT/i);
  });
});
