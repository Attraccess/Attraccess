import type { CommissioningSession } from '@attraccess/matter-contract';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SidecarRequestError } from '../client/errors';
import { nodeRow } from '../testing/devices-harness.test-utils';
import {
  ADMIN,
  createCommissioningHarness,
  sidecarSession,
  type CommissioningHarness,
} from '../testing/commissioning-harness.test-utils';

const CODE = '34970112332';
const USER = { userId: 7, authenticationMethod: 'session' as const };
const OTHER = { userId: 8, authenticationMethod: 'session' as const };

describe('commissioning sessions', () => {
  let h: CommissioningHarness;
  /** What the sidecar currently says about its session. */
  let sidecar: CommissioningSession;
  const script = (update: Partial<CommissioningSession>) => {
    sidecar = { ...sidecar, ...update, updatedAt: new Date().toISOString() };
  };

  beforeEach(async () => {
    h = await createCommissioningHarness();
    sidecar = sidecarSession();
    h.connection.handlers['commissioning.start'] = () => sidecar;
    h.connection.handlers['commissioning.get'] = () => sidecar;
    h.connection.handlers['commissioning.cancel'] = () => {
      script({ state: 'failed', failure: { code: 'cancelled' } });
      return sidecar;
    };
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  const succeed = (nodeId = '5', extra: Partial<CommissioningSession> = {}) => {
    h.sidecarCommissions(nodeId);
    script({ state: 'succeeded', step: 'completed', nodeId, outcome: 'reported', ...extra });
  };
  const settled = (id: string, userId = 7) =>
    h.waitFor(() => !['pending', 'running'].includes(h.commissioning.get(id, userId).state));

  it('starts at once with a pending session and sends the code only to the sidecar', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    expect(view).toMatchObject({ state: 'pending', failure: null, nodeRecordId: null, overrideAvailable: false });
    expect(h.connection.sent.find((entry) => entry.operation === 'commissioning.start')).toEqual({
      operation: 'commissioning.start',
      body: { setupCode: CODE },
    });
    expect(JSON.stringify(view)).not.toContain(CODE);
    expect(h.commissioning.current(7)).toMatchObject({ id: view.id });
    expect(h.commissioning.current(8)).toBeNull();
    expect(h.actions()).toEqual(['matter.commissioning_started']);
  });

  it('creates the claimed node and its endpoints only after the sidecar succeeded and the plugin read the node', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    h.connection.emitProgress({
      sessionId: sidecar.sessionId,
      step: 'pase',
      state: 'running',
      nodeId: null,
      failure: null,
    });
    script({ state: 'running', step: 'case' });
    await h.waitFor(() => h.commissioning.get(view.id, 7).step === 'case');
    expect(await h.tables.nodes.count()).toBe(0);

    const changes: unknown[] = [];
    h.bus.changes.subscribe((change) => changes.push(change));
    succeed('5');
    await settled(view.id);

    const done = h.commissioning.get(view.id, 7);
    expect(done).toMatchObject({ state: 'succeeded', step: 'completed', failure: null });
    const row = await h.tables.nodes.findOne();
    expect(row).toMatchObject({ nodeId: '5', lifecycleState: 'claimed', claimedBy: 7, attestationStatus: 'verified' });
    expect(done.nodeRecordId).toBe(row?.id);
    expect(done.endpoints.map((e) => e.endpointId)).toEqual([0, 1]);
    expect(await h.tables.endpoints.count()).toBe(2);
    expect(changes).toContainEqual({ kind: 'inventory' });
    expect(h.actions()).toEqual(['matter.commissioning_started', 'matter.node_commissioned']);
    // The gate is free again.
    expect(h.gate.busy).toBe(false);
  });

  it('records its own fabric change instead of judging it, and the scheduler takes the fabric_changed backup', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    succeed('5');
    await settled(view.id);
    expect(h.guard.mismatch).toBeNull();
    expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(h.backend.generationCounter);
    await h.scheduler.backupAfterChange();
    const stored = (await h.backups.list()).map((entry) => entry.trigger);
    expect(stored).toContain('fabric_changed');
  });

  it('refuses a second start with 409 busy, and every start while the fabric needs recovery', async () => {
    await h.commissioning.start({ setupCode: CODE }, USER);
    await expect(h.commissioning.start({ setupCode: CODE }, OTHER)).rejects.toMatchObject({
      response: { code: 'busy' },
    });
    h.guard.set('fabric_changed');
    await expect(h.commissioning.start({ setupCode: CODE }, USER)).rejects.toMatchObject({
      response: { code: 'recovery_required' },
    });
  });

  it('maps the sidecar refusals of the start to our own wording', async () => {
    h.connection.handlers['commissioning.start'] = () => {
      throw new SidecarRequestError('Invalid body: 34970112332', { code: 'validation_failed' });
    };
    await expect(h.commissioning.start({ setupCode: CODE }, USER)).rejects.toMatchObject({
      response: { code: 'invalid_code', message: 'The setup code is not valid.' },
    });
    h.connection.handlers['commissioning.start'] = () => {
      throw new SidecarRequestError('x', { code: 'attestation_override_disabled' });
    };
    await expect(
      h.commissioning.start({ setupCode: CODE, attestationOverride: { confirmed: true } }, USER),
    ).rejects.toMatchObject({ response: { code: 'attestation_override_disabled' } });
    expect(h.gate.busy).toBe(false);
  });

  describe('failures end explicitly, are audited by code, and leave no row behind', () => {
    it.each(['device_not_found', 'pase_failed', 'timeout', 'fabric_full', 'case_failed', 'invalid_code'] as const)(
      '%s',
      async (code) => {
        const view = await h.commissioning.start({ setupCode: CODE }, USER);
        script({ state: 'failed', step: 'pase', outcome: 'failed', failure: { code } });
        await settled(view.id);
        expect(h.commissioning.get(view.id, 7)).toMatchObject({ state: 'failed', failure: { code } });
        expect(await h.tables.nodes.count()).toBe(0);
        const failed = h.events().at(-1);
        expect(failed).toMatchObject({
          action: 'matter.commissioning_failed',
          details: { failure: code, step: 'pase' },
        });
        expect(h.gate.busy).toBe(false);
      },
    );

    it('attestation failure lists the finding types and offers the override only when the sidecar allows it', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      script({
        state: 'failed',
        step: 'attestation',
        attestationOverrideAllowed: true,
        failure: { code: 'attestation_failed', attestationFindings: ['PaaNotTrusted', 'DclServiceUnavailable'] },
        attestation: { status: 'failed', findings: ['PaaNotTrusted', 'DclServiceUnavailable'] },
      });
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7)).toMatchObject({
        failure: { code: 'attestation_failed', attestationFindings: ['PaaNotTrusted', 'DclServiceUnavailable'] },
        overrideAvailable: true,
        attestation: { status: 'failed' },
      });
      expect(h.events().at(-1)).toMatchObject({
        action: 'matter.commissioning_failed',
        details: { failure: 'attestation_failed', findings: 'PaaNotTrusted,DclServiceUnavailable' },
      });
    });
  });

  it('commissions with the override as a new session, audits it as dangerous and stores the node as unverified', async () => {
    script({ attestationOverrideAllowed: true });
    const view = await h.commissioning.start({ setupCode: CODE, attestationOverride: { confirmed: true } }, USER);
    expect(h.connection.sent.find((entry) => entry.operation === 'commissioning.start')?.body).toEqual({
      setupCode: CODE,
      attestationOverride: { confirmed: true },
    });
    script({
      state: 'running',
      step: 'attestation',
      attestation: { status: 'overridden', findings: ['PaaNotTrusted'] },
    });
    await h.waitFor(() => h.audit.mock.calls.length > 1);
    succeed('5', { attestation: { status: 'overridden', findings: ['PaaNotTrusted'] } });
    await settled(view.id);
    expect(await h.tables.nodes.findOne()).toMatchObject({
      attestationStatus: 'unverified',
      attestationOverridden: true,
    });
    expect(h.actions()).toEqual([
      'matter.commissioning_started',
      'matter.commissioning_attestation_overridden',
      'matter.node_commissioned',
    ]);
    expect(h.events()[1]).toMatchObject({ details: { findings: 'PaaNotTrusted' } });
    expect(h.events()[2]).toMatchObject({ details: { attestation: 'overridden' } });
  });

  describe('a device that already is in the fabric', () => {
    const states = [
      ['claimed', 'open'],
      ['unclaimed', 'open'],
      ['detached', 'repair'],
      ['archived', 'restore'],
    ] as const;
    it.each(states)('a %s record: the action is %s, and no record is added', async (lifecycleState, action) => {
      const fabric = await h.tables.fabrics.findOne();
      await h.tables.nodes.insert(
        nodeRow({ id: 'existing', fabricRef: fabric?.id as string, nodeId: '5', lifecycleState }),
      );
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      script({
        state: 'failed',
        step: 'reading_device',
        failure: { code: 'already_commissioned', existingNodeId: '5' },
      });
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).failure).toEqual({
        code: 'already_commissioned',
        existing: { nodeRecordId: 'existing', lifecycleState, action },
      });
      expect(await h.tables.nodes.count()).toBe(1);
    });

    it('without a live record the action is to reconcile', async () => {
      const fabric = await h.tables.fabrics.findOne();
      await h.tables.nodes.insert(
        nodeRow({
          id: 'gone',
          fabricRef: fabric?.id as string,
          nodeId: '5',
          lifecycleState: 'removed',
          removedAt: 't',
        }),
      );
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      script({ state: 'failed', failure: { code: 'already_commissioned', existingNodeId: '5' } });
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).failure?.existing).toEqual({
        nodeRecordId: null,
        lifecycleState: null,
        action: 'reconcile',
      });
    });
  });

  describe('interruption is a restart, never a resume', () => {
    it('a sidecar that no longer knows the session ends it as interrupted and audited', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      h.connection.handlers['commissioning.get'] = () => {
        throw new SidecarRequestError('Unknown session.', { code: 'not_found' });
      };
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7)).toMatchObject({ state: 'interrupted', failure: { code: 'interrupted' } });
      expect(h.audit.mock.calls.map((c) => (c as unknown as [object])[0])).toContainEqual(
        expect.objectContaining({
          action: 'matter.commissioning_interrupted',
          details: expect.objectContaining({ reason: 'sidecar_restart' }),
        }),
      );
      expect(h.gate.busy).toBe(false);
    });

    it('a new stream instance means the sidecar restarted', async () => {
      h.connection.emitLifecycle(h.connection.streamInstanceId);
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      h.connection.emitLifecycle(randomUUID());
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).state).toBe('interrupted');
    });

    it('a connection that drops interrupts the session', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      h.connection.setState('degraded');
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).state).toBe('interrupted');
    });

    it('a sidecar that stays unreachable, or a session that outlives its time, is interrupted', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      h.connection.handlers['commissioning.get'] = () => {
        throw new SidecarRequestError('down', { code: 'sidecar_unavailable' });
      };
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).state).toBe('interrupted');

      const late = await createCommissioningHarness({ maxMs: 1 });
      late.connection.handlers['commissioning.start'] = () => sidecarSession();
      late.connection.handlers['commissioning.get'] = () => sidecarSession({ state: 'running' });
      late.connection.handlers['commissioning.cancel'] = () => sidecarSession();
      const started = await late.commissioning.start({ setupCode: CODE }, USER);
      await late.waitFor(() => late.commissioning.get(started.id, 7).state === 'interrupted');
      await late.close();
    });

    it('a new session with the same code can start afterwards', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      h.connection.setState('degraded');
      await settled(view.id);
      h.connection.setState('connected');
      sidecar = sidecarSession();
      await expect(h.commissioning.start({ setupCode: CODE }, USER)).resolves.toMatchObject({ state: 'pending' });
    });

    it('a session of an earlier plugin run that finished on the sidecar surfaces as an unclaimed node', async () => {
      h.sidecarCommissions('9');
      h.connection.emitProgress({
        sessionId: randomUUID(),
        step: 'completed',
        state: 'succeeded',
        nodeId: '9',
        failure: null,
      });
      await h.waitFor(async () => (await h.tables.nodes.count()) === 1);
      expect(await h.tables.nodes.findOne()).toMatchObject({ nodeId: '9', lifecycleState: 'unclaimed' });
    });
  });

  describe('the registry only follows agreement', () => {
    it('a node the plugin cannot read ends the session as needs_reconciliation; a later reconciliation lists one unclaimed node', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      // The sidecar says success, but the plugin cannot read the node.
      script({ state: 'succeeded', step: 'completed', nodeId: '5', outcome: 'reported' });
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7)).toMatchObject({ state: 'failed', failure: { code: 'registry_failed' } });
      expect(await h.tables.nodes.count()).toBe(0);
      h.sidecarCommissions('5');
      await h.reconciliation.request();
      const nodes = await h.tables.nodes.find();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({ nodeId: '5', lifecycleState: 'unclaimed' });
    });

    it('a write that fails rolls the whole transaction back', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      h.context.persistence.transaction = (async () => {
        throw new Error('disk full');
      }) as never;
      succeed('5');
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).failure?.code).toBe('registry_failed');
      expect(await h.tables.nodes.count()).toBe(0);
    });

    it('a sidecar fabric other than the recorded one is not written', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      succeed('5');
      h.backend.storage = { ...(h.backend.storage as object), fabricId: '999' } as never;
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).failure?.code).toBe('needs_reconciliation');
      expect(await h.tables.nodes.count()).toBe(0);
    });

    it('a node reconciliation quarantined in the meantime is claimed, not duplicated', async () => {
      h.sidecarCommissions('5');
      await h.reconciliation.request();
      expect(await h.tables.nodes.findOne()).toMatchObject({ lifecycleState: 'unclaimed' });
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      script({ state: 'succeeded', step: 'completed', nodeId: '5', outcome: 'reported' });
      await settled(view.id);
      expect(await h.tables.nodes.count()).toBe(1);
      expect(await h.tables.nodes.findOne()).toMatchObject({ lifecycleState: 'claimed', claimedBy: 7 });
    });
  });

  it('cancels a running session through the sidecar and audits it', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    expect(await h.commissioning.cancel(view.id, 7)).toMatchObject({ state: 'failed', failure: { code: 'cancelled' } });
    expect(h.actions()).toContain('matter.commissioning_cancelled');
    // Idempotent on a finished session.
    expect(await h.commissioning.cancel(view.id, 7)).toMatchObject({ state: 'failed' });
    expect(h.gate.busy).toBe(false);
  });

  it('only the starting user reads, cancels or finishes a session', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    expect(() => h.commissioning.get(view.id, 8)).toThrow(NotFoundException);
    await expect(h.commissioning.cancel(view.id, 8)).rejects.toBeInstanceOf(NotFoundException);
    expect(() => h.commissioning.get(randomUUID(), 7)).toThrow(NotFoundException);
  });

  describe('the naming step', () => {
    const commissioned = async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      succeed('5');
      await settled(view.id);
      return h.commissioning.get(view.id, 7);
    };

    it('names the node and its endpoints once, for the commissioning user only', async () => {
      const view = await commissioned();
      await expect(h.commissioning.finish(view.id, 8, {})).rejects.toBeInstanceOf(NotFoundException);
      const node = await h.commissioning.finish(view.id, 7, {
        displayName: 'Lab plug',
        location: 'Lab',
        endpoints: [{ id: view.endpoints[1].id, displayName: 'Socket' }],
      });
      expect(node).toMatchObject({ displayName: 'Lab plug', location: 'Lab' });
      expect(await h.tables.endpoints.get(view.endpoints[1].id)).toMatchObject({ displayName: 'Socket' });
      expect(h.events().at(-1)).toMatchObject({
        action: 'matter.commissioning_finished',
        details: { nameSet: true, locationSet: true, endpointNames: 1 },
      });
      await expect(h.commissioning.finish(view.id, 7, {})).rejects.toBeInstanceOf(ConflictException);
      expect(h.commissioning.current(7)).toBeNull();
    });

    it('skipping the names is allowed, and a session that did not succeed cannot be finished', async () => {
      const view = await commissioned();
      await expect(h.commissioning.finish(view.id, 7, {})).resolves.toMatchObject({ displayName: null });
      const failed = await createCommissioningHarness();
      failed.connection.handlers['commissioning.start'] = () => sidecarSession();
      const started = await failed.commissioning.start({ setupCode: CODE }, USER);
      await expect(failed.commissioning.finish(started.id, 7, {})).rejects.toBeInstanceOf(ConflictException);
      await failed.close();
    });

    it('refuses endpoints that are not the node’s', async () => {
      const view = await commissioned();
      await expect(
        h.commissioning.finish(view.id, 7, { endpoints: [{ id: randomUUID(), displayName: 'x' }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('never lets the setup code reach the audit, the logs, the rows or the session', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    script({ state: 'failed', failure: { code: 'pase_failed' } });
    await settled(view.id);
    const everything = JSON.stringify([
      h.emitted(),
      await h.tables.nodes.find(),
      await h.tables.fabrics.find(),
      h.commissioning.get(view.id, 7),
    ]);
    expect(everything).not.toContain(CODE);
    expect(ADMIN.userId).toBe(7);
  });
});
