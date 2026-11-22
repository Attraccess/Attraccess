// Test harness for the device model: the in-memory fake of the plugin record port over the plugin's declared tables,
// a plugin context on top of it, and a scripted stand-in for the sidecar connection.
import type { NodeListView, NodeView } from '../devices/sidecar-types';
import { createInMemoryPluginStorage, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { SidecarClientError, SidecarTimeoutError, SidecarUnavailableError } from '../client/errors';
import type { ConnectionStatus } from '../client/connection';
import { MatterConnectionService } from '../connection/connection.service';
import { CONNECTION_ROW_ID } from '../connection/entity';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterChangeBus } from '../devices/change-bus';
import type { MatterNode } from '../devices/entities';
import { MatterLifecycleService } from '../devices/lifecycle.service';
import { MatterFabricGuard } from '../fabric/guard';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { MatterStateService } from '../devices/state.service';
import { matterStorage, type MatterTables } from '../plugin-storage/access';
import { MATTER_STORAGE, MATTER_TABLES } from '../plugin-storage/tables';

export const ADMIN = { userId: 7, authenticationMethod: 'session' as const };

export function endpoint(
  endpointId: number,
  clusterIds: number[] = [0x0006],
  extra: Partial<NodeView['endpoints'][number]> = {},
): NodeView['endpoints'][number] {
  return {
    endpointId,
    parentEndpointId: endpointId === 0 ? null : 0,
    deviceTypes: [{ deviceTypeId: 0x010a, revision: 3 }],
    clusters: clusterIds.map((clusterId) => ({
      clusterId,
      role: 'server' as const,
      revision: 1,
      featureMap: 0,
      attributeIds: [0, 1],
      acceptedCommandIds: [0, 1, 2],
    })),
    bridged: null,
    ...extra,
  };
}

export function node(nodeId: string, extra: Partial<NodeView> = {}): NodeView {
  return {
    nodeId,
    reachable: true,
    vendorId: 4_874,
    productId: 1,
    vendorName: 'Acme',
    productName: 'Plug',
    serialNumber: `SN-${nodeId}`,
    uniqueId: `U-${nodeId}`,
    hardwareVersion: 1,
    softwareVersion: 3,
    softwareVersionString: '1.0.3',
    attestation: { status: 'verified', checkedAt: '2026-10-29T10:00:00.000Z' },
    observedAt: '2026-10-29T10:00:00.000Z',
    endpoints: [endpoint(0, [0x0028]), endpoint(1, [0x0006, 0x0008])],
    administrators: [],
    ...extra,
  };
}

export const inventory = (fabricId: string | null, nodes: NodeView[], authoritative = true): NodeListView => ({
  authoritative,
  fabricId,
  nodes,
});

/** The connection the services see. Scripts what `inventory.list` / `inventory.get` / `fabric.get` answer. */
export class ScriptedSidecar {
  state: ConnectionStatus['state'] = 'connected';
  inventoryAvailable: boolean | null = true;
  list: NodeListView | Error = inventory(null, []);
  fabricId: string | null = null;
  fabricGeneration = 1;
  requests: string[] = [];
  /** Delay before `inventory.list` answers, to hold a run open. */
  listDelayMs = 0;

  status(): ConnectionStatus {
    return {
      state: this.state,
      reason: this.state === 'connected' ? null : 'unavailable',
      capabilities:
        this.inventoryAvailable === null
          ? null
          : { capabilities: [{ family: 'inventory', defined: true, available: this.inventoryAvailable }] },
    } as unknown as ConnectionStatus;
  }

  /** Answers for operations beyond inventory (`commissioning.*`, `nodes.*`): a thrown error is the sidecar's refusal. */
  handlers: Record<string, (options: { params?: Record<string, string>; body?: unknown }) => unknown> = {};
  /** The bodies of the requests, by operation, for assertions (a test must not need to log them). */
  bodies: { operation: string; body: unknown }[] = [];
  private readonly eventListeners = new Set<(event: { cursor: string; event: unknown }) => void>();
  private readonly stateListeners = new Set<(status: ConnectionStatus) => void>();

