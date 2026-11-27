import { ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ClusterInstanceGoneError, ClusterRequestTimeoutError } from '../../cluster/cluster-errors';
import { EnrollmentRateLimitedException } from '../../device-enrollment/enrollment-rate-limited.exception';
import { VALKEY_UNAVAILABLE_MESSAGE } from '../../valkey/valkey-unavailable';
import { ClusterPairingService } from './cluster-pairing.service';
import type { PairingView } from './pairing-model';

const actor = { userId: 7, authenticationMethod: 'session' as const };

const view = (id: string, createdAt = '2026-01-01T00:00:00.000Z'): PairingView =>
  ({
    id,
    state: 'waiting',
    kind: 'touch',
    createdAt,
    expiresAt: '2026-01-01T00:10:00.000Z',
  }) as unknown as PairingView;

/** Instance `a` (this one) and `b`; each answer is what the named instance's handler gives back. */
function setup() {
  const answers: Record<string, Record<string, (payload: unknown) => unknown>> = { a: {}, b: {} };
  const handlers = new Map<string, (payload: unknown) => unknown>();
  const holders = new Map<string, string>();
  const valkey = {
    status: 'ready',
    get: jest.fn(async (key: string) => holders.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => void holders.set(key, value)),
  };
  let live = ['a', 'b'];
  const cluster = {
    enabled: true,
    instanceId: 'a',
    valkey,
    bus: {
      handle: (type: string, handler: (payload: unknown) => unknown) => handlers.set(type, handler),
      request: jest.fn(async (instanceId: string, type: string, payload: unknown) => {
        const answer = answers[instanceId]?.[type];
        if (!answer) throw new ClusterInstanceGoneError(instanceId);
        return answer(payload);
      }),
    },
    instances: {
      live: jest.fn(async () => live),
      isAlive: jest.fn(async (id: string) => live.includes(id)),
    },
  };
  const attempt = { wrong: jest.fn(async () => undefined), notWrong: jest.fn(async () => undefined) };
  const limits = {
    assertApproverAllowed: jest.fn(async () => undefined),
    beginApproverAttempt: jest.fn(async () => attempt),
    attempt,
  };
  let created: (id: string) => void = () => undefined;
  const pairing = {
    onRequestCreated: (listener: (id: string) => void) => (created = listener),
    list: jest.fn(() => []),
    matchCode: jest.fn(() => []),
    get: jest.fn(),
    approve: jest.fn(),
    cancel: jest.fn(),
  };
  const service = new ClusterPairingService(pairing as never, limits as never, cluster as never);
  return {
    service,
    answers,
    handlers,
    holders,
    valkey,
    cluster,
    limits,
    pairing,
    created: (id: string) => created(id),
    setLive: (ids: string[]) => (live = ids),
  };
}

