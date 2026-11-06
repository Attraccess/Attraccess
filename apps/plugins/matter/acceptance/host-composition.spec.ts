import { AuditLog } from '@attraccess/database-entities';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MatterConnectionService } from '../backend/connection/connection.service';
import plugin from '../backend/plugin';
import { FakeSidecar, TOKEN } from '../backend/testing/fake-sidecar';
import { ADMIN, auditRows, bootHost, type Host } from './host.test-utils';

async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('Matter plugin composed with the host', () => {
  let host: Host;
  let fake: FakeSidecar | undefined;
  beforeEach(async () => {
    host = await bootHost();
  }, 60_000);
  afterEach(async () => {
    await host.close();
    await fake?.stop();
    fake = undefined;
  });

  const api = () => request(host.app.getHttpServer());

  it('loads and stays healthy with no sidecar configured', async () => {
    const status = await api().get('/api/matter/connection/status').set(ADMIN).expect(200);
    expect(status.body).toMatchObject({ state: 'not_configured', wireVersion: 1 });
    await api().get('/api/unrelated').expect(200);
  });

  it('is admin-only: other users get 403 on every route', async () => {
    const other = { 'x-test-permissions': 'resources.update' };
    await api().get('/api/matter/connection').set(other).expect(403);
    await api().put('/api/matter/connection').set(other).send({}).expect(403);
    await api().delete('/api/matter/connection').set(other).expect(403);
    await api().get('/api/matter/connection/status').set(other).expect(403);
    await api().get('/api/matter/connection/status').expect(403);
  });

  it('stores the token encrypted, never returns it and audits the change without secrets', async () => {
    fake = await FakeSidecar.start();
    const saved = await api()
      .put('/api/matter/connection')
      .set(ADMIN)
      .send({ url: fake.url, credential: TOKEN })
      .expect(200);
    expect(saved.body).toMatchObject({ url: fake.url, credentialConfigured: true, caCertificate: null });
    expect(JSON.stringify(saved.body)).not.toContain(TOKEN);
    const rows = (await host.db.query('SELECT * FROM plugin_matter_connection')) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
    expect(rows[0]).toMatchObject({ id: 1, updated_by: 7 });
    expect(host.context.secrets.decrypt(rows[0].encrypted_credential as string)).toBe(TOKEN);

    await until(async () => (await api().get('/api/matter/connection/status').set(ADMIN)).body.state === 'connected');
    const read = await api().get('/api/matter/connection').set(ADMIN).expect(200);
    expect(JSON.stringify(read.body)).not.toContain(TOKEN);

    const audit = await auditRows(host.db);
    expect(audit.map((row: AuditLog) => row.action)).toEqual(['matter.connection_saved']);
    expect(JSON.stringify(audit)).not.toMatch(new RegExp(`${TOKEN}|127\\.0\\.0\\.1|Bearer`));
    expect(JSON.stringify(audit)).toContain('credentialChanged');
  });

  it('restores the connection from the database when the plugin loads again, without waiting for the sidecar', async () => {
    fake = await FakeSidecar.start();
    await api().put('/api/matter/connection').set(ADMIN).send({ url: fake.url, credential: TOKEN }).expect(200);
    host.service.connection.stop();
    host.service.connection.configure(null); // ignored once stopped; a fresh load follows
    const started = Date.now();
    const second = await bootHostSharingDatabase(host);
    expect(Date.now() - started).toBeLessThan(5_000);
    await until(() => second.service.connection.status().state === 'connected');
    await second.app.close();
  });

  it('rejects invalid settings with 400 and removes the configuration on DELETE', async () => {
    fake = await FakeSidecar.start();
    await api().put('/api/matter/connection').set(ADMIN).send({ url: 'ftp://x', credential: 'short' }).expect(400);
    await api().put('/api/matter/connection').set(ADMIN).send({ url: fake.url }).expect(400); // first save needs a token
    await api().put('/api/matter/connection').set(ADMIN).send({ url: fake.url, credential: TOKEN }).expect(200);
    await api().delete('/api/matter/connection').set(ADMIN).expect(204);
    expect((await api().get('/api/matter/connection/status').set(ADMIN)).body.state).toBe('not_configured');
    expect(await host.db.query('SELECT * FROM plugin_matter_connection')).toHaveLength(0);
    expect((await auditRows(host.db)).map((row: AuditLog) => row.action)).toEqual([
      'matter.connection_saved',
      'matter.connection_removed',
    ]);
  });

  it('degrades, instead of crashing, on a host that cannot report its version', async () => {
    const old = await bootHost({ hostVersion: undefined });
    await request(old.app.getHttpServer())
      .put('/api/matter/connection')
      .set(ADMIN)
      .send({ url: 'http://127.0.0.1:1', credential: TOKEN })
      .expect(200);
    await until(
      async () =>
        (await request(old.app.getHttpServer()).get('/api/matter/connection/status').set(ADMIN)).body.state ===
        'degraded',
    );
    const status = await request(old.app.getHttpServer()).get('/api/matter/connection/status').set(ADMIN);
    expect(status.body).toMatchObject({ reason: 'incompatible', reasonDetail: 'host version unavailable' });
    await old.close();
  });
});

/** A second load of the plugin against the same database, like a restart of Attraccess. */
async function bootHostSharingDatabase(first: Host): Promise<Host> {
  const moduleRef = await Test.createTestingModule({ imports: [plugin.register(first.context) as never] })
    .overrideGuard(DualAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { ...first, app, service: moduleRef.get(MatterConnectionService) };
}
