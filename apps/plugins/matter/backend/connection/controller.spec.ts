import type { AuthenticatedRequest, PluginContext } from '@attraccess/plugins-backend-sdk';
import { BadRequestException } from '@nestjs/common';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar';
import { selfSignedCertificate } from '../testing/certs';
import { MatterConnectionController } from './controller';
import { MatterConnectionService } from './connection.service';
import { CONNECTION_ROW_ID, MatterConnection } from './entity';
import { MatterSettingsService } from './settings.service';

type Row = MatterConnection;

function fakeContext(options: { audit?: boolean; hostVersion?: string | undefined } = {}) {
  let row: Row | null = null;
  const repository = {
    findOneBy: async () => (row ? { ...row } : null),
    save: async (value: Row) => {
      row = { ...value };
      return value;
    },
    delete: async () => {
      const affected = row ? 1 : 0;
      row = null;
      return { affected };
    },
  };
  const audit = jest.fn(async () => ({ status: 'recorded' as const }));
  const log = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  const context = {
    hostVersion: 'hostVersion' in options ? options.hostVersion : HOST_VERSION,
    manifest: { id: 'matter', name: 'matter', version: entry.plugin, pluginDirectory: 'matter' },
    logger: log,
    getRepository: () => repository,
    // A reversible stand-in for the host's encryption, visibly not plaintext.
    secrets: {
      encrypt: (text: string) => `enc:${Buffer.from(text).toString('base64')}`,
      decrypt: (text: string) => Buffer.from(text.slice(4), 'base64').toString(),
    },
    ...(options.audit === false ? {} : { audit: { record: audit } }),
  } as unknown as PluginContext;
  return { context, audit, log, getRow: () => row, setRow: (next: Row | null) => (row = next) };
}

const request = (extra: Record<string, unknown> = {}) =>
  ({ user: { id: 7, authenticationMethod: 'session', ...extra } }) as unknown as AuthenticatedRequest;

async function setup(options: Parameters<typeof fakeContext>[0] = {}) {
  const harness = fakeContext(options);
  const settings = new MatterSettingsService(harness.context);
  const service = new MatterConnectionService(harness.context, settings);
  const controller = new MatterConnectionController(settings, service);
  return { ...harness, settings, service, controller };
}

