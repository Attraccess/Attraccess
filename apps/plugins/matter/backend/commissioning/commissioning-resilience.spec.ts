import type { CommissioningSession } from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { SidecarRequestError, SidecarUnavailableError } from '../client/errors';
import {
  ADMIN,
  createCommissioningHarness,
  sidecarSession,
  type CommissioningHarness,
} from '../testing/commissioning-harness.test-utils';

const CODE = '34970112332';
const USER = { userId: 7, authenticationMethod: 'session' as const };

describe('commissioning never gets stuck', () => {
  let h: CommissioningHarness;
  let sidecar: CommissioningSession;
  let cancels: string[];
  const script = (update: Partial<CommissioningSession>) => {
    sidecar = { ...sidecar, ...update, updatedAt: new Date().toISOString() };
  };

  beforeEach(async () => {
    h = await createCommissioningHarness();
    sidecar = sidecarSession();
    cancels = [];
    h.connection.handlers['commissioning.start'] = () => sidecar;
    h.connection.handlers['commissioning.get'] = () => sidecar;
    h.connection.handlers['commissioning.cancel'] = ({ params }) => {
      cancels.push(params?.sessionId as string);
      script({ state: 'failed', failure: { code: 'cancelled' } });
      return sidecar;
    };
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  const settled = (id: string) => h.waitFor(() => !['pending', 'running'].includes(h.commissioning.get(id, 7).state));
  const interrupted = () =>
    h
      .events()
      .filter((entry) => entry.action === 'matter.commissioning_interrupted')
      .map((entry) => entry.details.reason);

  it('a database error while settling fails the session as internal and frees the gate', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    const find = jest.spyOn(h.tables.nodes, 'find').mockRejectedValueOnce(new Error('database is gone'));
    script({ state: 'failed', failure: { code: 'already_commissioned', existingNodeId: '5' } });
    await settled(view.id);
    find.mockRestore();
    expect(h.commissioning.get(view.id, 7)).toMatchObject({ state: 'failed', failure: { code: 'internal' } });
    expect(h.gate.busy).toBe(false);
    expect(h.events().at(-1)).toMatchObject({
      action: 'matter.commissioning_failed',
      details: { failure: 'internal' },
    });
    sidecar = sidecarSession();
    await expect(h.commissioning.start({ setupCode: CODE }, USER)).resolves.toMatchObject({ state: 'pending' });
  });

  it.each(['internal', 'case_failed', 'timeout'] as const)(
    'a %s failure asks for a reconciliation: the device may have joined',
    async (code) => {
      const request = jest.spyOn(h.reconciliation, 'request');
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      script({ state: 'failed', step: 'case', failure: { code } });
      await settled(view.id);
      expect(request).toHaveBeenCalled();
    },
  );

  it('a pase failure asks for no reconciliation', async () => {
    const request = jest.spyOn(h.reconciliation, 'request');
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    script({ state: 'failed', step: 'pase', failure: { code: 'pase_failed' } });
    await settled(view.id);
    expect(request).not.toHaveBeenCalled();
  });

  it('a dropped connection cancels the session on the sidecar once it is back, and "Start again" works', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    h.connection.setState('degraded');
    await settled(view.id);
    expect(h.commissioning.get(view.id, 7).state).toBe('interrupted');
    expect(cancels).toEqual([]);
    // The cancel sent while the connection was down could not be delivered.
    await new Promise((resolve) => setTimeout(resolve, 20));
    h.connection.setState('connected');
    await h.waitFor(() => cancels.length === 1);
    expect(cancels).toEqual([sidecar.sessionId]);
    sidecar = sidecarSession();
    await expect(h.commissioning.start({ setupCode: CODE }, USER)).resolves.toMatchObject({ state: 'pending' });
  });

  it('a session that outlives its time is cancelled on the sidecar', async () => {
    const late = await createCommissioningHarness({ maxMs: 1 });
    const sent: string[] = [];
    late.connection.handlers['commissioning.start'] = () => sidecarSession();
    late.connection.handlers['commissioning.get'] = () => sidecarSession({ state: 'running' });
    late.connection.handlers['commissioning.cancel'] = ({ params }) => {
      sent.push(params?.sessionId as string);
      return sidecarSession();
    };
    const started = await late.commissioning.start({ setupCode: CODE }, USER);
    await late.waitFor(() => late.commissioning.get(started.id, 7).state === 'interrupted');
    await late.waitFor(() => sent.length === 1);
    await late.close();
  });

  it('cancels a sidecar session the plugin already ended, without auditing it again as plugin_restart', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    const first = sidecar.sessionId;
    // The cancel never reaches the sidecar: it keeps the session and refuses the next start as busy.
    h.connection.handlers['commissioning.cancel'] = () => {
      throw new SidecarUnavailableError('down');
    };
    h.connection.handlers['commissioning.get'] = () => {
      throw new SidecarUnavailableError('down');
    };
    await settled(view.id);
    expect(interrupted()).toEqual(['connection_lost']);

    const orphanCancels: string[] = [];
    let starts = 0;
    h.connection.handlers['commissioning.start'] = () => {
      starts += 1;
      if (starts === 1) throw new SidecarRequestError('busy', { code: 'busy', details: { sessionId: first } });
      sidecar = sidecarSession();
      return sidecar;
    };
    h.connection.handlers['commissioning.cancel'] = ({ params }) => {
      orphanCancels.push(params?.sessionId as string);
      return sidecarSession({ sessionId: first, state: 'failed', failure: { code: 'cancelled' } });
    };
    h.connection.handlers['commissioning.get'] = ({ params }) =>
      params?.sessionId === first ? sidecarSession({ sessionId: first, state: 'failed' }) : sidecar;

    await expect(h.commissioning.start({ setupCode: CODE }, USER)).resolves.toMatchObject({ state: 'pending' });
    expect(orphanCancels).toEqual([first]);
    expect(interrupted()).toEqual(['connection_lost']);
  });

  it('a plugin that stops cancels its running session on the sidecar and audits it as plugin_restart', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    await h.commissioning.onModuleDestroy();
    expect(h.commissioning.get(view.id, 7).state).toBe('interrupted');
    expect(cancels).toEqual([sidecar.sessionId]);
    expect(interrupted()).toEqual(['plugin_restart']);
    expect(h.gate.busy).toBe(false);
  });

  it('a stop never waits long for a sidecar that does not answer', async () => {
    await h.commissioning.start({ setupCode: CODE }, USER);
    h.connection.handlers['commissioning.cancel'] = () => new Promise(() => undefined);
    const began = Date.now();
    await h.commissioning.onModuleDestroy();
    expect(Date.now() - began).toBeLessThan(4_000);
    expect(interrupted()).toEqual(['plugin_restart']);
  });

  it('records the warning finding types of a verified attestation with the commissioned node', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    h.sidecarCommissions('5');
    script({
      state: 'succeeded',
      step: 'completed',
      nodeId: '5',
      outcome: 'reported',
      attestation: { status: 'verified', findings: ['DclServiceUnavailable'] },
    });
    await settled(view.id);
    expect(h.events().at(-1)).toMatchObject({
      action: 'matter.node_commissioned',
      details: { attestation: 'verified', findings: 'DclServiceUnavailable' },
    });
  });

  it('names a node once even when the naming is sent twice at the same time', async () => {
    const view = await h.commissioning.start({ setupCode: CODE }, USER);
    h.sidecarCommissions('5');
    script({ state: 'succeeded', step: 'completed', nodeId: '5', outcome: 'reported' });
    await settled(view.id);
    const results = await Promise.allSettled([
      h.commissioning.finish(view.id, 7, { displayName: 'A' }),
      h.commissioning.finish(view.id, 7, { displayName: 'B' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refused = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ response: { code: 'already_finished' } });
    expect(h.actions().filter((action) => action === 'matter.commissioning_finished')).toHaveLength(1);
  });

  describe('setup codes never cross plain HTTP', () => {
    it('refuses to start over an insecure transport before sending anything', async () => {
      h.connection.insecureTransport = true;
      await expect(h.commissioning.start({ setupCode: CODE }, USER)).rejects.toMatchObject({
        status: 403,
        response: { code: 'insecure_transport', message: expect.stringContaining('HTTPS') },
      });
      expect(h.connection.sent.some((entry) => entry.operation === 'commissioning.start')).toBe(false);
      expect(h.gate.busy).toBe(false);
    });

    it('maps the sidecar refusing the transport to the same answer', async () => {
      h.connection.handlers['commissioning.start'] = () => {
        throw new SidecarRequestError('plain HTTP', { code: 'insecure_transport' });
      };
      await expect(h.commissioning.start({ setupCode: CODE }, USER)).rejects.toMatchObject({
        status: 403,
        response: { code: 'insecure_transport' },
      });
    });
  });

  describe('while a commissioning, removal or share runs, nothing else changes the fabric', () => {
    it('refuses backups, restores and fabric creation with busy, and commissioning itself still runs', async () => {
      const view = await h.commissioning.start({ setupCode: CODE }, USER);
      expect(h.guard.operation).toBe('commissioning');
      await expect(h.backups.backup('manual', null)).rejects.toMatchObject({ response: { code: 'busy' } });
      await expect(h.fabric.create(undefined, ADMIN)).rejects.toMatchObject({ response: { code: 'busy' } });
      await expect(
        h.restore.validate({ type: 'stored', backupId: randomUUID() }, undefined, ADMIN),
      ).rejects.toMatchObject({ response: { code: 'busy' } });
      h.sidecarCommissions('5');
      script({ state: 'succeeded', step: 'completed', nodeId: '5', outcome: 'reported' });
      await settled(view.id);
      expect(h.commissioning.get(view.id, 7).state).toBe('succeeded');
      expect(h.guard.operation).toBeNull();
      await expect(h.backups.backup('manual', null)).resolves.toMatchObject({ trigger: 'manual' });
    });

    it('refuses to start while a restore confirmation runs, before the restore marks the fabric busy', async () => {
      h.guard.restoreConfirming = true;
      await expect(h.commissioning.start({ setupCode: CODE }, USER)).rejects.toMatchObject({
        response: { code: 'busy' },
      });
      h.guard.restoreConfirming = false;
      await expect(h.commissioning.start({ setupCode: CODE }, USER)).resolves.toMatchObject({ state: 'pending' });
    });
  });
});