  /** Delivers an event to the subscribers, like the connection's event stream. */
  emit(event: unknown): void {
    for (const listener of this.eventListeners) listener({ cursor: 'c', event });
  }

  /** Changes the connection state and tells the subscribers. */
  setState(state: ConnectionStatus['state']): void {
    this.state = state;
    for (const listener of this.stateListeners) listener(this.status());
  }

  async request(operation: string, options?: { params?: { nodeId: string }; body?: unknown }): Promise<unknown> {
    this.requests.push(operation);
    this.bodies.push({ operation, body: options?.body });
    if (this.state !== 'connected') throw new SidecarUnavailableError('The Matter sidecar is not connected.');
    const custom = this.handlers[operation];
    if (custom) return custom(options ?? {});
    if (operation === 'inventory.list') {
      if (this.listDelayMs) await new Promise((resolve) => setTimeout(resolve, this.listDelayMs));
      if (this.list instanceof Error) throw this.list;
      return this.list;
    }
    if (operation === 'fabric.get') {
      return {
        state: this.fabricId === null ? 'uninitialized' : 'initialized',
        fabricId: this.fabricId,
        fabricGeneration: this.fabricGeneration,
      };
    }
    if (operation === 'inventory.get') {
      if (this.list instanceof Error) throw this.list;
      const found = this.list.nodes.find((entry) => entry.nodeId === options?.params?.nodeId);
      if (!found) throw new SidecarClientError('request', 'Unknown node.', { code: 'not_found' });
      return found;
    }
    throw new Error(`unexpected operation ${operation}`);
  }

  onStateChange = (listener: (status: ConnectionStatus) => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };
  onReconciliationRequired = () => () => undefined;
  onEvent = (listener: (event: { cursor: string; event: unknown }) => void) => {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  };
}

export const unsupportedCapability = () =>
  new SidecarClientError('request', 'Not implemented in this sidecar release.', { code: 'unsupported_capability' });
export const timeoutError = () => new SidecarTimeoutError('timed out');

/** A complete node row for fixtures; `overrides` set what a test cares about. */
export const nodeRow = (overrides: Partial<MatterNode> = {}): MatterNode => ({
  id: 'node-1',
  fabricRef: 'x',
  nodeId: '5',
  vendorId: null,
  productId: null,
  vendorName: null,
  productName: null,
  serialNumber: null,
  uniqueId: null,
  hardwareVersion: null,
  softwareVersion: null,
  softwareVersionString: null,
  attestationStatus: null,
  attestationCheckedAt: null,
  displayName: null,
  description: null,
  location: null,
  lifecycleState: 'unclaimed',
  detachedReason: null,
  reachable: null,
  firstSeenAt: 't',
  lastSeenAt: 't',
  claimedAt: null,
  claimedBy: null,
  detachedAt: null,
  archivedAt: null,
  archivedBy: null,
  removedAt: null,
  removedBy: null,
  removalReason: null,
  mergedInto: null,
  createdAt: 't',
  updatedAt: 't',
  administrators: null,
  attestationOverridden: null,
  ...overrides,
});

type Logical = keyof MatterTables;
const logicalOf = (physical: string): Logical => {
  const found = (Object.keys(MATTER_TABLES) as Logical[]).find((name) => MATTER_TABLES[name].physicalName === physical);
  if (!found) throw new Error(`unknown table ${physical}`);
  return found;
};

