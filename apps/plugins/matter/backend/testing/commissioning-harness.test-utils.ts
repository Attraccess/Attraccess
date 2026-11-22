// Test harness for commissioning: the fabric harness (real fabric, backup and scheduler services on a fake sidecar) with
// the commissioning, removal and sharing services on top, and a connection that also answers those operations.
import { randomUUID } from 'node:crypto';
import type { CommissioningSession } from '@attraccess/matter-contract';
import { SidecarRequestError } from '../client/errors';
import { MatterCommissioningService, type CommissioningTiming } from '../commissioning/commissioning.service';
import { MatterOperationGate } from '../commissioning/operation-gate';
import { MatterNodeRemovalService } from '../commissioning/removal.service';
import { MatterNodeSharingService } from '../commissioning/sharing.service';
import type { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import type { NodeView } from '../devices/sidecar-types';
import { ADMIN, node as nodeFixture } from './devices-harness.test-utils';
import { createFabricHarness } from './fabric-harness.test-utils';
import { FakeFabricBackend, FakeFabricConnection } from './fake-fabric.test-utils';

export { ADMIN };

type Options = { params?: Record<string, string>; body?: unknown };

/** The fake fabric connection, plus scripted answers for `commissioning.*`, `nodes.*` and `inventory.get`. */
export class CommissioningConnection extends FakeFabricConnection {
  handlers: Record<string, (options: Options) => unknown> = {};
  readonly sent: { operation: string; body: unknown }[] = [];
  streamInstanceId = randomUUID();

  override async request(operation: never, options: Options = {}): Promise<unknown> {
    const name = operation as string;
    this.sent.push({ operation: name, body: options.body });
    const custom = this.handlers[name];
    if (custom && this.state === 'connected') return custom(options);
    if (name === 'inventory.get' && this.state === 'connected') {
      const found = (this.nodes as NodeView[]).find((entry) => entry.nodeId === options.params?.nodeId);
      if (!found) {
        throw new SidecarRequestError('Unknown node.', { code: 'not_found' });
      }
      return found;
    }
    return super.request(operation, options);
  }

  /** Every event of the stream carries the sidecar run it belongs to. */
  override emitEvent(type: string, payload: unknown): void {
    for (const handler of this.eventHandlers) {
      handler({ event: { type, payload, streamInstanceId: this.streamInstanceId } } as never);
    }
  }

  /** An event of the current sidecar run, as the event stream delivers it. */
  emitProgress(payload: Record<string, unknown>, streamInstanceId = this.streamInstanceId): void {
    for (const handler of this.eventHandlers) {
      handler({ event: { type: 'commissioning.progress', payload, streamInstanceId } } as never);
    }
  }

  /** Any event with a stream instance, such as the first one of a restarted sidecar. */
  emitLifecycle(streamInstanceId: string): void {
    for (const handler of this.eventHandlers) {
      handler({ event: { type: 'sidecar.lifecycle', payload: { phase: 'started' }, streamInstanceId } } as never);
    }
  }
}

export const sidecarSession = (overrides: Partial<CommissioningSession> = {}): CommissioningSession => ({
  sessionId: randomUUID(),
  state: 'pending',
  step: null,
  nodeId: null,
  outcome: 'requested',
  failure: null,
  attestation: null,
  attestationOverrideAllowed: false,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finishedAt: null,
  ...overrides,
});

export const FAST_TIMING: CommissioningTiming = {
  pollMs: 20,
  maxMs: 60_000,
  maxUnreachablePolls: 3,
  retainMs: 3_600_000,
};

export async function createCommissioningHarness(timing: Partial<CommissioningTiming> = {}) {
  let created!: CommissioningConnection;
  const h = await createFabricHarness({
    connection: (backend: FakeFabricBackend) => (created = new CommissioningConnection(backend)),
  });
  await h.fabric.create(undefined, ADMIN);
  const connection = created;
  const connectionService = { connection } as unknown as MatterConnectionService;
  const gate = new MatterOperationGate();
  const audit = new DeviceAuditService(h.context);
  const commissioning = new MatterCommissioningService(
    h.context,
    connectionService,
    h.guard,
    audit,
    h.bus,
    gate,
    h.fabric,
    h.reconciliation,
    { ...FAST_TIMING, ...timing },
  );
  commissioning.onModuleInit();
  const removal = new MatterNodeRemovalService(h.context, connectionService, h.guard, audit, h.bus, gate, h.fabric);
  const sharing = new MatterNodeSharingService(h.context, connectionService, h.guard, audit, gate);
  const fabricId = h.backend.storage?.fabricId as string;
  /** The sidecar commissions a node: the fabric generation moves on and `fabric.changed` is published. */
  const sidecarCommissions = (nodeId: string, extra: Partial<NodeView> = {}) => {
    connection.nodes.push(nodeFixture(nodeId, extra));
    h.backend.generationCounter += 1;
    connection.emitEvent('fabric.changed', {
      fabricGeneration: h.backend.generationCounter,
      fabricId,
      state: 'initialized',
    });
  };
  const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 3_000) => {
    const end = Date.now() + ms;
    while (!(await condition())) {
      if (Date.now() > end) throw new Error('condition not met in time');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  type AuditEvent = {
    action: string;
    outcome: string;
    principal: { userId?: number };
    details: Record<string, unknown>;
  };
  /** The audit entries recorded so far, typed. */
  const events = () => h.audit.mock.calls.map((call) => (call as unknown as [AuditEvent])[0]);
  return {
    ...h,
    events,
    connection,
    commissioning,
    removal,
    sharing,
    gate,
    fabricId,
    sidecarCommissions,
    waitFor,
    close: async () => {
      commissioning.onModuleDestroy();
      sharing.onModuleDestroy();
    },
  };
}
export type CommissioningHarness = Awaited<ReturnType<typeof createCommissioningHarness>>;
