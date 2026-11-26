import { ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { ValkeySupervisionStore, type StoredSupervisionRequest } from '../supervision/supervision-store';
import type { StoredMassIntroduction } from './mass-introduction-store';
import { ValkeyMassIntroductionStore } from './valkey-mass-introduction-store';
import {
  MassIntroductionMethod,
  MassIntroductionReaderState,
  MassIntroductionTargetType,
} from './dtos/massIntroductionSession.dto';

jest.setTimeout(90_000);

const session = (id: string, overrides: Partial<StoredMassIntroduction> = {}): StoredMassIntroduction => ({
  id,
  publicId: `public-${id}`,
  codeSecret: 'secret',
  target: { type: MassIntroductionTargetType.RESOURCE, id: 5, name: 'Laser' },
  introducer: {
    id: 1,
    username: 'tutor',
    displayName: 'tutor',
    authenticationMethod: 'session',
    apiTokenId: null,
    viaPermission: false,
  },
  reader: null,
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  ...overrides,
});

const participant = (userId: number) => ({
  userId,
  username: `user-${userId}`,
  firstName: null,
  lastName: null,
  displayName: `user-${userId}`,
  method: MassIntroductionMethod.QR,
  alreadyIntroduced: false,
  joinedAt: new Date(),
});

/** The Lua scripts and atomic steps of the shared stores (ATT-1163), with two clients standing in for two instances. */
describe('shared mass-introduction and supervision stores against Valkey', () => {
  let container: StartedTestContainer;
  let clientA: Redis;
  let clientB: Redis;
  let a: ValkeyMassIntroductionStore;
  let b: ValkeyMassIntroductionStore;

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine').withExposedPorts(6379).start();
    clientA = new Redis(container.getMappedPort(6379), container.getHost());
    clientB = new Redis(container.getMappedPort(6379), container.getHost());
    a = new ValkeyMassIntroductionStore(clientA, 5);
    b = new ValkeyMassIntroductionStore(clientB, 5);
  });

  afterEach(async () => {
    await clientA.flushall();
  });

  afterAll(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await container?.stop();
  });

  it('finds a session by id, public id and introducer on any instance, and ends it exactly once', async () => {
    await a.create(session('s1'));
    expect((await b.get('s1'))?.publicId).toBe('public-s1');
    expect((await b.getByPublicId('public-s1'))?.id).toBe('s1');
    expect(await b.findForIntroducer(1, { type: MassIntroductionTargetType.RESOURCE, id: 5 })).toHaveLength(1);
    expect(await b.findForIntroducer(1, { type: MassIntroductionTargetType.GROUP, id: 5 })).toHaveLength(0);

    const removals = await Promise.all([a.remove('s1'), b.remove('s1'), a.remove('s1')]);
    expect(removals.filter(Boolean)).toHaveLength(1);
    expect(await b.get('s1')).toBeNull();
    expect(await b.getByPublicId('public-s1')).toBeNull();
    expect(await clientA.smembers('attraccess:mass-introduction:introducer:1')).toEqual([]);
  });

  it('attaches and detaches the reader atomically, once', async () => {
    await a.create(session('s2'));
    expect(await b.attachReader('s2', { id: 3, name: 'Entrance', state: MassIntroductionReaderState.ACTIVE })).toBe(
      true,
    );
    expect(await a.detachReader('s2', 4)).toBeNull();
    const detached = await Promise.all([a.detachReader('s2', 3), b.detachReader('s2', 3)]);
    expect(detached.filter(Boolean)).toHaveLength(1);
    expect((await a.get('s2'))?.reader?.state).toBe(MassIntroductionReaderState.DETACHED);
    expect(await a.attachReader('gone', { id: 3, name: 'x', state: MassIntroductionReaderState.ACTIVE })).toBe(false);
  });

  it('grants a user at most once per session under concurrent joins on two instances', async () => {
    await a.create(session('s3'));
    let grants = 0;
    const grant = async () => {
      grants += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return participant(7);
    };
    const results = await Promise.all([
      a.joinOnce('s3', 7, grant),
      b.joinOnce('s3', 7, grant),
      a.joinOnce('s3', 7, grant),
      b.joinOnce('s3', 7, grant),
    ]);
    expect(grants).toBe(1);
    expect(results.filter((result) => result.added)).toHaveLength(1);
    expect(new Set(results.map((result) => result.participant.userId))).toEqual(new Set([7]));
    expect(await b.participants('s3')).toHaveLength(1);
  });

  it('lets a user retry after a failed grant', async () => {
    await a.create(session('s4'));
    await expect(
      a.joinOnce('s4', 8, async () => {
        throw new Error('database down');
      }),
    ).rejects.toThrow('database down');
    await expect(b.joinOnce('s4', 8, async () => participant(8))).resolves.toEqual(
      expect.objectContaining({ added: true }),
    );
  });

  it('grants nothing when the winner recorded the user between the look-up and the claim', async () => {
    await a.create(session('s6'));
    await a.joinOnce('s6', 7, async () => participant(7));
    // Instance B looked the participant up just before A recorded it, then found the join claim free.
    let staleLookUps = 1;
    const lagging = new Proxy(clientB, {
      get(target, property) {
        if (property === 'hget') {
          return (...args: Parameters<Redis['hget']>) =>
            staleLookUps-- > 0 ? Promise.resolve(null) : target.hget(...args);
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const grant = jest.fn(async () => participant(7));

    const result = await new ValkeyMassIntroductionStore(lagging, 5).joinOnce('s6', 7, grant);

    expect(grant).not.toHaveBeenCalled();
    expect(result).toEqual({ participant: expect.objectContaining({ userId: 7 }), added: false });
    expect(await clientA.exists('attraccess:mass-introduction:join:s6:7')).toBe(0);
  });

  it('answers 503 when another join of the same user holds the claim too long', async () => {
    await a.create(session('s7'));
    await clientA.set('attraccess:mass-introduction:join:s7:7', 'held-elsewhere', 'PX', 30_000);
    const realNow = Date.now.bind(Date);
    let calls = 0;
    // The first look sets the deadline; every later one is past it.
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + (calls++ === 0 ? 0 : 60_000));
    const grant = jest.fn(async () => participant(7));

    try {
      await expect(b.joinOnce('s7', 7, grant)).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      jest.restoreAllMocks();
    }
    expect(grant).not.toHaveBeenCalled();
  });

  it('counts wrong codes across instances: five per minute, cleared by a right one', async () => {
    await a.create(session('s5'));
    const counted = await Promise.all(
      Array.from({ length: 8 }, (_, index) => (index % 2 ? a : b).countWrongCode('s5', 9)),
    );
    expect(counted.filter(Boolean)).toHaveLength(5);
    expect(await b.wrongCodesExhausted('s5', 9)).toBe(true);
    expect(await clientA.pttl('attraccess:mass-introduction:wrong:s5:9')).toBeGreaterThan(50_000);
    await a.clearWrongCodes('s5', 9);
    expect(await b.wrongCodesExhausted('s5', 9)).toBe(false);
  });

  it('settles a supervision request at most once across instances', async () => {
    const storeA = new ValkeySupervisionStore(clientA);
    const storeB = new ValkeySupervisionStore(clientB);
    const request: StoredSupervisionRequest = {
      id: 'r1',
      resourceId: 5,
      requester: { id: 1, username: 'requester' },
      supervisorUserId: null,
      eligibleSupervisorIds: [2, 3],
      dto: {},
      canAskDuration: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      originInstance: 'a|1',
    };
    await storeA.create(request);
    expect((await storeB.listPending()).map((pending) => pending.id)).toEqual(['r1']);
    const claims = await Promise.all([storeA.claim('r1'), storeB.claim('r1'), storeA.claim('r1'), storeB.claim('r1')]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await storeB.listPending()).toEqual([]);

    const reservations = await Promise.all([
      storeA.reserveReaderRequest(1, 'x', 5_000),
      storeB.reserveReaderRequest(1, 'y', 5_000),
    ]);
    expect(reservations.filter(Boolean)).toHaveLength(1);
    const winner = reservations[0] ? 'x' : 'y';
    await storeB.releaseReaderRequest(1, winner === 'x' ? 'y' : 'x');
    expect(await storeA.reserveReaderRequest(1, 'z', 5_000)).toBe(false);
    await storeB.releaseReaderRequest(1, winner);
    expect(await storeA.reserveReaderRequest(1, 'z', 5_000)).toBe(true);

    await storeA.recordOutcome('r1', {
      kind: 'failed',
      error: { kind: 'error', name: 'Error', message: 'x' },
      notifyReader: true,
    });
    expect(await storeB.outcome('r1')).toEqual(expect.objectContaining({ kind: 'failed' }));
  });
});
