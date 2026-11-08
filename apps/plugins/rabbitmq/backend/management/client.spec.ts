import { HttpException } from '@nestjs/common';
import { RabbitmqManagementClient } from './client';
import { managementRequest } from './transport';

jest.mock('./transport', () => ({
  ...jest.requireActual('./transport'),
  managementRequest: jest.fn(),
}));

describe('RabbitmqManagementClient error mapping', () => {
  const client = new RabbitmqManagementClient();
  const config = { id: 1, host: 'localhost', port: 1883, useTls: false, username: 'u', password: 'p' } as never;
  const respond = (status: number, body: unknown) =>
    (managementRequest as jest.Mock).mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const failure = async () => (await client.request(config, 'GET', '/users').catch((error) => error)) as HttpException;

  it('reports a wrong password (401 Not_Authorized) as rejected credentials', async () => {
    respond(401, { error: 'not_authorized', reason: 'Not_Authorized' });
    expect((await failure()).message).toContain('rejected the configured MQTT server credentials');
  });

  it.each(['Not administrator user', 'Not management user', 'User not authorised to access object'])(
    'reports a missing tag ("%s", HTTP 401) as missing privileges',
    async (reason) => {
      respond(401, { error: 'not_authorised', reason });
      const error = await failure();
      expect(error.message).toContain('lacks management privileges');
      expect(error.message).toContain('"administrator"');
      expect(error.getStatus()).toBe(502);
    },
  );

  it('reports HTTP 403 as missing privileges', async () => {
    respond(403, {});
    expect((await failure()).message).toContain('lacks management privileges');
  });
});
