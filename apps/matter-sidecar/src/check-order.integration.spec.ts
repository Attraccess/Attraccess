import { http, startSidecar, upgradeStatus, validHeaders, type Running } from './testing/harness';

// The draining case cannot be observed over a real socket (a draining sidecar stops accepting at once); it is covered
// by check-order.spec.ts. The client cap can, so it is checked end to end here as well.
describe('check order over real connections', () => {
  let running: Running;
  beforeAll(async () => {
    running = await startSidecar({ maxClients: 0 });
  });
  afterAll(() => running.stop());

  const anonymous = () => validHeaders({ authorization: undefined });

  it('answers 401 before the WebSocket client cap', async () => {
    const refused = await upgradeStatus(running.port, anonymous());
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe('unauthorized');
    const wrong = await upgradeStatus(running.port, validHeaders({ authorization: `Bearer ${'x'.repeat(40)}` }));
    expect(wrong.status).toBe(401);
    const full = await upgradeStatus(running.port, validHeaders());
    expect(full.status).toBe(503);
    expect(full.body.error.code).toBe('sidecar_unavailable');
  });

  it('does not apply the client cap to REST', async () => {
    expect((await http(running.port, 'GET', '/v1/capabilities', { headers: anonymous() })).status).toBe(401);
    expect((await http(running.port, 'GET', '/v1/capabilities', { headers: validHeaders() })).status).toBe(200);
  });
});
