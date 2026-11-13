// Test harness for the device model: a real in-memory SQLite database with the plugin's own migrations, a plugin
// context on top of it, and a scripted stand-in for the sidecar connection.
import type { NodeListView, NodeView } from '../devices/sidecar-types';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { DataSource, type EntityManager } from 'typeorm';
import { SidecarClientError, SidecarTimeoutError, SidecarUnavailableError } from '../client/errors';
import type { ConnectionStatus } from '../client/connection';
import { MatterConnectionService } from '../connection/connection.service';
import { CONNECTION_ROW_ID, MatterConnection } from '../connection/entity';
import { BACKUP_ENTITIES } from '../backup/entities';
import { DeviceAuditService } from '../devices/audit.service';
import { DEVICE_ENTITIES } from '../devices/entities';
import { MatterLifecycleService } from '../devices/lifecycle.service';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { MatterStateService } from '../devices/state.service';
import * as migrations from '../migrations';

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

  async request(operation: string, options?: { params?: { nodeId: string } }): Promise<unknown> {
    this.requests.push(operation);
    if (this.state !== 'connected') throw new SidecarUnavailableError('The Matter sidecar is not connected.');
    if (operation === 'inventory.list') {
      if (this.listDelayMs) await new Promise((resolve) => setTimeout(resolve, this.listDelayMs));
      if (this.list instanceof Error) throw this.list;
      return this.list;
    }
    if (operation === 'fabric.get') {
      return { state: this.fabricId === null ? 'uninitialized' : 'initialized', fabricId: this.fabricId };
    }
    if (operation === 'inventory.get') {
      if (this.list instanceof Error) throw this.list;
      const found = this.list.nodes.find((entry) => entry.nodeId === options?.params?.nodeId);
      if (!found) throw new SidecarClientError('request', 'Unknown node.', { code: 'not_found' });
      return found;
    }
    throw new Error(`unexpected operation ${operation}`);
  }

  onStateChange = () => () => undefined;
  onReconciliationRequired = () => () => undefined;
  onEvent = () => () => undefined;
}

export const unsupportedCapability = () =>
  new SidecarClientError('request', 'Not implemented in this sidecar release.', { code: 'unsupported_capability' });
export const timeoutError = () => new SidecarTimeoutError('timed out');

export async function createHarness() {
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [MatterConnection, ...DEVICE_ENTITIES, ...BACKUP_ENTITIES],
    migrations: Object.values(migrations),
  }).initialize();
  await dataSource.runMigrations();
  // The administrator that system-initiated audit entries are attributed to.
  await dataSource.getRepository(MatterConnection).save({
    id: CONNECTION_ROW_ID,
    url: 'http://127.0.0.1:1',
    encryptedCredential: 'x',
    caCertificate: null,
    credentialUpdatedAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
    updatedBy: 1,
  });
  const audit = jest.fn(async () => ({ status: 'recorded' as const }));
  // Mirrors the host: concurrent callers run one at a time inside a transaction.
  let tail: Promise<unknown> = Promise.resolve();
  const runSerialized = <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(() => dataSource.transaction(work));
    tail = next;
    return next;
  };
  const context = {
    hostVersion: '1.11.0',
    manifest: { id: 'matter', name: 'matter', version: '0.4.0-alpha.0', pluginDirectory: 'matter' },
    logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
    getRepository: (entity: never) => dataSource.getRepository(entity),
    runSerialized,
    audit: { record: audit },
    // A reversible stand-in for the host's encryption, visibly not plaintext.
    secrets: {
      encrypt: (text: string) => `enc:${Buffer.from(text).toString('base64')}`,
      decrypt: (text: string) => Buffer.from(text.slice(4), 'base64').toString(),
    },
  } as unknown as PluginContext;
  const sidecar = new ScriptedSidecar();
  const connectionService = { connection: sidecar } as unknown as MatterConnectionService;
  const auditService = new DeviceAuditService(context);
  const state = new MatterStateService(context);
  const reconciliation = new MatterReconciliationService(context, connectionService, auditService);
  const lifecycle = new MatterLifecycleService(context, connectionService, auditService);
  const actions = () => audit.mock.calls.map((call) => (call as unknown as [{ action: string }])[0].action);
  return {
    dataSource,
    context,
    audit,
    actions,
    sidecar,
    state,
    reconciliation,
    lifecycle,
    reconcile: (list: NodeListView | Error) => {
      sidecar.list = list;
      return reconciliation.request();
    },
    rows: <T extends object>(table: string) => dataSource.query(`SELECT * FROM ${table} ORDER BY 1, 2`) as Promise<T[]>,
    close: () => dataSource.destroy(),
  };
}
export type Harness = Awaited<ReturnType<typeof createHarness>>;
