import { randomUUID } from 'node:crypto';
import type { CommandOutcomePayload, DeviceStatePayload } from '@attraccess/matter-contract';
import { MatterCommand, MatterEndpoint, MatterEndpointState } from './entities';
import { MAX_COMMAND_ROWS } from './commands';
import { ADMIN, createHarness, inventory, node, type Harness } from '../testing/devices-harness.test-utils';

const T0 = Date.parse('2026-10-29T10:00:00.000Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();

describe('Matter endpoint state', () => {
  let h: Harness;
  let endpointRef: string;
  beforeEach(async () => {
    h = await createHarness();
    await h.reconcile(inventory('1', [node('5')]));
    endpointRef = (await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ endpointId: 1 })).id;
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  const report = (value: unknown, ms: number, extra: Partial<DeviceStatePayload> = {}): DeviceStatePayload => ({
    nodeId: '5',
    endpointId: 1,
    clusterId: 0x0006,
    attributeId: 0,
    value: value as DeviceStatePayload['value'],
    observedAt: at(ms),
    source: 'subscription_report',
    ...extra,
  });
  const outcome = (
    requestId: string,
    kind: CommandOutcomePayload['outcome'],
    extra: Partial<CommandOutcomePayload> = {},
  ) =>
    ({
      requestId,
      outcome: kind,
      acceptedAt: kind === 'requested' ? null : at(2_000),
      reportedAt: kind === 'reported' ? at(3_000) : null,
      nodeId: '5',
      endpointId: 1,
      ...extra,
    }) as CommandOutcomePayload;
  const request = (value: unknown, ms: number, requestId = randomUUID()) =>
    h.state.recordRequest(
      {
        endpointRef,
        stateKey: 'onOff.onOff',
        clusterId: 6,
        commandId: 1,
        value,
        requestedBy: 7,
        requestId,
        correlationId: 'c-1',
      },
      at(ms),
    );
  const entry = async () => (await h.state.read(endpointRef, T0 + 5_000))[0];

  it('shows an accepted command as accepted, never as confirmed', async () => {
    const requestId = randomUUID();
    await h.state.ingestReport(report(false, 0), at(0));
    await request(true, 1_000, requestId);
    expect(await entry()).toMatchObject({
      requested: { value: true, requestedBy: 7, requestId, correlationId: 'c-1' },
      command: { state: 'requested' },
      confirmed: false,
    });
    await h.state.ingestOutcome(outcome(requestId, 'accepted'), at(2_100));
    expect(await entry()).toMatchObject({
      command: { state: 'accepted', acceptedAt: at(2_000) },
      confirmed: false,
      uncertainActuation: false,
      reported: { value: false },
    });
  });

  it('confirms only when a report equal to the requested value arrives after the request', async () => {
    const requestId = randomUUID();
    await h.state.ingestReport(report(false, 0), at(0));
    await request(true, 1_000, requestId);
    await h.state.ingestOutcome(outcome(requestId, 'accepted'), at(2_100));
    await h.state.ingestReport(report(true, 4_000), at(4_100));
    expect(await entry()).toMatchObject({
      confirmed: true,
      command: { state: 'reported', reportedAt: at(4_000) },
      reported: {
        value: true,
        observedAt: at(4_000),
        receivedAt: at(4_100),
        source: 'subscription_report',
        quality: 'good',
      },
      externalChange: null,
    });
  });

  it('does not confirm a request whose value already matched an older report', async () => {
    await h.state.ingestReport(report(true, 0), at(0));
    await request(true, 1_000);
    expect((await entry()).confirmed).toBe(false);
  });

  it('turns a timeout into uncertain actuation, without a retry, until a matching report or a new request', async () => {
    const requestId = randomUUID();
    await request(true, 1_000, requestId);
    await h.state.recordTimeout(requestId, at(3_000));
    expect(await entry()).toMatchObject({
      command: { state: 'uncertain' },
      uncertainActuation: true,
      confirmed: false,
    });
    expect(h.sidecar.requests).toEqual(['inventory.list']);
    // A late "accepted" does not take it back from uncertain.
    await h.state.ingestOutcome(outcome(requestId, 'accepted'), at(3_100));
    expect((await entry()).uncertainActuation).toBe(true);
    await h.state.ingestReport(report(true, 4_000), at(4_000));
    expect(await entry()).toMatchObject({ command: { state: 'reported' }, uncertainActuation: false, confirmed: true });

    const second = randomUUID();
    await request(false, 5_000, second);
    await h.state.recordTimeout(second, at(6_000));
    expect((await entry()).uncertainActuation).toBe(true);
    await request(true, 7_000);
    expect(await entry()).toMatchObject({ uncertainActuation: false, command: { state: 'requested' } });
  });

  it('records a failed command with its failure code', async () => {
    const requestId = randomUUID();
    await request(true, 1_000, requestId);
    await h.state.ingestOutcome(outcome(requestId, 'failed', { failureCode: 'busy', acceptedAt: null }), at(2_000));
    expect(await entry()).toMatchObject({ command: { state: 'failed' }, confirmed: false });
    expect((await h.dataSource.getRepository(MatterCommand).findOneByOrFail({ requestId })).failureCode).toBe('busy');
  });

  it('does not turn a failed command into a confirmed one when an equal report arrives later', async () => {
    const requestId = randomUUID();
    await request(true, 1_000, requestId);
    await h.state.ingestOutcome(outcome(requestId, 'failed', { failureCode: 'busy', acceptedAt: null }), at(2_000));
    await h.state.ingestReport(report(true, 3_000), at(3_000));
    expect(await entry()).toMatchObject({ command: { state: 'failed' }, confirmed: false, reported: { value: true } });
  });

  it('marks the stored command as reported when a matching report resolves it', async () => {
    const requestId = randomUUID();
    await request(true, 1_000, requestId);
    await h.state.ingestOutcome(outcome(requestId, 'accepted'), at(2_100));
    await h.state.ingestReport(report(true, 4_000), at(4_100));
    expect(await h.dataSource.getRepository(MatterCommand).findOneByOrFail({ requestId })).toMatchObject({
      outcome: 'reported',
      reportedAt: at(4_000),
    });
  });

  it('records a changed report with no command pending as an external state change', async () => {
    await h.state.ingestReport(report(false, 0), at(0));
    expect((await entry()).externalChange).toBeNull();
    await h.state.ingestReport(report(true, 1_000), at(1_000));
    expect(await entry()).toMatchObject({ externalChange: { at: at(1_000), value: true } });
  });

  it('does not call a report an external change while a command is requested or accepted', async () => {
    const requestId = randomUUID();
    await h.state.ingestReport(report(false, 0), at(0));
    await request(true, 1_000, requestId);
    await h.state.ingestReport(report(true, 1_500), at(1_500));
    expect((await entry()).externalChange).toBeNull();
    const other = randomUUID();
    await request(false, 2_000, other);
    await h.state.ingestOutcome(outcome(other, 'accepted'), at(2_100));
    // A third value while the command is accepted is still not external.
    await h.state.ingestReport(report('x', 2_500), at(2_500));
    expect((await entry()).externalChange).toBeNull();
  });

  it('sets a fault and clears it with the next good report', async () => {
    await h.state.ingestReport(report(true, 0), at(0));
    await h.state.ingestReport(report(true, 1_000, { fault: { code: 'overload', message: 'Overcurrent' } }), at(1_000));
    expect(await entry()).toMatchObject({
      reported: { quality: 'fault' },
      fault: { code: 'overload', message: 'Overcurrent', at: at(1_000) },
    });
    await h.state.ingestReport(report(true, 2_000), at(2_000));
    expect(await entry()).toMatchObject({ reported: { quality: 'good' }, fault: null });
  });

  it('computes freshness at read time: fresh, stale and unknown', async () => {
    const state = h.state;
    await state.recordRequest(
      {
        endpointRef,
        stateKey: 'levelControl.currentLevel',
        clusterId: 8,
        commandId: 0,
        value: 5,
        requestedBy: null,
        requestId: randomUUID(),
      },
      at(0),
    );
    const never = (await state.read(endpointRef, T0)).find((e) => e.stateKey === 'levelControl.currentLevel');
    expect(never?.freshness).toBe('unknown');
    await state.ingestReport(report(true, 0), at(0));
    const read = async (ms: number) =>
      (await state.read(endpointRef, T0 + ms)).find((e) => e.stateKey === 'onOff.onOff');
    expect((await read(599_000))?.freshness).toBe('fresh');
    expect((await read(601_000))?.freshness).toBe('stale');
    // Twice the subscription's maximum interval, when known.
    await state.ingestReport(report(true, 1_000, { maxIntervalSec: 30 }), at(1_000));
    expect(await read(60_000)).toMatchObject({ freshness: 'fresh', staleAfterMs: 60_000 });
    expect((await read(62_000))?.freshness).toBe('stale');
  });

  it('ignores out-of-order and duplicate reports', async () => {
    await h.state.ingestReport(report(true, 5_000), at(5_000));
    await h.state.ingestReport(report(false, 1_000), at(5_100));
    await h.state.ingestReport(report(true, 5_000), at(5_200));
    expect(await entry()).toMatchObject({ reported: { value: true, observedAt: at(5_000), receivedAt: at(5_000) } });
    expect(h.state.stats.outOfOrder).toBe(2);
  });

  it('ignores events for unknown, removed and archived endpoints and clusters, and counts them', async () => {
    const states = () => h.dataSource.getRepository(MatterEndpointState).count();
    await h.state.ingestReport({ ...report(true, 0), endpointId: 9 }, at(0));
    await h.state.ingestReport({ ...report(true, 0), nodeId: '99' }, at(0));
    await h.state.ingestReport({ ...report(true, 0), clusterId: 0xfff1_0001 }, at(0));
    expect(await states()).toBe(0);
    expect(h.state.stats).toMatchObject({ unknownEndpoint: 2, unmappedCluster: 1, applied: 0 });

    const nodeId = (await h.lifecycle.listNodes({}))[0].id;
    await h.reconcile(inventory('1', []));
    await h.lifecycle.archive(nodeId, ADMIN);
    await h.state.ingestReport(report(true, 1_000), at(1_000));
    expect(h.state.stats.inactiveNode).toBe(1);
    await h.lifecycle.restore(nodeId, ADMIN);
    await h.lifecycle.forceRemove(nodeId, ADMIN);
    await h.state.ingestReport(report(true, 2_000), at(2_000));
    expect(h.state.stats.unknownEndpoint).toBe(3);
    expect(await states()).toBe(0);
    await h.state.ingestOutcome(outcome(randomUUID(), 'accepted'), at(2_000));
  });

  it('keeps one row per state key under a flood of reports, with no history and no audit entries', async () => {
    for (let i = 0; i < 300; i += 1) await h.state.ingestReport(report(i % 2 === 0, i * 10), at(i * 10 + 5));
    expect(await h.dataSource.getRepository(MatterEndpointState).count()).toBe(1);
    expect(await h.dataSource.getRepository(MatterCommand).count()).toBe(0);
    expect(h.audit).not.toHaveBeenCalled();
    const tables = await h.dataSource.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'plugin_matter_%'`,
    );
    expect(tables.map((t: { name: string }) => t.name)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/history|event|log/)]),
    );
  });

  it('is idempotent for a recorded request id', async () => {
    const requestId = randomUUID();
    await request(true, 1_000, requestId);
    await request(false, 2_000, requestId);
    expect(await h.dataSource.getRepository(MatterCommand).count()).toBe(1);
    expect((await entry()).requested.value).toBe(true);
  });

  describe('command log bound', () => {
    it('prunes to the newest 1,000 rows', async () => {
      const repo = h.dataSource.getRepository(MatterCommand);
      const recent = Date.now() - 60_000;
      await repo.insert(
        Array.from({ length: MAX_COMMAND_ROWS + 20 }, (_unused, i) => ({
          requestId: randomUUID(),
          endpointRef,
          clusterId: 6,
          commandId: 1,
          stateKey: null,
          requestedAt: new Date(recent + i).toISOString(),
          requestedBy: null,
          correlationId: null,
          outcome: 'requested',
          acceptedAt: null,
          reportedAt: null,
          failureCode: null,
        })),
      );
      await request(true, 0);
      const rows = await repo.find({ order: { requestedAt: 'ASC' } });
      expect(rows).toHaveLength(MAX_COMMAND_ROWS);
      // The oldest ones went; the newest stayed.
      expect(rows[rows.length - 1].requestedAt).toBe(new Date(recent + MAX_COMMAND_ROWS + 19).toISOString());
    });

    it('prunes rows older than 30 days, and reconciliation prunes too', async () => {
      const repo = h.dataSource.getRepository(MatterCommand);
      await repo.insert({
        requestId: randomUUID(),
        endpointRef,
        clusterId: 6,
        commandId: 1,
        stateKey: null,
        requestedAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
        requestedBy: null,
        correlationId: null,
        outcome: 'requested',
        acceptedAt: null,
        reportedAt: null,
        failureCode: null,
      });
      await h.reconcile(inventory('1', [node('5')]));
      expect(await repo.count()).toBe(0);
    });
  });
});
