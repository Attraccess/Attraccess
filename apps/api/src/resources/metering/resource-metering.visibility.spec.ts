import { ResourceMeteringController } from './resource-metering.controller';

/** The running session's consumption follows the activity visibility rule (ATT-1149). */
describe('ResourceMeteringController session visibility', () => {
  const meter = (session: { usageId: number } | null, counterValue: string | null = '10') => ({
    id: 1,
    name: 'Power',
    creditsPerUnit: 2,
    lifetimeValue: '10',
    counterValue,
    latestObservedAt: counterValue === null ? null : new Date('2026-10-30T10:00:00Z'),
    session,
  });
  const running = { sessionId: 's1', usageId: 5, latestValue: '1.5' };
  const req = { user: { id: 10, effectivePermissions: new Set(['resources.read']) } } as never;

  const controllerWith = (view: { full: boolean; ownUsageId: number | null }, session: object | null = running) => {
    const metering = {
      listMeters: jest.fn(async () => [meter(session as never)]),
      getLive: jest.fn(async () => ({ meters: [meter(session as never)] })),
    };
    const visibility = { activeSessionView: jest.fn(async () => view) };
    return new ResourceMeteringController(metering as never, visibility as never);
  };

  it('hides the running session and the live counter from viewers without full access', async () => {
    const controller = controllerWith({ full: false, ownUsageId: null });
    expect(await controller.list(1, req)).toEqual([meter(null, null)]);
    expect(await controller.getLive(1, req)).toEqual({ meters: [meter(null, null)] });
  });

  it('hides the counter even while nothing is running, so its presence does not give the machine away', async () => {
    const controller = controllerWith({ full: false, ownUsageId: null }, null);
    expect(await controller.list(1, req)).toEqual([meter(null, null)]);
  });

  it('shows everything to viewers with full access', async () => {
    const controller = controllerWith({ full: true, ownUsageId: null });
    expect(await controller.list(1, req)).toEqual([meter(running)]);
    expect(await controller.getLive(1, req)).toEqual({ meters: [meter(running)] });
  });

  it("shows the owner their own session's consumption, but not a leftover from someone else's usage", async () => {
    expect(await controllerWith({ full: false, ownUsageId: 5 }).list(1, req)).toEqual([meter(running)]);
    expect(await controllerWith({ full: false, ownUsageId: 6 }).list(1, req)).toEqual([meter(null)]);
  });
});