async function until(predicate: () => boolean, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Matter connection settings API', () => {
  let fake: FakeSidecar | undefined;
  let service: MatterConnectionService | undefined;
  afterEach(async () => {
    service?.onModuleDestroy();
    await fake?.stop();
    fake = undefined;
    service = undefined;
  });

  it('returns an empty view before configuration and never starts a connection', async () => {
    const harness = await setup();
    service = harness.service;
    await harness.service.onModuleInit();
    expect(await harness.controller.get()).toEqual({
      url: null,
      credentialConfigured: false,
      credentialUpdatedAt: null,
      caCertificate: null,
      updatedAt: null,
    });
    expect(harness.controller.status()).toMatchObject({ state: 'not_configured', wireVersion: 1 });
  });

  it('saves the settings, encrypts the credential, reconnects at once and never returns the credential', async () => {
    fake = await FakeSidecar.start();
    const harness = await setup();
    service = harness.service;
    const saved = await harness.controller.put({ url: `${fake.url}/`, credential: TOKEN }, request());
    expect(saved).toMatchObject({ url: fake.url, credentialConfigured: true, caCertificate: null });
    expect(JSON.stringify(saved)).not.toContain(TOKEN);
    const stored = harness.getRow() as Row;
    expect(stored.encryptedCredential).not.toContain(TOKEN);
    expect(stored).toMatchObject({ id: CONNECTION_ROW_ID, updatedBy: 7 });
    await until(() => harness.controller.status().state === 'connected');
    expect(JSON.stringify(await harness.controller.get())).not.toContain(TOKEN);
    expect(JSON.stringify(harness.controller.status())).not.toContain(TOKEN);
  });

  it('keeps the credential when it is omitted and clears the CA only when told to', async () => {
    const harness = await setup();
    service = harness.service;
    const { cert } = await selfSignedCertificate();
    await harness.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN, caCertificate: cert }, request());
    const first = harness.getRow() as Row;
    await harness.controller.put({ url: 'http://127.0.0.1:2' }, request());
    expect(harness.getRow()).toMatchObject({
      url: 'http://127.0.0.1:2',
      encryptedCredential: first.encryptedCredential,
      caCertificate: cert,
      credentialUpdatedAt: first.credentialUpdatedAt,
    });
    await harness.controller.put({ url: 'http://127.0.0.1:2', caCertificate: null }, request());
    expect(harness.getRow()?.caCertificate).toBeNull();
  });

  it('requires a credential for the first configuration and rejects invalid input without echoing it', async () => {
    const harness = await setup();
    service = harness.service;
    await expect(harness.controller.put({ url: 'http://127.0.0.1:1' }, request())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const failure = await harness.controller
      .put({ url: 'ftp://x', credential: 'not-a-valid token' }, request())
      .catch((error) => error);
    expect(failure).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(failure.getResponse())).not.toContain('not-a-valid token');
    expect(harness.getRow()).toBeNull();
  });

  it('removes the configuration, stops the client and reports not_configured', async () => {
    fake = await FakeSidecar.start();
    const harness = await setup();
    service = harness.service;
    await harness.controller.put({ url: fake.url, credential: TOKEN }, request());
    await until(() => harness.controller.status().state === 'connected');
    await harness.controller.remove(request());
    expect(harness.controller.status().state).toBe('not_configured');
    expect(harness.getRow()).toBeNull();
    await until(() => fake?.sockets.size === 0);
  });

  it('audits changes with flags only, and skips silently on a host without audit support', async () => {
    const harness = await setup();
    service = harness.service;
    await harness.controller.put({ url: 'https://matter.example/prefix', credential: TOKEN }, request());
    await harness.controller.remove(request({ authenticationMethod: 'api-token', apiTokenId: 3 }));
    expect(harness.audit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'matter.connection_saved',
        outcome: 'succeeded',
        principal: { userId: 7, authenticationMethod: 'session' },
        subject: { type: 'matter.connection', id: 1 },
        details: { credentialChanged: true, caChanged: false, scheme: 'https' },
      }),
    );
    expect(harness.audit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'matter.connection_removed',
        principal: { userId: 7, authenticationMethod: 'api-token', apiTokenId: 3 },
      }),
    );
    expect(JSON.stringify(harness.audit.mock.calls)).not.toMatch(new RegExp(`${TOKEN}|matter\\.example|enc:`));

    const old = await setup({ audit: false });
    await expect(
      old.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN }, request()),
    ).resolves.toBeDefined();
    old.service.onModuleDestroy();
  });

  it('audits a saved or removed configuration even when reconnecting fails', async () => {
    const harness = await setup();
    service = harness.service;
    jest.spyOn(harness.service, 'reload').mockRejectedValue(new Error('reload failed'));
    await expect(harness.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN }, request())).rejects.toThrow(
      'reload failed',
    );
    await expect(harness.controller.remove(request())).rejects.toThrow('reload failed');
    expect(harness.audit).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: 'matter.connection_saved' }));
    expect(harness.audit).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: 'matter.connection_removed' }));
  });

  it('survives a failing audit sink', async () => {
    const harness = await setup();
    service = harness.service;
    harness.audit.mockRejectedValueOnce(new Error('audit down'));
    await expect(
      harness.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN }, request()),
    ).resolves.toBeDefined();
    expect(harness.log.warn).toHaveBeenCalled();
  });

  it('loads saved settings on startup without waiting for the sidecar', async () => {
    const harness = await setup();
    service = harness.service;
    harness.setRow({
      id: 1,
      url: 'http://127.0.0.1:1',
      encryptedCredential: harness.context.secrets.encrypt(TOKEN),
      caCertificate: null,
      credentialUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 1,
    });
    const started = Date.now();
    await harness.service.onModuleInit();
    expect(Date.now() - started).toBeLessThan(500);
    expect(harness.controller.status().state).toBe('connecting');
  });

  it('reports an undecryptable stored credential as misconfigured instead of failing to load', async () => {
    const harness = await setup();
    service = harness.service;
    harness.setRow({
      id: 1,
      url: 'http://127.0.0.1:1',
      encryptedCredential: 'enc:%%%',
      caCertificate: null,
      credentialUpdatedAt: '',
      updatedAt: '',
      updatedBy: null,
    });
    (harness.context.secrets as unknown as { decrypt: () => string }).decrypt = () => {
      throw new Error('bad key');
    };
    await harness.service.onModuleInit();
    expect(harness.controller.status()).toMatchObject({ state: 'degraded', reason: 'misconfigured' });
  });

  it('keeps the plugin loaded when the database read fails', async () => {
    const harness = await setup();
    service = harness.service;
    jest.spyOn(harness.settings, 'clientConfig').mockRejectedValue(new Error('no such table'));
    await expect(harness.service.onModuleInit()).resolves.toBeUndefined();
    expect(harness.log.error).toHaveBeenCalled();
  });

  it('degrades to incompatible, and does not crash, on a host without hostVersion', async () => {
    const harness = await setup({ hostVersion: undefined });
    service = harness.service;
    await harness.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN }, request());
    await until(() => harness.controller.status().state === 'degraded');
    expect(harness.controller.status()).toMatchObject({
      reason: 'incompatible',
      reasonDetail: 'host version unavailable',
    });
  });

  it('guards every route with system.plugins.manage and documents the permission follow-up', () => {
    const source = readFileSync(join(__dirname, 'controller.ts'), 'utf8');
    expect(source).toContain('// TODO(ATT-1003): replace system.plugins.manage with a dedicated Matter permission');
    expect(source).toContain("@Auth('system.plugins.manage')");
    expect(source.match(/@Auth\(/g)).toHaveLength(1); // class level: no route can skip it
    expect(COMPATIBILITY_TABLE).toHaveLength(1);
  });
});
