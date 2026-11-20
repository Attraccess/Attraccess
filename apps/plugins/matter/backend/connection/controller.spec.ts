import {
  createInMemoryPluginStorage,
  type AuthenticatedRequest,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar.test-utils';
import { selfSignedCertificate } from '../testing/certs';
import { MatterFabricGuard } from '../fabric/guard';
import { MatterConnectionController } from './controller';
import { MatterConnectionService } from './connection.service';
import { matterStorage } from '../plugin-storage/access';
import { MATTER_STORAGE } from '../plugin-storage/tables';
import { CONNECTION_ROW_ID, type MatterConnection } from './entity';
import { MatterSettingsService } from './settings.service';
import { MAX_URL_LENGTH } from './validation';

type Row = MatterConnection;

function fakeContext(options: { audit?: boolean; hostVersion?: string | undefined } = {}) {
  const fake = createInMemoryPluginStorage(MATTER_STORAGE);
  const audit = jest.fn(async () => ({ status: 'recorded' as const }));
  const log = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  const context = {
    hostVersion: 'hostVersion' in options ? options.hostVersion : HOST_VERSION,
    manifest: { id: 'matter', name: 'matter', version: entry.plugin, pluginDirectory: 'matter' },
    logger: log,
    storage: fake.storage,
    persistence: fake.persistence,
    // A reversible stand-in for the host's encryption, visibly not plaintext.
    secrets: {
      encrypt: (text: string) => `enc:${Buffer.from(text).toString('base64')}`,
      decrypt: (text: string) => Buffer.from(text.slice(4), 'base64').toString(),
    },
    ...(options.audit === false ? {} : { audit: { record: audit } }),
  } as unknown as PluginContext;
  const { connection } = matterStorage(context).tables;
  return {
    context,
    audit,
    log,
    getRow: (): Promise<Row | null> => connection.get(CONNECTION_ROW_ID),
    setRow: async (next: Row | null) => {
      await connection.delete({ id: CONNECTION_ROW_ID });
      if (next) await connection.insert(next);
    },
  };
}

const request = (extra: Record<string, unknown> = {}) =>
  ({ user: { id: 7, authenticationMethod: 'session', ...extra } }) as unknown as AuthenticatedRequest;

async function setup(options: Parameters<typeof fakeContext>[0] = {}) {
  const harness = fakeContext(options);
  const settings = new MatterSettingsService(harness.context);
  const service = new MatterConnectionService(harness.context, settings);
  const guard = new MatterFabricGuard();
  const controller = new MatterConnectionController(settings, service, guard);
  return { ...harness, settings, service, controller, guard };
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
    const stored = (await harness.getRow()) as Row;
    expect(stored.encryptedCredential).not.toContain(TOKEN);
    expect(stored).toMatchObject({ id: CONNECTION_ROW_ID, updatedBy: 7 });
    await until(() => harness.controller.status().state === 'connected');
    expect(JSON.stringify(await harness.controller.get())).not.toContain(TOKEN);
    expect(JSON.stringify(harness.controller.status())).not.toContain(TOKEN);
  });

  it('stores a URL longer than 255 characters up to the validated maximum', async () => {
    const harness = await setup();
    service = harness.service;
    // A reverse-proxy path prefix: the URL is valid (at most MAX_URL_LENGTH) but longer than a bounded string field.
    const url = `http://127.0.0.1:1/${'p'.repeat(MAX_URL_LENGTH - 'http://127.0.0.1:1/'.length)}`;
    await harness.controller.put({ url, credential: TOKEN }, request());
    expect((await harness.getRow())?.url).toBe(url);
  });

  it('keeps the credential when it is omitted and the URL and CA stay the same', async () => {
    const harness = await setup();
    service = harness.service;
    const { cert } = await selfSignedCertificate();
    await harness.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN, caCertificate: cert }, request());
    const first = (await harness.getRow()) as Row;
    // The same URL in another spelling, and the CA omitted (kept) or sent unchanged.
    await harness.controller.put({ url: 'HTTP://127.0.0.1:1/' }, request());
    await harness.controller.put({ url: 'http://127.0.0.1:1', caCertificate: cert }, request());
    expect(await harness.getRow()).toMatchObject({
      url: 'http://127.0.0.1:1',
      encryptedCredential: first.encryptedCredential,
      caCertificate: cert,
      credentialUpdatedAt: first.credentialUpdatedAt,
    });
    await harness.controller.put({ url: 'http://127.0.0.1:2', credential: TOKEN, caCertificate: null }, request());
    expect(await harness.getRow()).toMatchObject({ url: 'http://127.0.0.1:2', caCertificate: null });
  });

  it.each([
    ['the URL', { url: 'https://attacker.example' }],
    ['the path prefix', { url: 'http://127.0.0.1:1/other' }],
    ['the CA certificate', { url: 'http://127.0.0.1:1', caCertificate: 'other' }],
    ['a cleared CA certificate', { url: 'http://127.0.0.1:1', caCertificate: null }],
  ] as Array<[string, { url: string; caCertificate?: string | null }]>)(
    'refuses to reuse the stored credential for a changed endpoint: %s',
    async (_case, change) => {
      const harness = await setup();
      service = harness.service;
      const { cert } = await selfSignedCertificate();
      const other = (await selfSignedCertificate()).cert;
      await harness.controller.put({ url: 'http://127.0.0.1:1', credential: TOKEN, caCertificate: cert }, request());
      const before = { ...((await harness.getRow()) as Row) };
      harness.audit.mockClear();
      const body = change.caCertificate === 'other' ? { ...change, caCertificate: other } : change;
      const failure = await harness.controller.put(body, request()).catch((error) => error);
      expect(failure).toBeInstanceOf(BadRequestException);
      expect(failure.getResponse()).toMatchObject({
        message: ['credential: Enter the credential again when changing the URL or the CA certificate.'],
      });
      expect(await harness.getRow()).toEqual(before);
      expect(harness.audit).not.toHaveBeenCalled();
      // With the credential entered again, the same change is saved.
      await expect(harness.controller.put({ ...body, credential: TOKEN }, request())).resolves.toBeDefined();
    },
  );

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
    expect(await harness.getRow()).toBeNull();
  });

  it('removes the configuration, stops the client and reports not_configured', async () => {
    fake = await FakeSidecar.start();
    const harness = await setup();
    service = harness.service;
    await harness.controller.put({ url: fake.url, credential: TOKEN }, request());
    await until(() => harness.controller.status().state === 'connected');
    await harness.controller.remove(request());
    expect(harness.controller.status().state).toBe('not_configured');
    expect(await harness.getRow()).toBeNull();
    await until(() => fake?.sockets.size === 0);
  });

  it('retries now: reconnects with the saved settings, audits it and never touches them', async () => {
    fake = await FakeSidecar.start();
    const harness = await setup();
    service = harness.service;
    await harness.controller.put({ url: fake.url, credential: TOKEN }, request());
    await until(() => harness.controller.status().state === 'connected');
    // The sidecar goes away: the connection is degraded and waits for its next backoff step.
    await fake.stop();
    fake = undefined;
    await until(() => harness.controller.status().state !== 'connected');
    const saved = await harness.getRow();
    const reload = jest.spyOn(harness.service, 'reload');
    harness.audit.mockClear();

    const status = await harness.controller.reconnect(request());

    expect(reload).toHaveBeenCalledTimes(1);
    // Right after the reload the connection is trying again; the sidecar is still down, so never `connected`.
    expect(['connecting', 'degraded']).toContain(status.state);
    expect(await harness.getRow()).toEqual(saved);
    expect(harness.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'matter.connection_reconnect_requested',
        subject: { type: 'matter.connection', id: 1 },
        principal: { userId: 7, authenticationMethod: 'session' },
      }),
    );
  });

  it('leaves a healthy connection alone: no reconnect and no audit entry', async () => {
    fake = await FakeSidecar.start();
    const harness = await setup();
    service = harness.service;
    await harness.controller.put({ url: fake.url, credential: TOKEN }, request());
    await until(() => harness.controller.status().state === 'connected');
    const reload = jest.spyOn(harness.service, 'reload');
    harness.audit.mockClear();

    const status = await harness.controller.reconnect(request());

    expect(status.state).toBe('connected');
    expect(reload).not.toHaveBeenCalled();
    expect(harness.audit).not.toHaveBeenCalled();
  });

  it('refuses to retry while a fabric operation runs, so its sidecar requests are not cut off', async () => {
    const harness = await setup();
    service = harness.service;
    const reload = jest.spyOn(harness.service, 'reload');
    harness.guard.busy = true;
    await expect(harness.controller.reconnect(request())).rejects.toBeInstanceOf(ConflictException);
    harness.guard.busy = false;
    harness.guard.restoring = true;
    await expect(harness.controller.reconnect(request())).rejects.toBeInstanceOf(ConflictException);
    expect(reload).not.toHaveBeenCalled();
    expect(harness.audit).not.toHaveBeenCalled();
  });

  it('retries now without a configuration: stays not_configured', async () => {
    const harness = await setup();
    service = harness.service;
    const status = await harness.controller.reconnect(request());
    expect(status.state).toBe('not_configured');
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
    await harness.setRow({
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
    await harness.setRow({
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

  it('guards every route with its key from the Matter permission map (see permissions.spec.ts)', () => {
    const source = readFileSync(join(__dirname, 'controller.ts'), 'utf8');
    expect(source.match(/@Auth\(\.\.\.MATTER_OPERATIONS\./g)).toHaveLength(
      source.match(/@(Get|Put|Post|Delete)\(/g)?.length ?? -1,
    );
    expect(COMPATIBILITY_TABLE).toHaveLength(1);
  });
});