describe('ClusterPairingService', () => {
  it('passes straight through to the local service without Valkey', async () => {
    const pairing = {
      list: jest.fn(() => [view('p1')]),
      get: jest.fn(() => view('p1')),
      resolve: jest.fn(async () => view('p1')),
      approve: jest.fn(async () => view('p1')),
      cancel: jest.fn(async () => undefined),
      onRequestCreated: jest.fn(),
    };
    const service = new ClusterPairingService(pairing as never, {} as never);
    await service.list();
    await service.get('p1');
    await service.resolve('ABC', actor);
    await service.approve('p1', { code: 'ABC', mode: 'new' }, actor);
    await service.cancel('p1', actor);
    expect(pairing.resolve).toHaveBeenCalledWith('ABC', actor);
    expect(pairing.approve).toHaveBeenCalledWith('p1', { code: 'ABC', mode: 'new' }, actor);
    expect(pairing.cancel).toHaveBeenCalledWith('p1', actor);
    expect(pairing.onRequestCreated).not.toHaveBeenCalled();
  });

  it('answers the cluster messages from the local service and records where new requests are held', async () => {
    const { handlers, pairing, created, valkey } = setup();
    expect([...handlers.keys()].sort()).toEqual([
      'pairing.approve',
      'pairing.cancel',
      'pairing.get',
      'pairing.list',
      'pairing.match',
    ]);
    pairing.approve.mockResolvedValue(view('p1'));
    await handlers.get('pairing.approve')?.({ id: 'p1', input: { code: 'X' }, actor, matchesElsewhere: 2 });
    expect(pairing.approve).toHaveBeenCalledWith('p1', { code: 'X' }, actor, 2);

    created('p9');
    await new Promise((resolve) => setImmediate(resolve));
    expect(valkey.set).toHaveBeenCalledWith('attraccess:pairing:request:p9', 'a', 'PX', expect.any(Number));
  });

  it('lists the waiting readers of every instance, oldest first, skipping an instance that does not answer', async () => {
    const { service, answers } = setup();
    answers.a['pairing.list'] = () => [view('late', '2026-01-01T00:05:00.000Z')];
    answers.b['pairing.list'] = () => {
      throw new ClusterRequestTimeoutError('pairing.list', 'b');
    };
    expect((await service.list()).map((p) => p.id)).toEqual(['late']);
    answers.b['pairing.list'] = () => [view('early')];
    const listed = await service.list();
    expect(listed.map((p) => p.id)).toEqual(['early', 'late']);
    expect(listed[0].createdAt).toBeInstanceOf(Date);
  });

  describe('resolve', () => {
    it('finds the reader on another instance', async () => {
      const { service, answers } = setup();
      answers.a['pairing.match'] = () => [];
      answers.b['pairing.match'] = () => [view('p2')];
      expect((await service.resolve('K7P3XQ', actor)).id).toBe('p2');
    });

    it('counts a code no instance shows as wrong', async () => {
      const { service, answers, limits } = setup();
      answers.a['pairing.match'] = () => [];
      answers.b['pairing.match'] = () => [];
      await expect(service.resolve('K7P3XQ', actor)).rejects.toThrow('PairingCodeNotFound');
      expect(limits.beginApproverAttempt).toHaveBeenCalledWith(7);
      expect(limits.attempt.wrong).toHaveBeenCalled();
    });

    it('asks to wait when readers on two instances show the code, without counting it', async () => {
      const { service, answers, limits } = setup();
      answers.a['pairing.match'] = () => [view('p1')];
      answers.b['pairing.match'] = () => [view('p2')];
      await expect(service.resolve('K7P3XQ', actor)).rejects.toBeInstanceOf(ConflictException);
      expect(limits.attempt.wrong).not.toHaveBeenCalled();
    });

    it('answers 503 and counts nothing when an instance stays silent', async () => {
      const { service, answers, limits } = setup();
      answers.a['pairing.match'] = () => [];
      answers.b['pairing.match'] = () => {
        throw new ClusterRequestTimeoutError('pairing.match', 'b');
      };
      await expect(service.resolve('K7P3XQ', actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(limits.attempt.wrong).not.toHaveBeenCalled();
    });

    it('ignores an instance that went away', async () => {
      const { service, answers } = setup();
      answers.a['pairing.match'] = () => [view('p1')];
      expect((await service.resolve('K7P3XQ', actor)).id).toBe('p1');
    });

    it('stops a throttled approver before asking anyone', async () => {
      const { service, limits, cluster } = setup();
      limits.beginApproverAttempt.mockRejectedValue(new EnrollmentRateLimitedException(30));
      await expect(service.resolve('K7P3XQ', actor)).rejects.toBeInstanceOf(EnrollmentRateLimitedException);
      expect(cluster.bus.request).not.toHaveBeenCalled();
    });

    it('answers 503 when Valkey is unreachable', async () => {
      const { service, limits } = setup();
      limits.beginApproverAttempt.mockRejectedValue(new Error('Connection is closed.'));
      await expect(service.resolve('K7P3XQ', actor)).rejects.toThrow(VALKEY_UNAVAILABLE_MESSAGE);
    });
  });

  describe('one request', () => {
    it('routes the approval to the holder with what the other instances show', async () => {
      const { service, answers, holders } = setup();
      holders.set('attraccess:pairing:request:p2', 'b');
      answers.a['pairing.match'] = () => [view('p1')];
      answers.b['pairing.approve'] = (payload) => ({ ...view('p2'), payload });
      const approved = (await service.approve('p2', { code: 'K7P3XQ', mode: 'new' }, actor)) as unknown as {
        payload: unknown;
      };
      expect(approved.payload).toEqual({
        id: 'p2',
        input: { code: 'K7P3XQ', mode: 'new' },
        actor,
        matchesElsewhere: 1,
      });
    });

    it('asks no one else for an LED pattern approval', async () => {
      const { service, answers, holders, cluster } = setup();
      holders.set('attraccess:pairing:request:p2', 'b');
      answers.b['pairing.approve'] = () => view('p2');
      await service.approve('p2', { round: 3, mode: 'new' }, actor);
      expect(cluster.bus.request).toHaveBeenCalledTimes(1);
    });

    it('turns a remote 429 back into the enrollment exception', async () => {
      const { service, answers, holders } = setup();
      holders.set('attraccess:pairing:request:p2', 'b');
      answers.b['pairing.approve'] = () => {
        throw new HttpException({ statusCode: 429, message: 'EnrollmentRateLimited', retryAfterSeconds: 12 }, 429);
      };
      const error = await service.approve('p2', { round: 1, mode: 'new' }, actor).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EnrollmentRateLimitedException);
      expect((error as EnrollmentRateLimitedException).retryAfterSeconds).toBe(12);
    });

    it('reports a request whose holder is gone as not found', async () => {
      const { service, holders, setLive } = setup();
      holders.set('attraccess:pairing:request:p2', 'b');
      setLive(['a']);
      await expect(service.get('p2')).rejects.toThrow('Pairing not found');
      await expect(service.cancel('p2', actor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('finds a request without a holder record by asking every instance', async () => {
      const { service, answers } = setup();
      answers.a['pairing.get'] = () => {
        throw new NotFoundException('Pairing not found');
      };
      answers.b['pairing.get'] = () => view('p2');
      answers.b['pairing.cancel'] = () => undefined;
      expect((await service.get('p2')).id).toBe('p2');
      await service.cancel('p2', actor);
    });

    it('answers 404 for an id no instance knows', async () => {
      const { service, answers } = setup();
      for (const name of ['a', 'b']) {
        answers[name]['pairing.get'] = () => {
          throw new NotFoundException('Pairing not found');
        };
      }
      await expect(service.get('nope')).rejects.toThrow('Pairing not found');
    });

    it('answers 503 when the holder stays silent', async () => {
      const { service, answers, holders } = setup();
      holders.set('attraccess:pairing:request:p2', 'b');
      answers.b['pairing.get'] = () => {
        throw new ClusterRequestTimeoutError('pairing.get', 'b');
      };
      await expect(service.get('p2')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
