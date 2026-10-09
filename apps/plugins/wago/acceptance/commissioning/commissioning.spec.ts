import { Readable } from 'node:stream';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { commissioningFixture } from './fixture';

describe('bundled runtime commissioning through real controllers and services (fixture transports only)', () => {
  let fixture: Awaited<ReturnType<typeof commissioningFixture>>;
  beforeEach(async () => {
    fixture = await commissioningFixture();
  });
  afterEach(async () => {
    await fixture?.close();
  });

  async function deployFixtureRelease(release = fixture.first) {
    return fixture.catalog.import({
      bundle: Readable.from([release.bundle]),
      checksum: Readable.from([release.checksum]),
    });
  }
  async function create() {
    return (
      await request(fixture.app.getHttpServer())
        .post('/api/wago/commissioning/sessions')
        .send({
          mqttServerId: 1,
          targetHost: '10.99.0.7',
          name: 'Acceptance fixture',
        })
        .expect(201)
    ).body;
  }
  const credential = { username: 'operator', password: 'fixture-password' };
  const attempt = { confirmInstall: true, temporarySsh: credential };

  it('keeps browser fixture controls explicit and resets transport and database state', async () => {
    const server = fixture.app.getHttpServer();
    await request(server).get('/fixture/reset').expect(405);
    await request(server).post('/fixture/unknown').expect(404);
    await request(server).post('/fixture/discover').expect(500);
    await request(server).post('/fixture/allow-delivery').expect(200);
    await request(server).post('/fixture/allow-recovery').expect(200);
    await request(server).post('/fixture/allow-management-recovery').expect(200);
    expect(fixture.transport.failDelivery).toBe(false);
    expect(fixture.transport.failRecovery).toBe(false);
    expect(fixture.transport.failManagementRecovery).toBe(false);
    await request(server).post('/fixture/reset').expect(200);
    expect(fixture.transport.failDelivery).toBe(true);
    expect(fixture.transport.failRecovery).toBe(true);
    expect(fixture.transport.failManagementRecovery).toBe(true);
    expect(fixture.transport.copies).toEqual([]);
    expect((await fixture.catalog.current())?.digest).toBe(fixture.first.digest);
  });

  it('exposes the bundled release and rejects custom runtime uploads', async () => {
    const server = fixture.app.getHttpServer();
    const original = (await request(server).get('/api/wago/runtime-artifacts/current').expect(200)).body;
    expect(original.digest).toBe(fixture.first.digest);
    await request(server)
      .post('/api/wago/runtime-artifacts/import')
      .attach('bundle', fixture.second.bundle, 'runtime.tar')
      .attach('checksum', fixture.second.checksum, 'runtime.tar.sha256')
      .expect(404);
    expect((await request(server).get('/api/wago/runtime-artifacts/current').expect(200)).body).toEqual(original);
    expect(JSON.stringify(original)).not.toContain(fixture.directory);
  });

  it('uses the current release after session creation through failed delivery and retry', async () => {
    const session = await create();
    expect(session).toMatchObject({
      runtimeArtifactDigest: null,
      state: 'awaiting_identity_confirmation',
    });
    expect(session).not.toHaveProperty('pairingCode');
    await deployFixtureRelease(fixture.second);
    const endpoint = `/api/wago/commissioning/sessions/${session.id}`;
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/confirm-host-key`)
      .send({ hostKeyFingerprint: fixture.fingerprint })
      .expect(201);
    const inspected = (
      await request(fixture.app.getHttpServer())
        .post(`${endpoint}/platform/inspect`)
        .send({ temporarySsh: credential })
        .expect(201)
    ).body;
    expect(JSON.parse(inspected.platformReport)).toMatchObject({
      docker: 'running',
      qualification: 'software-supported',
    });
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/deliver`)
      .send({ temporarySsh: credential })
      .expect(400);
    expect(fixture.transport.copies).toHaveLength(0);
    const failed = (await request(fixture.app.getHttpServer()).post(`${endpoint}/deliver`).send(attempt).expect(201))
      .body;
    expect(failed).toMatchObject({
      state: 'delivery_failed',
      runtimeRecoveryAvailable: true,
      runtimeArtifactDigest: fixture.second.digest,
    });
    expect(fixture.transport.copies).toEqual([fixture.second.bundle.toString('base64')]);
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/recover`)
      .send({ temporarySsh: credential })
      .expect(400);
    expect(fixture.transport.recoveryCalls).toBe(0);
    const unavailable = (
      await request(fixture.app.getHttpServer()).post(`${endpoint}/recover`).send(attempt).expect(201)
    ).body;
    expect(unavailable).toMatchObject({
      state: 'delivery_failed',
      progressStep: 'Recovery requires attention',
      runtimeRecoveryAvailable: true,
    });
    fixture.transport.failRecovery = false;
    const recovered = (await request(fixture.app.getHttpServer()).post(`${endpoint}/recover`).send(attempt).expect(201))
      .body;
    expect(recovered).toMatchObject({
      state: 'delivery_failed',
      progressStep: 'Runtime installation cleaned up',
      runtimeArtifactDigest: fixture.second.digest,
    });
    await deployFixtureRelease(fixture.first);
    fixture.transport.failDelivery = false;
    const delivered = (await request(fixture.app.getHttpServer()).post(`${endpoint}/deliver`).send(attempt).expect(201))
      .body;
    expect(delivered).toMatchObject({
      state: 'awaiting_discovery',
      progressPercent: 100,
      runtimeArtifactDigest: fixture.first.digest,
    });
    expect(fixture.transport.copies).toEqual([
      fixture.second.bundle.toString('base64'),
      fixture.first.bundle.toString('base64'),
    ]);
    await fixture.discover();
    const verification = (await request(fixture.app.getHttpServer()).get(`${endpoint}/verification`).expect(200)).body;
    expect(verification).toMatchObject({ controllerId: 91058, physicalQualification: 'required', ready: false });
    const management = (
      await request(fixture.app.getHttpServer())
        .post(`${endpoint}/management/inspect`)
        .send({ temporarySsh: credential })
        .expect(201)
    ).body;
    expect(management).toMatchObject({ hardened: false, inspection: { firmware: '31', ssh: 'openssh' } });
    expect(fixture.transport.managementCalls).toBe(1);
    expect(fixture.processesSeen).toEqual(['ssh-keyscan', 'ssh-keygen']);
    expect(await readdir(join(await fixture.catalog.root(), 'snapshots'))).toEqual([]);
  });
  it('persists interrupted management recovery and requires fresh explicit recovery through the API', async () => {
    const session = await create();
    const endpoint = `/api/wago/commissioning/sessions/${session.id}`;
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/confirm-host-key`)
      .send({ hostKeyFingerprint: fixture.fingerprint })
      .expect(201);
    fixture.transport.failDelivery = false;
    await request(fixture.app.getHttpServer()).post(`${endpoint}/deliver`).send(attempt).expect(201);
    await fixture.discover();
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/management/inspect`)
      .send({ temporarySsh: credential })
      .expect(201);
    const reviewed = (
      await request(fixture.app.getHttpServer())
        .post(`${endpoint}/management/review`)
        .send({
          mode: 'key_only',
          exceptions: ['wbm_exposed', 'other_services_exposed', 'unqualified_privileges'],
        })
        .expect(201)
    ).body;
    expect(reviewed).toMatchObject({ state: 'reviewed', support: 'supported', hardened: false });
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/management/apply`)
      .send({ reviewToken: reviewed.reviewToken, temporarySsh: credential })
      .expect(409);
    expect(fixture.transport.managementMutations).toBe(0);
    const failed = (
      await request(fixture.app.getHttpServer())
        .post(`${endpoint}/management/apply`)
        .send({ reviewToken: reviewed.reviewToken, confirm: true, temporarySsh: credential })
        .expect(201)
    ).body;
    expect(failed).toMatchObject({ state: 'recovery_required', failure: 'rollback_failed', hardened: false });
    expect(fixture.transport.managementMutations).toBe(2);
    // Reload the service from durable fixture rows; bootstrap performs no remote recovery.
    await fixture.service.onApplicationBootstrap();
    expect(fixture.transport.managementMutations).toBe(2);
    expect((await request(fixture.app.getHttpServer()).get(`${endpoint}/management`).expect(200)).body).toEqual(failed);
    await request(fixture.app.getHttpServer())
      .post(`${endpoint}/management/recover`)
      .send({ confirm: true })
      .expect(409);
    expect(fixture.transport.managementMutations).toBe(2);
    fixture.transport.failManagementRecovery = false;
    const recovered = (
      await request(fixture.app.getHttpServer())
        .post(`${endpoint}/management/recover`)
        .send({ confirm: true, temporarySsh: credential })
        .expect(201)
    ).body;
    expect(recovered).toMatchObject({ state: 'recovered', hardened: false, keyFingerprint: null });
    expect(fixture.transport.managementMutations).toBe(3);
    expect(JSON.stringify([reviewed, failed, recovered])).not.toMatch(
      /fixture-password|PRIVATE KEY|encryptedPrivateKey/,
    );
    expect((await request(fixture.app.getHttpServer()).get(`${endpoint}/verification`).expect(200)).body).toMatchObject(
      { ready: false, physicalQualification: 'required' },
    );
  });
});
