import {
  DualAuthGuard,
  EffectivePermissionsGuard,
  validatePluginPermissionsDeclaration,
} from '@attraccess/plugins-backend-sdk';
import { ForbiddenException, Logger, type ExecutionContext, type INestApplication, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MatterBackupService } from './backup/backup.service';
import { MatterBackupController } from './backup/controller';
import { MatterRestoreService } from './backup/restore.service';
import { MatterConnectionService } from './connection/connection.service';
import { MatterConnectionController } from './connection/controller';
import { MatterSettingsService } from './connection/settings.service';
import { MatterDevicesController } from './devices/controller';
import { MatterLifecycleService } from './devices/lifecycle.service';
import { MatterReconciliationService } from './devices/reconciliation.service';
import { MatterStateService } from './devices/state.service';
import { MatterFabricController } from './fabric/controller';
import { MatterFabricService } from './fabric/fabric.service';
import { RecoveryKeyService } from './fabric/recovery-key.service';
import { MATTER_PAGE_PERMISSIONS } from './permission-keys';
import {
  MATTER_OPERATIONS,
  MATTER_PERMISSIONS,
  REQUIRES_CONFIRMATION,
  SESSION_ONLY_OPERATIONS,
  type MatterOperation,
} from './permissions';
import plugin from './plugin';

const ALL_KEYS = MATTER_PERMISSIONS.permissions.map((permission) => permission.key as string);
// The generic plugin-management key that guarded Matter before ATT-1003; it must open nothing here.
const PLUGINS_MANAGE = ['system', 'plugins', 'manage'].join('.');
const ID = '3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f';

// The controllers the plugin actually mounts, so an unlisted controller cannot slip past the coverage test.
const REGISTERED = (plugin.register({} as never).controllers ?? []) as Type[];

type Route = [
  controller: Type,
  handler: string,
  operation: MatterOperation,
  method: 'get' | 'put' | 'post' | 'patch' | 'delete',
  path: string,
];

// Every HTTP route of the plugin, its operation in the permission map, and how to call it.
const ROUTES: Route[] = [
  [MatterConnectionController, 'get', 'connectionSettings', 'get', '/matter/connection'],
  [MatterConnectionController, 'put', 'connectionSave', 'put', '/matter/connection'],
  [MatterConnectionController, 'remove', 'connectionRemove', 'delete', '/matter/connection'],
  [MatterConnectionController, 'reconnect', 'connectionReconnect', 'post', '/matter/connection/reconnect'],
  [MatterConnectionController, 'status', 'connectionStatus', 'get', '/matter/connection/status'],
  [MatterFabricController, 'status', 'fabricStatus', 'get', '/matter/fabric'],
  [MatterFabricController, 'create', 'fabricCreate', 'post', '/matter/fabric/create'],
  [MatterFabricController, 'generateKey', 'recoveryKeyGenerate', 'post', '/matter/fabric/recovery-key'],
  [MatterFabricController, 'acknowledge', 'recoveryKeyAcknowledge', 'post', '/matter/fabric/recovery-key/acknowledge'],
  [MatterFabricController, 'rotate', 'recoveryKeyRotate', 'post', '/matter/fabric/recovery-key/rotate'],
  [MatterFabricController, 'acceptSidecar', 'recoveryAcceptSidecar', 'post', '/matter/recovery/accept-sidecar'],
  [MatterFabricController, 'startNew', 'recoveryStartNew', 'post', '/matter/recovery/start-new'],
  [MatterBackupController, 'list', 'backupList', 'get', '/matter/backups'],
  [MatterBackupController, 'create', 'backupCreate', 'post', '/matter/backups'],
  [MatterBackupController, 'download', 'backupDownload', 'get', `/matter/backups/${ID}/download`],
  [MatterBackupController, 'validate', 'restoreValidate', 'post', '/matter/restore/validate'],
  [MatterBackupController, 'confirm', 'restoreConfirm', 'post', '/matter/restore/confirm'],
  [MatterBackupController, 'cancel', 'restoreCancel', 'post', `/matter/restore/${ID}/cancel`],
  [MatterDevicesController, 'listNodes', 'nodeList', 'get', '/matter/nodes'],
  [MatterDevicesController, 'getNode', 'nodeGet', 'get', `/matter/nodes/${ID}`],
  [MatterDevicesController, 'updateNode', 'nodeUpdate', 'patch', `/matter/nodes/${ID}`],
  [MatterDevicesController, 'claim', 'nodeClaim', 'post', `/matter/nodes/${ID}/claim`],
  [MatterDevicesController, 'relink', 'nodeRelink', 'post', `/matter/nodes/${ID}/relink`],
  [MatterDevicesController, 'repair', 'nodeRepair', 'post', `/matter/nodes/${ID}/repair`],
  [MatterDevicesController, 'archive', 'nodeArchive', 'post', `/matter/nodes/${ID}/archive`],
  [MatterDevicesController, 'restore', 'nodeRestore', 'post', `/matter/nodes/${ID}/restore`],
  [MatterDevicesController, 'forceRemove', 'nodeForceRemove', 'post', `/matter/nodes/${ID}/force-remove`],
  [MatterDevicesController, 'updateEndpoint', 'endpointUpdate', 'patch', `/matter/endpoints/${ID}`],
  [MatterDevicesController, 'endpointState', 'endpointState', 'get', `/matter/endpoints/${ID}/state`],
  [MatterDevicesController, 'reconciliationStatus', 'reconciliationStatus', 'get', '/matter/reconciliation'],
  [MatterDevicesController, 'trigger', 'reconciliationRun', 'post', '/matter/reconciliation'],
];

