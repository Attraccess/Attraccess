import 'reflect-metadata';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { WagoManagementEntity } from '../backend/wago-management.entity';
import { managementKeyCommand } from '../backend/wago-management-shell';
import type { ManagementRecord } from '../backend/wago-management.types';
import { EventEmitter } from 'node:events';
import * as processes from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DualAuthGuard, type PluginContext } from '@attraccess/plugins-backend-sdk';
import type { Request, Response, NextFunction } from 'express';
import plugin from '../backend/plugin';
import { WagoRuntimeArtifactCatalog, WagoRuntimeArtifactsService } from '../backend/wago-runtime-artifacts';
import { WagoArtifactsController } from '../backend/wago-artifacts.controller';
import { WagoControllerApi } from '../backend/wago.controller';
import { WagoCommissioningService } from '../backend/wago-commissioning.service';
import { WagoCommissioningSession } from '../backend/wago-commissioning-session.entity';
import { WagoController } from '../backend/wago-controller.entity';
import { WagoService } from '../backend/wago.service';
import { MANAGEMENT_INSPECTION_COMMAND } from '../backend/wago-management-inspection';
import { signingFixture } from './commissioning-signing-fixture';

export async function commissioningFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wago-commissioning-acceptance-'));
  const signing = signingFixture();
  const first = signing.release('0.1.0');
  const second = signing.release('0.2.0');
  const catalog = new WagoRuntimeArtifactCatalog(join(directory, 'catalog'), signing.trustedKey);
  const database = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: plugin.entities,
    synchronize: true,
  });
  let app: INestApplication | undefined;
  let spawn: jest.SpyInstance | undefined;
  async function close() {
    try {
      await app?.close();
    } finally {
      try {
        await catalog.onModuleDestroy();
        if (database.isInitialized) await database.destroy();
      } finally {
        spawn?.mockRestore();
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
  try {
    await database.initialize();
    const fingerprint = `SHA256:${'A'.repeat(43)}`;
    const processesSeen: string[] = [];
    // Fail closed before any OS process can reach SSH, hardware, or a shared broker.
    spawn = jest.spyOn(jest.requireActual<typeof processes>('node:child_process'), 'spawn').mockImplementation(((
      command: string,
    ) => {
      processesSeen.push(command);
      if (!['ssh-keyscan', 'ssh-keygen'].includes(command)) throw new Error(`Forbidden fixture process: ${command}`);
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: jest.fn(),
        stdin: Object.assign(new EventEmitter(), { end: jest.fn() }),
      });
      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          command === 'ssh-keyscan' ? `10.99.0.7 ssh-ed25519 ${signing.trustedKey}\n` : `256 ${fingerprint} fixture\n`,
        );
        child.emit('close', 0);
      });
      return child;
    }) as unknown as typeof processes.spawn);
    let discovery: ((controller: WagoController) => Promise<void>) | undefined;
    const wago = {
      registerCommissioningDiscoveryHandler: (handler: typeof discovery) => {
        discovery = handler;
      },
      list: () => database.getRepository(WagoController).find(),
      getSettings: async () => ({ defaultMqttServerId: 1 }),
      createEnrollment: jest.fn(async () => ({
        id: 7,
        username: 'fixture-enrollment',
        password: 'fixture-bootstrap',
        claimSecret: 'fixture-claim',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
      revokeEnrollmentById: jest.fn(async () => undefined),
      claim: jest.fn(async () => undefined),
    };
    const encryptionKey = randomBytes(32);
    const secrets = {
      encrypt(value: string) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
      },
      decrypt(value: string) {
        const bytes = Buffer.from(value, 'base64');
        const cipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
        cipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
      },
    };
    const context = {
      getRepository: ((entity) => database.getRepository(entity)) as PluginContext['getRepository'],
      secrets,
      logger: { warn: jest.fn() },
      // Audit persistence belongs to the separate audit acceptance owner.
      audit: { record: jest.fn(async () => ({ status: 'recorded' })) },
      getMqttServerConfig: async () => ({ host: 'broker.fixture.invalid', port: 8883, useTls: true }),
      getMqttCredentialProvisioning: () => ({ availableProviders: async () => [{ providerId: 'fixture' }] }),
    } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, wago as unknown as WagoService, catalog);
    const transport = {
      failDelivery: true,
      failRecovery: true,
      copies: [] as string[],
      recoveryCalls: 0,
      platformCalls: 0,
      managementCalls: 0,
      managementMutations: 0,
      failManagementRecovery: true,
    };
    service['inspect'] = async () => ({
      firmware: 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="31"',
      codesys: 'inactive',
    });
    service['sudoRunScript'] = async (_host, _fingerprint, _credential, script) => {
      if (script.includes('version=1') && script.includes('platform=')) {
        transport.platformCalls++;
        return 'version=1\nplatform=supported\nhardware=accessible\nexclusivity=clear\ndocker=running\nconfigDocker=present\nprovision=none\nqualification=required\n';
      }
      if (script.includes('rollback retained')) {
        transport.recoveryCalls++;
        if (transport.failRecovery) throw new Error('Fixture snapshot temporarily unavailable');
      }
      return '';
    };
    service['run'] = async (_host, _fingerprint, _credential, command) => {
      if (command !== MANAGEMENT_INSPECTION_COMMAND) {
        const row = await database.getRepository(WagoManagementEntity).findOneByOrFail({ controllerId: 91058 });
        if (!row.metadataJson) throw new Error('Missing durable management metadata');
        const record: ManagementRecord = JSON.parse(row.metadataJson);
        const tx = record.transaction;
        if (!tx) throw new Error('Missing durable management transaction');
        const prepare = managementKeyCommand('prepare', tx.id);
        const rollback = managementKeyCommand('rollback', tx.id);
        if (command !== prepare && command !== rollback) throw new Error('Unexpected fixture management command');
        transport.managementMutations++;
        if (command === prepare || transport.failManagementRecovery)
          throw new Error('Fixture management connection interrupted');
        return 'OK\n';
      }
      transport.managementCalls++;
      return 'BEGIN=1\nMODEL=cc100\nFW=31\nUID=10001\nSSH=openssh\nCONTROL=sysv\nSOCKETS=tcp\nSOCKETS=tcp6\nSOCKETS=udp\nSOCKETS=udp6\nPORT=0016\nPORT=01BB\nEND=1\n';
    };
    service['copyTo'] = async (_host, _fingerprint, _credential, source, _script, progress) => {
      const bytes = await readFile(source);
      transport.copies.push(bytes.toString('base64'));
      progress(40);
      if (transport.failDelivery) throw new Error('Fixture delivery interrupted');
    };
    await service.onApplicationBootstrap();
    const module = await Test.createTestingModule({
      controllers: [WagoArtifactsController, WagoControllerApi],
      providers: [
        { provide: WagoRuntimeArtifactsService, useValue: catalog },
        { provide: WagoCommissioningService, useValue: service },
        { provide: WagoService, useValue: wago },
        { provide: Symbol.for('attraccess.plugin.context'), useValue: context },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, {
        user: { id: 42, effectivePermissions: new Set(['system.settings.manage', 'resources.update']) },
      });
      next();
    });
    async function discover() {
      const session = await database.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 });
      const now = new Date().toISOString();
      const controller = await database.getRepository(WagoController).save({
        id: 91058,
        hardwareId: session.hardwareId,
        name: session.controllerName,
        mqttServerId: 1,
        enrollmentId: session.enrollmentId,
        trustState: 'claimed',
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: '[]',
        lastSequence: 0,
        lastSeenAt: now,
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now,
      });
      if (!discovery) throw new Error('Discovery transport was not registered');
      await discovery(controller);
    }
    app.use('/fixture', async (req: Request, res: Response) => {
      try {
        if (req.method !== 'POST') return res.sendStatus(405);
        if (req.path === '/reset') {
          await catalog.onModuleDestroy();
          await rm(join(directory, 'catalog'), { recursive: true, force: true });
          await database.synchronize(true);
          transport.failDelivery = true;
          transport.failRecovery = true;
          transport.failManagementRecovery = true;
          transport.managementMutations = 0;
          transport.copies = [];
        } else if (req.path === '/allow-recovery') transport.failRecovery = false;
        else if (req.path === '/allow-management-recovery') transport.failManagementRecovery = false;
        else if (req.path === '/allow-delivery') transport.failDelivery = false;
        else if (req.path === '/discover') await discover();
        else return res.sendStatus(404);
        return res.json({ fixture: true });
      } catch {
        return res.sendStatus(500);
      }
    });
    await app.listen(0, '127.0.0.1');
    for (const [name, release] of [
      ['first', first],
      ['second', second],
    ] as const)
      for (const [extension, data] of [
        ['tar', release.bundle],
        ['sha256', release.checksum],
        ['sig', release.signature],
      ] as const)
        await writeFile(join(directory, `${name}.${extension}`), data);
    await writeFile(join(directory, 'invalid.sig'), signingFixture().release('0.1.0').signature);
    return {
      app,
      url: await app.getUrl(),
      directory,
      catalog,
      service,
      database,
      transport,
      first,
      second,
      fingerprint,
      discover,
      processesSeen,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
