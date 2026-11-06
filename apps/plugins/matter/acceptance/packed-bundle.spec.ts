import request from 'supertest';
import { ADMIN, bootHost, type Host } from './host';

// Needs `build-backend` first (the e2e target depends on it). Regression for the packed plugin: with no
// design:paramtypes in the bundle, constructor parameters without @Inject resolve to undefined and the routes 500.
describe('Matter plugin packed bundle in the host', () => {
  let host: Host;
  beforeAll(async () => {
    host = await bootHost({ source: 'bundle' });
  }, 60_000);
  afterAll(async () => host.close());

  it('has no decorator metadata, so the test below really exercises explicit injection', () => {
    expect(
      require('node:fs').readFileSync(require('node:path').join(__dirname, '../package/dist/index.js'), 'utf8'),
    ).not.toContain('design:paramtypes');
  });

  it('serves the settings and status routes to an admin', async () => {
    const api = request(host.app.getHttpServer());
    const status = await api.get('/api/matter/connection/status').set(ADMIN).expect(200);
    expect(status.body).toMatchObject({ state: 'not_configured', wireVersion: 1 });
    const settings = await api.get('/api/matter/connection').set(ADMIN).expect(200);
    expect(settings.body).toMatchObject({ credentialConfigured: false });
    expect(host.logs.filter((line) => line.startsWith('error'))).toEqual([]);
  });

  it('still refuses non-admins', async () => {
    await request(host.app.getHttpServer())
      .get('/api/matter/connection/status')
      .set({ 'x-test-permissions': 'resources.update' })
      .expect(403);
  });
});