function guardAllows(controller: Type, handler: string, granted: string[]): boolean {
  const guard = new EffectivePermissionsGuard(new Reflector());
  const context = {
    getHandler: () => controller.prototype[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 1, effectivePermissions: new Set(granted) } }) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

describe('Matter permission declaration', () => {
  it('declares the six Matter and Thread keys with EN/DE texts, granted by default to administrator and resource-manager', () => {
    expect(() => validatePluginPermissionsDeclaration(MATTER_PERMISSIONS)).not.toThrow();
    expect(plugin.permissions).toBe(MATTER_PERMISSIONS);
    expect(ALL_KEYS).toEqual([
      'matter.devices.read',
      'matter.devices.manage',
      'matter.devices.commission',
      'matter.devices.command-direct',
      'thread.network.read',
      'thread.network.manage',
    ]);
    for (const permission of MATTER_PERMISSIONS.permissions) {
      expect(permission.defaultRoles).toEqual(['administrator', 'resource-manager']);
    }
  });

  it('maps every operation only to declared keys, and records the future operations and the confirmation list', () => {
    for (const keys of Object.values(MATTER_OPERATIONS)) {
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(ALL_KEYS).toContain(key);
    }
    expect(MATTER_OPERATIONS.attestationOverride).toEqual(['matter.devices.commission', 'matter.devices.manage']);
    expect(MATTER_OPERATIONS.directCommand).toEqual(['matter.devices.command-direct']);
    expect(MATTER_OPERATIONS.commissioningShare).toEqual(['matter.devices.commission']);
    expect(MATTER_OPERATIONS.otaStatus).toEqual(['matter.devices.read']);
    expect(MATTER_OPERATIONS.otaApprove).toEqual(['matter.devices.manage']);
    expect(MATTER_OPERATIONS.threadStatus).toEqual(['thread.network.read']);
    expect(MATTER_OPERATIONS.threadDatasetExport).toEqual(['thread.network.manage']);
    expect(MATTER_OPERATIONS.developmentOverrides).toEqual(['matter.devices.manage']);
    expect(MATTER_OPERATIONS.liveDeviceState).toEqual(['matter.devices.read']);
    expect(MATTER_OPERATIONS.liveThread).toEqual(['thread.network.read']);
    expect(SESSION_ONLY_OPERATIONS).toEqual(['threadDatasetExport']);
    expect(REQUIRES_CONFIRMATION).toEqual(['unlock', 'unbolt', 'power-on']);
    expect(MATTER_PAGE_PERMISSIONS).toEqual(['matter.devices.read', 'thread.network.read']);
  });
});

describe('Matter route permissions', () => {
  it('lists every registered controller and route handler', () => {
    const covered = new Set(ROUTES.map(([controller, handler]) => `${controller.name}.${handler}`));
    const listed = new Set(ROUTES.map(([controller]) => controller));
    expect(REGISTERED.length).toBe(4);
    for (const controller of REGISTERED) {
      expect(listed).toContain(controller);
      const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
        (name) => name !== 'constructor' && Reflect.getMetadata('path', controller.prototype[name]) !== undefined,
      );
      for (const handler of handlers) expect(covered).toContain(`${controller.name}.${handler}`);
    }
    expect(covered.size).toBe(ROUTES.length);
  });

  it.each(ROUTES)('%p.%s requires the keys of %s', (controller, handler, operation) => {
    const required = [...MATTER_OPERATIONS[operation]] as string[];
    expect(guardAllows(controller, handler, required)).toBe(true);
    expect(
      guardAllows(
        controller,
        handler,
        ALL_KEYS.filter((key) => !required.includes(key)),
      ),
    ).toBe(false);
    expect(guardAllows(controller, handler, [PLUGINS_MANAGE, 'resources.update'])).toBe(false);
  });

  it('keeps status views on read and everything else on manage (D4)', () => {
    const read = ROUTES.filter(([, , operation]) => MATTER_OPERATIONS[operation][0] === 'matter.devices.read');
    expect(read.map(([, , operation]) => operation).sort()).toEqual(
      [
        'backupList',
        'connectionStatus',
        'endpointState',
        'fabricStatus',
        'nodeGet',
        'nodeList',
        'reconciliationStatus',
      ].sort(),
    );
    for (const [, , operation] of ROUTES) {
      expect(MATTER_OPERATIONS[operation]).toHaveLength(1);
      if (!read.some(([, , readOperation]) => readOperation === operation)) {
        expect(MATTER_OPERATIONS[operation]).toEqual(['matter.devices.manage']);
      }
    }
  });
});

