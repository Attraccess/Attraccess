import { ConflictException, NotFoundException } from '@nestjs/common';
import { SidecarRequestError, SidecarTimeoutError } from '../client/errors';
import { nodeRow } from '../testing/devices-harness.test-utils';
import { createCommissioningHarness, type CommissioningHarness } from '../testing/commissioning-harness.test-utils';

const USER = { userId: 7, authenticationMethod: 'session' as const };

describe('removing a node from the fabric', () => {
  let h: CommissioningHarness;
  let generation: number;
  beforeEach(async () => {
    h = await createCommissioningHarness();
    // A claimed node with two endpoints, through the real reconciliation and claim.
    h.sidecarCommissions('5');
    await h.reconciliation.request();
    const [row] = await h.tables.nodes.find();
    await h.lifecycle.claim(row.id, {}, USER).catch(() => undefined);
    generation = h.backend.generationCounter;
    h.connection.handlers['nodes.remove'] = ({ body }) => {
      generation += 1;
      h.backend.generationCounter = generation;
      h.connection.emitEvent('fabric.changed', {
        fabricGeneration: generation,
        fabricId: h.fabricId,
        state: 'initialized',
      });
      return {
        nodeId: '5',
        result: (body as { force: boolean }).force ? 'forgotten' : 'removed_from_fabric',
        fabricGeneration: generation,
      };
    };
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  const nodeRef = async () => (await h.tables.nodes.findOne())?.id as string;

  it.each([
    ['normal', 'removed_from_fabric', 'matter.node_removed_from_fabric', false],
    ['force', 'forced_from_fabric', 'matter.node_force_removed_from_fabric', true],
  ] as const)(
    '%s removal: removed record, retired endpoints, history kept, generation recorded',
    async (mode, reason, action, force) => {
      const id = await nodeRef();
      const changes: unknown[] = [];
      h.bus.changes.subscribe((change) => changes.push(change));
      const removed = await h.removal.remove(id, { mode, confirm: true }, USER);
      expect(removed).toMatchObject({ lifecycleState: 'removed', removalReason: reason, removedBy: 7 });
      expect(h.connection.sent.find((entry) => entry.operation === 'nodes.remove')?.body).toEqual({ force });
      // Endpoints are history; the rows stay.
      const endpoints = await h.tables.endpoints.find({ where: { nodeRef: id } });
      expect(endpoints).toHaveLength(2);
      expect(endpoints.every((endpoint) => endpoint.removedAt !== null)).toBe(true);
      expect(changes).toContainEqual({ kind: 'inventory' });
      expect(h.actions()).toEqual([action]);
      // Our own change: recorded, never a mismatch, and the scheduler backs it up.
      expect(h.guard.mismatch).toBeNull();
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(generation);
      await h.scheduler.backupAfterChange();
      expect((await h.backups.list()).map((entry) => entry.trigger)).toContain('fabric_changed');
    },
  );

  it('a removed node cannot be claimed or removed again, and re-commissioning would make a new record', async () => {
    const id = await nodeRef();
    await h.removal.remove(id, { mode: 'normal', confirm: true }, USER);
    await expect(h.lifecycle.claim(id, {}, USER)).rejects.toBeInstanceOf(ConflictException);
    await expect(h.removal.remove(id, { mode: 'normal', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'not_removable' },
    });
  });

  it('an unreachable or silent device fails the normal removal, changes nothing and is audited', async () => {
    const id = await nodeRef();
    h.connection.handlers['nodes.remove'] = () => {
      throw new SidecarRequestError('unreachable', { code: 'device_unreachable' });
    };
    await expect(h.removal.remove(id, { mode: 'normal', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'device_unreachable', message: expect.stringContaining('Force removal') },
    });
    h.connection.handlers['nodes.remove'] = () => {
      throw new SidecarTimeoutError('slow', { outcome: 'uncertain' });
    };
    await expect(h.removal.remove(id, { mode: 'normal', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'timeout' },
    });
    expect((await h.tables.nodes.get(id))?.lifecycleState).toBe('claimed');
    expect(
      h.audit.mock.calls.map((call) => (call as unknown as [{ action: string; outcome: string; details: object }])[0]),
    ).toEqual([
      expect.objectContaining({
        action: 'matter.node_removal_failed',
        outcome: 'failed',
        details: expect.objectContaining({ reason: 'device_unreachable', mode: 'normal' }),
      }),
      expect.objectContaining({
        action: 'matter.node_removal_failed',
        details: expect.objectContaining({ reason: 'timeout' }),
      }),
    ]);
    // Force removal works without the device, and is not a "factory reset" anywhere.
    h.connection.handlers['nodes.remove'] = ({ body }) => ({
      nodeId: '5',
      result: 'forgotten',
      fabricGeneration: (body as object) && 9,
    });
    await expect(h.removal.remove(id, { mode: 'force', confirm: true }, USER)).resolves.toMatchObject({
      removalReason: 'forced_from_fabric',
    });
  });

  it('is refused while the fabric needs recovery, while busy, for another fabric and for unknown nodes', async () => {
    const id = await nodeRef();
    h.guard.set('generation_behind');
    await expect(h.removal.remove(id, { mode: 'normal', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'recovery_required' },
    });
    h.guard.set(null);
    const release = h.gate.enter('commissioning');
    await expect(h.removal.remove(id, { mode: 'normal', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'busy' },
    });
    release();
    await h.tables.nodes.insert(nodeRow({ id: 'elsewhere', fabricRef: 'other', nodeId: '77' }));
    await expect(h.removal.remove('elsewhere', { mode: 'normal', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'fabric_mismatch' },
    });
    await expect(
      h.removal.remove('00000000-0000-4000-8000-000000000000', { mode: 'normal', confirm: true }, USER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives the device 30 s, and reports a timeout as uncertain and asks for a reconciliation', async () => {
    const id = await nodeRef();
    const deadlines: unknown[] = [];
    h.connection.handlers['nodes.remove'] = (options) => {
      deadlines.push((options as { timeoutMs?: number }).timeoutMs);
      throw new SidecarTimeoutError('slow', { outcome: 'uncertain' });
    };
    const request = jest.spyOn(h.reconciliation, 'request');
    const error = await h.removal.remove(id, { mode: 'normal', confirm: true }, USER).catch((e: unknown) => e);
    expect(deadlines).toEqual([30_000]);
    expect(error).toMatchObject({ response: { code: 'timeout', message: expect.stringContaining('uncertain') } });
    expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain('Nothing was changed');
    expect(request).toHaveBeenCalled();
  });

  it('reconciles once more after the sidecar stopped waiting for a late confirmation', async () => {
    const id = await nodeRef();
    h.connection.handlers['nodes.remove'] = () => {
      throw new SidecarTimeoutError('slow', { outcome: 'uncertain' });
    };
    const request = jest.spyOn(h.reconciliation, 'request').mockResolvedValue(undefined as never);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const pending = h.removal.remove(id, { mode: 'normal', confirm: true }, USER).catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);
      await pending;
      const before = request.mock.calls.length;
      await jest.advanceTimersByTimeAsync(35_000);
      expect(request.mock.calls.length).toBe(before + 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a record that is already removed when the sidecar succeeded counts as done, and is audited', async () => {
    const id = await nodeRef();
    const remove = h.connection.handlers['nodes.remove'];
    h.connection.handlers['nodes.remove'] = async (options) => {
      // A record-only force remove landed meanwhile.
      await h.lifecycle.forceRemove(id, USER);
      return remove(options);
    };
    await expect(h.removal.remove(id, { mode: 'normal', confirm: true }, USER)).resolves.toMatchObject({
      lifecycleState: 'removed',
    });
    expect(h.events().at(-1)).toMatchObject({
      action: 'matter.node_removed_from_fabric',
      details: { registryUpdated: true, previousState: 'claimed' },
    });
  });

  it('a record write that fails after the sidecar removed the node is still audited and reported clearly', async () => {
    const id = await nodeRef();
    const request = jest.spyOn(h.reconciliation, 'request');
    const remove = h.connection.handlers['nodes.remove'];
    h.connection.handlers['nodes.remove'] = (options) => {
      h.context.persistence.transaction = (async () => {
        throw new Error('disk full');
      }) as never;
      return remove(options);
    };
    await expect(h.removal.remove(id, { mode: 'force', confirm: true }, USER)).rejects.toMatchObject({
      response: { code: 'registry_failed', message: expect.stringContaining('was removed from the fabric') },
    });
    expect(h.events().at(-1)).toMatchObject({
      action: 'matter.node_force_removed_from_fabric',
      details: { registryUpdated: false },
    });
    expect(request).toHaveBeenCalled();
    expect(h.gate.busy).toBe(false);
  });

  it('keeps the record-only force remove of the lifecycle service as it was', async () => {
    const id = await nodeRef();
    const removed = await h.lifecycle.forceRemove(id, USER);
    expect(removed).toMatchObject({ lifecycleState: 'removed', removalReason: 'force_removed' });
    expect(h.connection.sent.some((entry) => entry.operation === 'nodes.remove')).toBe(false);
  });
});
