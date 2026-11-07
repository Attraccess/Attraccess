import type { StartBlockedQuery } from '@attraccess/plugins-backend-sdk';
import { ReaderUiHooksService, type StartBlockedRun } from './reader-ui-hooks.service';

const blocked = { reason: { code: 'RESERVED', title: 'Reserved', body: 'Reserved until 16:00.' } };
const run: StartBlockedRun = { resourceId: 3, userId: 7, language: 'en' };

function setup(queries: Record<string, StartBlockedQuery>, preStart: Record<string, () => unknown> = {}) {
  const registry = {
    startBlockedQueries: () => Object.entries(queries).map(([plugin, query]) => ({ plugin, query })),
    preStartHooks: () => Object.entries(preStart).map(([plugin, hook]) => ({ plugin, hook })),
    sessionEndHooks: () => [],
  };
  const alerts = {
    onCleared: jest.fn(),
    raise: jest.fn().mockResolvedValue({}),
    clearWhere: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const service = new ReaderUiHooksService(
    registry as never,
    { failurePolicy: jest.fn().mockResolvedValue('fail-closed') } as never,
    alerts as never,
    audit as never,
    { get: () => ({}) } as never,
  );
  return { service, audit };
}

describe('ReaderUiHooksService.queryStartBlocked', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is empty without a plugin query, and when every query says nothing blocks', async () => {
    await expect(setup({}).service.queryStartBlocked(run)).resolves.toBeNull();
    await expect(setup({ a: () => null, b: async () => null }).service.queryStartBlocked(run)).resolves.toBeNull();
  });

  it('returns the first plugin that reports a block, with the reason and an ISO until', async () => {
    const until = new Date('2026-06-01T14:00:00Z');
    const { service } = setup({ a: () => null, b: () => ({ ...blocked, until }), c: () => blocked });
    await expect(service.queryStartBlocked(run)).resolves.toEqual({
      plugin: 'b',
      reason: blocked.reason,
      until: '2026-06-01T14:00:00.000Z',
    });
  });

  it('hands the plugin the user, the resource, the language and the time', async () => {
    const query = jest.fn().mockResolvedValue(null);
    await setup({ a: query }).service.queryStartBlocked({ ...run, language: 'de' });
    expect(query).toHaveBeenCalledWith({ resourceId: 3, userId: 7, language: 'de', now: expect.any(Date) });
  });

  it('treats a failing, hanging or invalid query as not blocked and never throws', async () => {
    const { service } = setup({
      throws: () => {
        throw new Error('boom');
      },
      hangs: () => new Promise(() => undefined),
      invalidReason: () => ({ reason: { code: 'bad code!', title: 'x', body: 'y' } }),
      invalidUntil: () => ({ ...blocked, until: new Date('nope') }),
      notAnObject: () => 'yes' as never,
    });
    const pending = service.queryStartBlocked(run);
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeNull();
  });

  it('refuses reasons that use a host-reserved code or are too long', async () => {
    const { service } = setup({
      a: () => ({ reason: { code: 'HOOK_UNAVAILABLE', title: 'x', body: 'y' } }),
      b: () => ({ reason: { code: 'RESERVED', title: 'x'.repeat(500), body: 'y' } }),
    });
    await expect(service.queryStartBlocked(run)).resolves.toBeNull();
  });

  it('does not count against, or open, the pre-start breaker and writes no audit entry', async () => {
    const failing = jest.fn(() => {
      throw new Error('boom');
    });
    const preStart = jest.fn().mockReturnValue({ decision: 'allow' });
    const { service, audit } = setup({ a: failing }, { a: preStart });
    for (let i = 0; i < 20; i += 1) await service.queryStartBlocked(run);
    await expect(
      service.runPreStart({ ...run, action: 'start', origin: 'web', satisfied: new Map() }),
    ).resolves.toEqual({ decision: 'allow' });
    expect(preStart).toHaveBeenCalled();
    expect(audit.recordAttractap).toHaveBeenCalledTimes(1); // the pre-start decision only
  });
});
