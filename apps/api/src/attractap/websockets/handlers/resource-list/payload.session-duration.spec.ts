import { processOffsetMinutes } from '../../reader-time-zone';
import { registerResourceListServiceFixture } from './service.test-fixture';

/** The duration settings and the automatic end of running sessions as the reader receives them (ATT-43). */
describe('resource list payload: session duration', () => {
  const fixture = registerResourceListServiceFixture();

  const now = new Date('2026-06-04T12:00:00.000Z');
  const startTime = new Date('2026-06-04T11:00:00.000Z');
  const user = { username: 'active-user', firstName: 'Ada', lastName: 'Active' };
  const minutes = (n: number) => n * 60_000;

  beforeEach(() => {
    jest.setSystemTime(now);
  });

  function machine(overrides: Record<string, unknown> = {}) {
    return {
      id: 10,
      name: 'Laser',
      type: 'machine',
      requireSessionDurationEstimate: false,
      maxSessionDurationMinutes: null,
      ...overrides,
    };
  }

  async function listedResource(resource: Record<string, unknown>, session?: Record<string, unknown>) {
    fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture({ resources: [resource] }));
    fixture.resourceUsageService.getActiveSessions.mockResolvedValue(
      new Map([[10, session ? [{ id: 99, userId: 5, user, startTime, ...session }] : []]]),
    );
    const socket = fixture.createMockSocket();
    await fixture.service.sendResourceListToSocket(socket);
    return socket.sendMessage.mock.calls[0][0].data.payload.resources[0];
  }

  it('sends a machine its duration settings', async () => {
    const resource = await listedResource(
      machine({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 240 }),
    );

    expect(resource).toMatchObject({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 240 });
  });

  it('never asks a door for an estimate nor sends it a maximum', async () => {
    const resource = await listedResource(
      machine({ type: 'door', requireSessionDurationEstimate: true, maxSessionDurationMinutes: 240 }),
      { autoEndAt: null, maxAutoEndAt: null },
    );

    expect(resource.requireSessionDurationEstimate).toBe(false);
    expect(resource.maxSessionDurationMinutes).toBeNull();
  });

  it('lets a max-only session be extended no further than its deadline', async () => {
    const deadline = new Date(startTime.getTime() + minutes(120));
    const resource = await listedResource(machine({ maxSessionDurationMinutes: 120 }), {
      autoEndAt: deadline,
      maxAutoEndAt: deadline,
    });

    const expected = {
      autoEndAt: deadline.toISOString(),
      autoEndUtcOffsetMinutes: processOffsetMinutes(deadline),
      autoEndInSeconds: 3600,
      hasMaxSessionTime: true,
      extendLimitInSeconds: 3600,
    };
    expect(resource.activeUsageSession).toMatchObject(expected);
    expect(resource.activeUsageSessions[0]).toMatchObject(expected);
  });

  it('caps an estimate-only session at 30 days after its start', async () => {
    const deadline = new Date(startTime.getTime() + minutes(90));
    const resource = await listedResource(machine({ requireSessionDurationEstimate: true }), {
      autoEndAt: deadline,
      maxAutoEndAt: null,
    });

    const thirtyDaysAfterStart = startTime.getTime() + 30 * 24 * minutes(60);
    expect(resource.activeUsageSession).toMatchObject({
      autoEndAt: deadline.toISOString(),
      autoEndInSeconds: 30 * 60,
      hasMaxSessionTime: false,
      extendLimitInSeconds: (thirtyDaysAfterStart - now.getTime()) / 1000,
    });
  });

  it('counts an overdue deadline as zero seconds, not negative', async () => {
    const deadline = new Date(now.getTime() - minutes(1));
    const resource = await listedResource(machine({ maxSessionDurationMinutes: 59 }), {
      autoEndAt: deadline,
      maxAutoEndAt: deadline,
    });

    expect(resource.activeUsageSession).toMatchObject({ autoEndInSeconds: 0, extendLimitInSeconds: 0 });
  });

  it('sends no automatic-end fields for a session without a deadline', async () => {
    const resource = await listedResource(machine(), { autoEndAt: null, maxAutoEndAt: null });

    for (const field of [
      'autoEndAt',
      'autoEndUtcOffsetMinutes',
      'autoEndInSeconds',
      'hasMaxSessionTime',
      'extendLimitInSeconds',
    ]) {
      expect(resource.activeUsageSession).not.toHaveProperty(field);
    }
  });

  it("puts the automatic end on the card holder's own session", async () => {
    const deadline = new Date(startTime.getTime() + minutes(120));
    fixture.attractapService.findReaderById.mockResolvedValue(
      fixture.createReaderFixture({ resources: [machine({ maxSessionDurationMinutes: 120 })] }),
    );
    fixture.resourceUsageService.getActiveSessions.mockResolvedValue(
      new Map([[10, [{ id: 99, userId: 1, user, startTime, autoEndAt: deadline, maxAutoEndAt: deadline }]]]),
    );
    const socket = fixture.createMockSocket({ state: { verifiedUserId: 1 } });

    await fixture.service.sendResourceListToSocket(socket);

    const resource = socket.sendMessage.mock.calls[0][0].data.payload.resources[0];
    expect(resource.ownUsageSession).toMatchObject({ autoEndInSeconds: 3600, hasMaxSessionTime: true });
  });
});
