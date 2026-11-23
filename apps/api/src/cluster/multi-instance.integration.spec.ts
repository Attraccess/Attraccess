import Redis from 'ioredis';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { Resource, ResourceIntroduction, User } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { firstValueFrom, filter, take, timeout } from 'rxjs';
import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { TypeOrmResourceIntroductionStore } from '../database/adapters/resources/resource-introduction-store.adapter';
import { createTestDataSource, closeTestDataSource } from '../test-utils/test-database';
import { ResourceIntroductionsService } from '../resources/introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../resources/introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../resources/groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../resources/groups/introducers/resourceGroups.introducers.service';
import { MASS_INTRODUCTION_TARGET_STORE } from '../resources/mass-introductions/mass-introduction-target-store.port';
import { MassIntroductionLiveService } from '../resources/mass-introductions/mass-introduction-live.service';
import { MassIntroductionService } from '../resources/mass-introductions/mass-introduction.service';
import { MassIntroductionLiveEventType } from '../resources/mass-introductions/dtos/massIntroductionLiveEvent.dto';
import { SupervisionService } from '../resources/supervision/supervision.service';
import { SupervisionLiveService } from '../resources/supervision/supervision-live.service';
import { SupervisionLiveEventType } from '../resources/supervision/dtos/supervisionLiveEvent.dto';
import { ResourceUsageService } from '../resources/usage/sessions/resource-usage.service';
import { PreStartService } from '../resources/usage/pre-start/pre-start.service';
import { UsersService } from '../users-and-auth/users/users.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../metrics/metrics.service';
import { AttractapService } from '../attractap/attractap.service';
import { ATTRACTAP_RESOURCE_READS } from '../attractap/reader-resource-reads.port';
import { WebsocketService } from '../attractap/websockets/websocket.service';
import { ReaderRouter } from '../attractap/websockets/reader-router';
import { ReaderScreenService } from '../attractap/websockets/reader-screen.service';
import { CardOperationsService } from '../attractap/websockets/card-operations.service';
import { CardWriterPolicyService } from '../attractap/websockets/card-writer-policy.service';
import { CardConversationService } from '../attractap/websockets/card-conversation.service';
import { CardSessionService } from '../attractap/websockets/handlers/ui/card-session.service';
import { ResourceListService } from '../attractap/websockets/handlers/resource-list/resource-list.service';
import { AttractapFormsHandler } from '../attractap/websockets/handlers/forms/forms.handler';
import { AttractapCardHandler } from '../attractap/websockets/handlers/card/card.handler';
import { AttractapMassIntroductionHandler } from '../attractap/websockets/handlers/mass-introduction/mass-introduction.handler';
import { AttractapSupervisionHandler } from '../attractap/websockets/handlers/supervision/supervision.handler';
import { AttractapEventType, AuthenticatedWebSocket } from '../attractap/websockets/websocket.types';
import { ClusterService } from './cluster.service';

jest.setTimeout(120_000);

const FAST = { heartbeatEveryMs: 200, sweepEveryMs: 200, deadlineSweepEveryMs: 50 };
const READER_ID = 3;
const RESOURCE_ID = 5;

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface Instance {
  name: string;
  cluster: ClusterService;
  massIntroductions: MassIntroductionService;
  massIntroductionLive: MassIntroductionLiveService;
  supervision: SupervisionService;
  supervisionLive: SupervisionLiveService;
  websockets: WebsocketService;
  cards: AttractapCardHandler;
  massIntroductionHandler: AttractapMassIntroductionHandler;
  supervisionHandler: AttractapSupervisionHandler;
  close(): Promise<void>;
}

/**
 * ATT-1163: two (or three) Nest application instances share one Valkey and one PostgreSQL database. The reader's
 * websocket is held by instance A; web calls and SSE streams go to instance B.
 */