export async function createHarness() {
  const fake = createInMemoryPluginStorage(MATTER_STORAGE);
  const audit = jest.fn(async () => ({ status: 'recorded' as const }));
  const context = {
    hostVersion: '2.0.0',
    manifest: { id: 'matter', name: 'matter', version: '0.5.0-alpha.0', pluginDirectory: 'matter' },
    logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
    storage: fake.storage,
    persistence: fake.persistence,
    audit: { record: audit },
    // A reversible stand-in for the host's encryption, visibly not plaintext.
    secrets: {
      encrypt: (text: string) => `enc:${Buffer.from(text).toString('base64')}`,
      decrypt: (text: string) => Buffer.from(text.slice(4), 'base64').toString(),
    },
  } as unknown as PluginContext;
  const tables = matterStorage(context).tables;
  // A saved connection by user 1: system-initiated audit entries must never be attributed to that user.
  await tables.connection.insert({
    id: CONNECTION_ROW_ID,
    url: 'http://127.0.0.1:1',
    encryptedCredential: 'x',
    caCertificate: null,
    credentialUpdatedAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
    updatedBy: 1,
  });
  const sidecar = new ScriptedSidecar();
  const connectionService = { connection: sidecar } as unknown as MatterConnectionService;
  const auditService = new DeviceAuditService(context);
  const guard = new MatterFabricGuard();
  // The services announce their changes on one bus, as in the plugin; a test subscribes to `bus.changes`.
  const bus = new MatterChangeBus();
  const state = new MatterStateService(context, bus);
  const reconciliation = new MatterReconciliationService(context, connectionService, auditService, guard, bus);
  const lifecycle = new MatterLifecycleService(context, connectionService, auditService, bus);
  const actions = () => audit.mock.calls.map((call) => (call as unknown as [{ action: string }])[0].action);
  return {
    context,
    /** The tables outside a transaction, for assertions and fixtures. */
    tables,
    audit,
    actions,
    sidecar,
    bus,
    state,
    guard,
    reconciliation,
    lifecycle,
    reconcile: (list: NodeListView | Error) => {
      sidecar.list = list;
      return reconciliation.request();
    },
    /** The row of a table that matches `where`; throws when there is none. */
    one: async <K extends Logical>(
      name: K,
      where: NonNullable<Parameters<MatterTables[K]['findOne']>[0]>['where'],
    ): Promise<NonNullable<Awaited<ReturnType<MatterTables[K]['findOne']>>>> => {
      const row = await (tables[name] as MatterTables['nodes']).findOne({ where: where as never });
      if (!row) throw new Error(`no row in ${name} for ${JSON.stringify(where)}`);
      return row as never;
    },
    /** The live node (not removed) with this Matter node ID in the fabric with this Matter fabric ID. */
    liveNode: async (nodeId: string, fabricId = '1'): Promise<MatterNode> => {
      const fabrics = await tables.fabrics.find({ where: { fabricId } });
      const found = await tables.nodes.findOne({
        where: { nodeId, fabricRef: { in: fabrics.map((fabric) => fabric.id) }, removedAt: null },
      });
      if (!found) throw new Error(`no live node ${nodeId} in fabric ${fabricId}`);
      return found;
    },
    /** Deletes every row of a table. */
    clear: async (name: Logical) => {
      const [key] = MATTER_TABLES[name].primaryKey;
      await (tables[name] as MatterTables['nodes']).delete({ [key]: { isNull: false } } as never);
    },
    /** The rows of a table as `SELECT * ... ORDER BY 1, 2` would give them: physical column names. */
    rows: async <T extends object>(table: string): Promise<T[]> => {
      const logical = logicalOf(table);
      const fields = Object.entries(MATTER_TABLES[logical].fields);
      const found = (await tables[logical].find()) as unknown as Record<string, unknown>[];
      const named = found.map((row) =>
        Object.fromEntries(fields.map(([field, definition]) => [definition.column ?? field, row[field] ?? null])),
      );
      const [first, second] = fields.map(([field, definition]) => definition.column ?? field);
      const order = (a: unknown, b: unknown) => (a === b ? 0 : (a as string) < (b as string) ? -1 : 1);
      return named.sort((a, b) => order(a[first], b[first]) || order(a[second], b[second])) as T[];
    },
    close: async () => undefined,
  };
}
export type Harness = Awaited<ReturnType<typeof createHarness>>;