// A value every stubbed service returns. A denied response must never carry it.
const LEAK = 'LEAK-SENTINEL-inventory-state-credential-recovery-key-backup-setup-payload';
const LIFECYCLE = new Set(['then', 'constructor', 'onModuleInit', 'onModuleDestroy', 'onApplicationBootstrap']);

/** A service stand-in: every property is callable and records the call before returning the sentinel. */
function stub(name: string, calls: string[]): unknown {
  return new Proxy(
    function stubbed() {
      return undefined;
    },
    {
      get: (_target, property) => {
        if (typeof property !== 'string' || LIFECYCLE.has(property) || property.startsWith('before')) return undefined;
        return stub(`${name}.${property}`, calls);
      },
      apply: () => {
        calls.push(name);
        return { secret: LEAK, filename: 'backup.bin', file: Buffer.from(LEAK) };
      },
    },
  );
}

type Principal = { label: string; allowed: boolean; headers: (required: string[]) => Record<string, string> };

const without = (required: string[]) => ALL_KEYS.filter((key) => !required.includes(key)).concat(PLUGINS_MANAGE);

// Effective permissions of an API token are its scope intersected with the owner's current permissions, as the host's
// session strategy computes them. The harness guard below does the same.
const PRINCIPALS: Principal[] = [
  { label: 'session user with the key', allowed: true, headers: (required) => ({ owner: required.join(',') }) },
  {
    label: 'session user without the key',
    allowed: false,
    headers: (required) => ({ owner: without(required).join(',') }),
  },
  {
    label: 'API token with the key',
    allowed: true,
    headers: (required) => ({ token: 'yes', owner: ALL_KEYS.join(','), scope: required.join(',') }),
  },
  {
    label: 'API token without the key',
    allowed: false,
    headers: (required) => ({ token: 'yes', owner: ALL_KEYS.join(','), scope: without(required).join(',') }),
  },
  {
    label: 'API token whose owner lost the key',
    allowed: false,
    headers: (required) => ({ token: 'yes', owner: without(required).join(','), scope: required.join(',') }),
  },
];

const list = (value: string | undefined) => (value ?? '').split(',').filter(Boolean);

describe('Matter routes over HTTP', () => {
  let app: INestApplication;
  const calls: string[] = [];

  beforeAll(async () => {
    const services: Type[] = [
      MatterSettingsService,
      MatterConnectionService,
      MatterFabricService,
      RecoveryKeyService,
      MatterBackupService,
      MatterRestoreService,
      MatterLifecycleService,
      MatterReconciliationService,
      MatterStateService,
    ];
    const moduleRef = await Test.createTestingModule({
      controllers: REGISTERED,
      providers: services.map((service) => ({ provide: service, useValue: stub(service.name, calls) })),
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (execution: ExecutionContext) => {
          const req = execution.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
          const owner = new Set(list(req.headers['owner']));
          const viaToken = req.headers['token'] === 'yes';
          const effective = viaToken ? list(req.headers['scope']).filter((key) => owner.has(key)) : [...owner];
          req.user = {
            id: 7,
            authenticationMethod: viaToken ? 'api-token' : 'session',
            ...(viaToken ? { apiTokenId: 99 } : {}),
            effectivePermissions: new Set(effective),
          };
          return true;
        },
      })
      .compile();
    moduleRef.useLogger(false);
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    Logger.flush();
  });

  const cases = ROUTES.flatMap(([, , operation, method, path]) =>
    PRINCIPALS.map((principal) => [method.toUpperCase(), path, principal.label, operation, method, principal] as const),
  );

  it.each(cases)('%s %s as %s', async (_verb, path, _label, operation, method, principal) => {
    calls.length = 0;
    const required = [...MATTER_OPERATIONS[operation]] as string[];
    const response = await request(app.getHttpServer())[method](path).set(principal.headers(required)).send({});
    if (principal.allowed) {
      expect([401, 403]).not.toContain(response.status);
      return;
    }
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ statusCode: 403, message: 'Insufficient permissions', error: 'Forbidden' });
    expect(JSON.stringify(response.body)).not.toContain('LEAK-SENTINEL');
    // The deny runs before any service, so no sidecar call and no database read happened.
    expect(calls).toEqual([]);
  });
});