describe('several API instances on one Valkey', () => {
  let container: StartedTestContainer;
  let source: DataSource;
  let users: Record<number, User>;
  const instances: Instance[] = [];
  const startedSessions: number[] = [];

  const introducer = {
    id: 0,
    username: 'tutor',
    effectivePermissions: new Set<string>(),
  } as unknown as AuthenticatedUser;

  const reader = () => ({
    id: READER_ID,
    name: 'Entrance',
    pairingState: 'paired',
    firmware: { capabilities: { cardEnrollment: true } },
    resources: [{ id: RESOURCE_ID }],
  });

  async function startInstance(
    name: string,
    redis = new Redis(container.getMappedPort(6379), container.getHost()),
  ): Promise<Instance> {
    const cluster = new ClusterService(redis, { instanceName: name, timing: FAST });
    const introductions = new ResourceIntroductionsService(
      new TypeOrmResourceIntroductionStore(source),
      { emit: () => true } as never,
      { resourceIntroductionsTotal: { inc: () => undefined } } as never,
      { dispatchToUser: async () => undefined } as never,
      { getIntroductionRetrainingStatus: async () => null } as never,
      { record: async () => undefined } as never,
    );
    const usage = {
      validateSupervisedStart: async () => undefined,
      assertSupportsSupervision: async () => ({ id: RESOURCE_ID }),
      getActiveSession: async () => null,
      getActiveSessionsForResource: async () => [],
      startSession: async (resourceId: number, requester: { id: number }) => {
        startedSessions.push(requester.id);
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { id: startedSessions.length, resourceId, userId: requester.id };
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: ClusterService, useValue: cluster },
        MassIntroductionService,
        MassIntroductionLiveService,
        SupervisionService,
        SupervisionLiveService,
        WebsocketService,
        ReaderRouter,
        ReaderScreenService,
        AttractapCardHandler,
        AttractapMassIntroductionHandler,
        AttractapSupervisionHandler,
        { provide: ResourceIntroductionsService, useValue: introductions },
        {
          provide: ResourceIntroducersService,
          useValue: { isIntroducer: async () => true, getMany: async () => [{ userId: 2, user: users[2] }] },
        },
        { provide: ResourceGroupsIntroductionsService, useValue: {} },
        { provide: ResourceGroupsIntroducersService, useValue: {} },
        {
          provide: MASS_INTRODUCTION_TARGET_STORE,
          useValue: {
            findResourceName: async (id: number) => ({ id, name: 'Laser' }),
            resourceIdsOfGroup: async () => [],
          },
        },
        { provide: ResourceUsageService, useValue: usage },
        { provide: AUDIT_RECORDER, useValue: { record: async () => undefined } },
        { provide: PreStartService, useValue: { gateSupervision: async () => undefined } },
        {
          provide: AttractapService,
          useValue: { findReaderById: async () => reader(), getNFCCardByID: async () => null },
        },
        {
          provide: CardOperationsService,
          // The card proof itself is covered by card-relay.spec.ts; here every tapped UID is its user's card.
          useValue: {
            verifyCard: async (_socket: unknown, _origin: unknown, detection: { uid: string }) => ({
              ok: true,
              card: { isActive: true, user: users[Number(detection.uid)] },
            }),
          },
        },
        { provide: UsersService, useValue: { findOne: async ({ id }: { id: number }) => users[id] ?? null } },
        { provide: ATTRACTAP_RESOURCE_READS, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        { provide: RbacService, useValue: {} },
        { provide: CardWriterPolicyService, useValue: { assertAllowed: async () => undefined } },
        { provide: CardConversationService, useValue: { abort: () => undefined } },
        { provide: CardSessionService, useValue: {} },
        { provide: ResourceListService, useValue: {} },
        { provide: AttractapFormsHandler, useValue: {} },
      ],
    }).compile();
    cluster.onModuleInit();
    await moduleRef.init();
    // An unreachable Valkey never confirms the subscription; the test wants exactly that instance.
    if (redis.options.port !== 1) await cluster.whenReady();
    const instance: Instance = {
      name,
      cluster,
      massIntroductions: moduleRef.get(MassIntroductionService),
      massIntroductionLive: moduleRef.get(MassIntroductionLiveService),
      supervision: moduleRef.get(SupervisionService),
      supervisionLive: moduleRef.get(SupervisionLiveService),
      websockets: moduleRef.get(WebsocketService),
      cards: moduleRef.get(AttractapCardHandler),
      massIntroductionHandler: moduleRef.get(AttractapMassIntroductionHandler),
      supervisionHandler: moduleRef.get(AttractapSupervisionHandler),
      close: async () => {
        await cluster.onApplicationShutdown();
        await moduleRef.close();
        redis.disconnect();
      },
    };
    instances.push(instance);
    return instance;
  }

  /** A reader websocket signed in on `instance`: every message is ACKed and recorded. */
  /** Resolves once Valkey lists the reader on this instance, as a real connect would before anyone routes to it. */
  async function connectReader(instance: Instance, id: string) {
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const socket = {
      id,
      readerId: READER_ID,
      readyState: 1,
      state: {
        cardRelay: true,
        verifiedUserId: null,
        enrollment: null,
        resetNfcCardData: null,
        supervisionFlow: null,
        massIntroductionFlow: null,
      },
      sendMessage: jest.fn(async (event: { data: { type: string; payload: Record<string, unknown> } }) => {
        sent.push({ type: event.data.type, payload: event.data.payload });
        return true;
      }),
    } as unknown as AuthenticatedWebSocket;
    instance.websockets.sockets.set(id, socket);
    instance.cluster.presence.socketConnected(READER_ID, id);
    await waitFor(async () =>
      (await instance.cluster.presence.holders(READER_ID)).some(
        (holder) => holder.instanceId === instance.cluster.instanceId,
      ),
    );
    return { socket, sent, ofType: (type: AttractapEventType) => sent.filter((message) => message.type === type) };
  }

  const introductionRows = (userId: number) =>
    source
      .getRepository(ResourceIntroduction)
      .count({ where: { receiverUser: { id: userId }, resource: { id: RESOURCE_ID } } });

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine').withExposedPorts(6379).start();
    source = await createTestDataSource();
    await source.runMigrations();
    const repository = source.getRepository(User);
    const saved = await repository.save(
      ['tutor', 'supervisor', 'requester', 'alice', 'bob', 'carol'].map((username) => ({
        username,
        email: `${username}@example.test`,
      })),
    );
    users = Object.fromEntries(saved.map((user) => [user.id, user]));
    // Fixed roles by position: 0 tutor, 1 supervisor (id 2 is announced as the eligible supervisor), …
    (introducer as unknown as { id: number }).id = saved[0].id;
    users[2] = saved[1];
    await source.getRepository(Resource).save({ id: RESOURCE_ID, name: 'Laser', type: ResourceType.Machine });
  }, 120_000);

  afterEach(async () => {
    await Promise.all(instances.splice(0).map((instance) => instance.close()));
    const admin = new Redis(container.getMappedPort(6379), container.getHost());
    await admin.flushall();
    admin.disconnect();
    startedSessions.length = 0;
  });

  afterAll(async () => {
    await closeTestDataSource(source);
    await container?.stop();
  });

  const byName = (username: string) => Object.values(users).find((user) => user.username === username) as User;

  describe('mass introductions', () => {
    it('arms the reader on A from B, joins by QR code and card on either instance, and reports live on both', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const reader = await connectReader(a, 'socket-a');
      const liveOnA = firstValueFrom(
        a.massIntroductionLive.getIntroducerSubject(introducer.id).pipe(
          filter(
            ({ data }) =>
              data.type === MassIntroductionLiveEventType.UPDATED && data.session?.participants.length === 2,
          ),
          take(1),
          timeout(10_000),
        ),
      );

      const session = await b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID, readerId: READER_ID });
      expect(reader.ofType(AttractapEventType.MASS_INTRODUCTION_START)).toHaveLength(1);
      expect(reader.socket.state.massIntroductionFlow).toEqual({ sessionId: session.id });

      // QR redeem on A for a session started on B; GET from A.
      await expect(a.massIntroductions.redeem(session.publicId, session.code, byName('alice'))).resolves.toEqual(
        expect.objectContaining({ alreadyIntroduced: false }),
      );
      // Card tap at the reader on A.
      await a.massIntroductionHandler.handleCardDetected(
        reader.socket,
        { uid: String(byName('bob').id), detectionId: 1 },
        session.id,
      );
      expect(reader.ofType(AttractapEventType.MASS_INTRODUCTION_RESULT).at(-1)?.payload).toEqual(
        expect.objectContaining({ success: true, participantCount: 2 }),
      );
      await liveOnA;
      expect((await a.massIntroductions.get(session.id, introducer.id)).participants).toHaveLength(2);
      expect(await introductionRows(byName('bob').id)).toBe(1);

      // Another introducer cannot probe the session from either instance.
      await expect(a.massIntroductions.get(session.id, byName('carol').id)).rejects.toBeInstanceOf(NotFoundException);

      // DELETE on A ends it everywhere and returns the reader on A to normal.
      await a.massIntroductions.cancel(session.id, introducer.id);
      await waitFor(() => reader.ofType(AttractapEventType.MASS_INTRODUCTION_END).length === 1);
      await expect(b.massIntroductions.get(session.id, introducer.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('introduces each user at most once under concurrent redeems on both instances', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const session = await b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID });
      const carol = byName('carol');
      const results = await Promise.all(
        [a, b, a, b, a, b].map((instance) => instance.massIntroductions.redeem(session.publicId, session.code, carol)),
      );
      expect(new Set(results.map((result) => result.alreadyIntroduced))).toEqual(new Set([false]));
      expect(await introductionRows(carol.id)).toBe(1);
      expect((await a.massIntroductions.get(session.id, introducer.id)).participants).toHaveLength(1);
    });

    it('counts wrong codes across instances', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const session = await a.massIntroductions.start(introducer, { resourceId: RESOURCE_ID });
      const wrong = String((Number(session.code) + 1) % 1_000_000).padStart(6, '0');
      const tries = await Promise.allSettled(
        [a, b, a, b, a, b].map((instance) =>
          instance.massIntroductions.redeem(session.publicId, wrong, byName('alice')),
        ),
      );
      const statuses = tries.map((result) => (result as PromiseRejectedResult).reason.getStatus());
      expect(statuses.filter((status) => status === 400)).toHaveLength(5);
      expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    });

    it('expires exactly once cluster-wide, disarming the reader and telling the introducer on every instance', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const reader = await connectReader(a, 'socket-a');
      const ended: string[] = [];
      for (const instance of [a, b]) {
        instance.massIntroductionLive
          .getIntroducerSubject(introducer.id)
          .subscribe(
            ({ data }) =>
              data.type === MassIntroductionLiveEventType.ENDED && ended.push(`${instance.name}:${data.reason}`),
          );
      }
      const session = await b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID, readerId: READER_ID });
      // Bring the deadline forward instead of waiting 15 minutes.
      await a.cluster.deadlines.schedule('mass-introduction', session.id, Date.now());

      await waitFor(() => ended.length === 2);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(ended.sort()).toEqual(['a:expired', 'b:expired']);
      expect(reader.ofType(AttractapEventType.MASS_INTRODUCTION_END).map((message) => message.payload.reason)).toEqual([
        'expired',
      ]);
      // The reader is free again.
      await b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID, readerId: READER_ID });
    });

    it('marks the session DETACHED when the reader leaves on its instance', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const reader = await connectReader(a, 'socket-a');
      const session = await b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID, readerId: READER_ID });
      a.massIntroductionHandler.cancelForSocket(reader.socket);
      await waitFor(
        async () => (await b.massIntroductions.get(session.id, introducer.id)).reader?.state === 'detached',
      );
      // The claim went with it: another flow may arm the reader.
      await expect(
        b.cards.startEnrollOfNewNfcCard({ readerId: READER_ID, userId: byName('alice').id }),
      ).resolves.toBeUndefined();
    });
  });

  describe('supervision', () => {
    const named = (supervisorUserId: number) => ({ supervisorUserId, notes: 'please' });

    it('resolves the requester on A when the supervisor approves the popup on B', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const supervisor = users[2];
      const requested = firstValueFrom(
        b.supervisionLive.getSupervisorSubject(supervisor.id).pipe(
          filter(({ data }) => data.type === SupervisionLiveEventType.REQUESTED),
          take(1),
          timeout(10_000),
        ),
      );
      const pending = a.supervision.requestSupervisedSession(RESOURCE_ID, byName('requester'), named(supervisor.id));
      const { data } = await requested;
      expect((await b.supervision.listPendingForSupervisor(supervisor.id)).map((request) => request.id)).toEqual([
        data.requestId,
      ]);
      await b.supervision.approve(data.requestId, supervisor);
      await expect(pending).resolves.toEqual(expect.objectContaining({ userId: byName('requester').id }));
      expect(startedSessions).toHaveLength(1);
      expect(await a.supervision.listPendingForSupervisor(supervisor.id)).toEqual([]);
    });

    it('settles once and starts at most one session when approve and reject race on both instances', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const supervisor = users[2];
      const pending = a.supervision.requestSupervisedSession(RESOURCE_ID, byName('requester'), named(supervisor.id));
      pending.catch(() => undefined);
      await waitFor(async () => (await b.supervision.listPendingForSupervisor(supervisor.id)).length === 1);
      const [{ id }] = await b.supervision.listPendingForSupervisor(supervisor.id);

      const decisions = await Promise.allSettled([
        a.supervision.approve(id, supervisor),
        b.supervision.approve(id, supervisor),
        a.supervision.reject(id, supervisor),
        b.supervision.reject(id, supervisor),
      ]);
      expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1);
      expect(startedSessions.length).toBeLessThanOrEqual(1);
      const outcome = await pending.then(
        () => 'approved',
        (error) => (error instanceof ForbiddenException ? 'rejected' : 'other'),
      );
      expect(outcome).toBe(startedSessions.length === 1 ? 'approved' : 'rejected');
    });

    it('arms the reader on A for a requester on B, and a supervisor card at the reader approves it', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const reader = await connectReader(a, 'socket-a');
      const pending = b.supervision.requestSupervisedSession(RESOURCE_ID, byName('requester'), { readerId: READER_ID });
      await waitFor(() => reader.ofType(AttractapEventType.SUPERVISION_START).length === 1);

      await a.supervisionHandler.handleSupervisorCardDetected(
        reader.socket,
        { uid: String(users[2].id), detectionId: 1 },
        RESOURCE_ID,
      );
      await expect(pending).resolves.toEqual(expect.objectContaining({ userId: byName('requester').id }));
      await waitFor(() => reader.ofType(AttractapEventType.SUPERVISION_RESOLVED).length === 1);
      expect(reader.ofType(AttractapEventType.SUPERVISION_RESOLVED)[0].payload).toEqual(
        expect.objectContaining({ success: true }),
      );
      expect(reader.socket.state.supervisionFlow).toBeNull();
      expect(startedSessions).toHaveLength(1);
    });

    it('expires exactly once cluster-wide: 408 for the requester, EXPIRED once per supervisor stream', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const supervisor = users[2];
      const expired: string[] = [];
      for (const instance of [a, b]) {
        instance.supervisionLive
          .getSupervisorSubject(supervisor.id)
          .subscribe(({ data }) => data.type === SupervisionLiveEventType.EXPIRED && expired.push(instance.name));
      }
      const pending = a.supervision.requestSupervisedSession(RESOURCE_ID, byName('requester'), named(supervisor.id));
      pending.catch(() => undefined);
      await waitFor(async () => (await b.supervision.listPendingForSupervisor(supervisor.id)).length === 1);
      const [{ id }] = await b.supervision.listPendingForSupervisor(supervisor.id);
      // Bring the 30 s deadline forward.
      await b.cluster.deadlines.schedule('supervision', id, Date.now());

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
      await waitFor(() => expired.length === 2);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(expired.sort()).toEqual(['a', 'b']);
      await expect(b.supervision.approve(id, supervisor)).rejects.toBeInstanceOf(NotFoundException);
      expect(startedSessions).toHaveLength(0);
    });

    it('keeps one armed reader per requester across instances', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      await connectReader(a, 'socket-a');
      const requester = byName('requester');
      const results = await Promise.allSettled([
        a.supervision.requestSupervisedSession(RESOURCE_ID, requester, { readerId: READER_ID }),
        b.supervision.requestSupervisedSession(RESOURCE_ID, requester, { readerId: READER_ID }),
      ]);
      expect(
        results.filter((result) => result.status === 'rejected' && result.reason instanceof ConflictException).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Valkey unreachable while configured', () => {
    it('answers 503 for shared work and never falls back to per-process state', async () => {
      // Nothing listens there: the client keeps reconnecting.
      const unreachable = new Redis(1, '127.0.0.1', { maxRetriesPerRequest: 0, retryStrategy: () => 200 });
      unreachable.on('error', () => undefined);
      const lonely = await startInstance('lonely', unreachable);
      const status = (error: unknown) => (error as { getStatus?: () => number }).getStatus?.();
      expect(
        status(await lonely.massIntroductions.start(introducer, { resourceId: RESOURCE_ID }).catch((e) => e)),
      ).toBe(503);
      expect(status(await lonely.massIntroductions.redeem('public', '000000', byName('alice')).catch((e) => e))).toBe(
        503,
      );
      expect(status(await lonely.supervision.listPendingForSupervisor(2).catch((e) => e))).toBe(503);
      expect(
        status(
          await lonely.cards
            .startEnrollOfNewNfcCard({ readerId: READER_ID, userId: byName('alice').id })
            .catch((e) => e),
        ),
      ).toBe(503);
    });
  });

  describe('reader screen claims', () => {
    it('lets one flow arm the reader at a time, whichever instance starts it', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      await connectReader(a, 'socket-a');
      const results = await Promise.allSettled([
        b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID, readerId: READER_ID }),
        a.cards.startEnrollOfNewNfcCard({ readerId: READER_ID, userId: byName('alice').id }),
        b.cards.startEnrollOfNewNfcCard({ readerId: READER_ID, userId: byName('bob').id }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      for (const result of results) {
        if (result.status === 'rejected')
          expect([result.reason.constructor.name, result.reason.message]).toEqual([
            'ConflictException',
            expect.any(String),
          ]);
      }
    });

    it('routes a card enrollment started on B to the reader on A', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      const reader = await connectReader(a, 'socket-a');
      await b.cards.startEnrollOfNewNfcCard({ readerId: READER_ID, userId: byName('alice').id });
      expect(reader.ofType(AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO)).toHaveLength(1);
      expect(reader.socket.state.enrollment?.userId).toBe(byName('alice').id);
      await expect(
        b.cards.startEnrollOfNewNfcCard({ readerId: 999, userId: byName('alice').id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('frees the reader and its presence when the instance holding it crashes', async () => {
      const a = await startInstance('a');
      const b = await startInstance('b');
      await connectReader(a, 'socket-a');
      const session = await b.massIntroductions.start(introducer, { resourceId: RESOURCE_ID, readerId: READER_ID });
      a.cluster.halt();
      const admin = new Redis(container.getMappedPort(6379), container.getHost());
      await admin.del(`attraccess:cluster:alive:${a.cluster.instanceId}`);
      admin.disconnect();

      await waitFor(async () => (await b.cluster.presence.holders(READER_ID)).length === 0);
      await waitFor(async () => (await b.cluster.claims.owner(READER_ID)) === null);
      await waitFor(
        async () => (await b.massIntroductions.get(session.id, introducer.id)).reader?.state === 'detached',
      );
    });
  });
});
