import { NetworkIpSource } from '@attraccess/application-models';
import { NetworkRestrictionConfigService } from '../network-restriction/network-restriction-config.service';
import { McpTestApp, startMcpTestApp } from '../test-utils/mcp-app.test-fixture';

const PUBLIC_URL = 'https://attraccess.example.org';

interface ToolResult {
  isError?: boolean;
  content: Array<{ text: string }>;
}
const resultOf = (body: { result: ToolResult }) => body.result;

/** An MCP tool call is judged by the origin of the outer MCP request, never by the private socket it runs through. */
describe('network restriction for MCP tool calls (real application)', () => {
  let t: McpTestApp;
  let token: string;
  let config: NetworkRestrictionConfigService;

  const status = async (headers: Record<string, string> = {}) => {
    const response = await t.rpc(token, 'tools/call', { name: 'getNetworkRestrictionStatus' }, headers);
    expect([response.status, response.body.error]).toEqual([200, undefined]);
    const result = resultOf(response.body);
    expect(result.isError).toBeUndefined();
    return JSON.parse(result.content[0].text) as {
      enabled: boolean;
      insideAllowedNetwork: boolean;
      allowedFromHere: string[];
    };
  };
  const lockDoor = async (headers: Record<string, string> = {}) =>
    resultOf((await t.rpc(token, 'tools/call', { name: 'lockDoor', arguments: { resourceId: 987654 } }, headers)).body);

  beforeAll(async () => {
    t = await startMcpTestApp(PUBLIC_URL);
    // resources.update lets the caller see every machine (ATT-843), so the call reaches the network check, which is
    // what these tests are about; a machine the caller may not see answers 404 first.
    const permissions = ['users.api-tokens.manage', 'users.roles.manage', 'resources.update'];
    const user = await t.createUser(permissions);
    token = await t.createApiToken(user.id, permissions);
    config = t.app.get(NetworkRestrictionConfigService);
  }, 240_000);

  afterAll(async () => {
    await t?.close();
  });

  it('does not restrict anything while the restriction is off', async () => {
    expect(await status()).toMatchObject({ enabled: false, insideAllowedNetwork: true });
    // The door does not exist: the call got as far as the resource lookup.
    expect((await lockDoor({ 'X-Real-Ip': '203.0.113.9' })).content[0].text).toMatch(/^HTTP 404/);
  });

  it('keeps the settings to administrators and reveals no configuration in the status', async () => {
    expect(Object.keys(await status()).sort()).toEqual(['allowedFromHere', 'enabled', 'insideAllowedNetwork']);
    // The caller has no system.settings.manage, so these tools are not even offered.
    for (const name of ['getNetworkRestrictionSettings', 'getNetworkRestrictionRoleActions']) {
      const { error } = (await t.rpc(token, 'tools/call', { name })).body;
      expect(error).toMatchObject({ code: -32602, message: expect.stringContaining(`Unknown tool: ${name}`) });
    }
  });

  describe('header mode', () => {
    beforeAll(() => config.update({ enabled: true, allowedRanges: ['10.0.0.0/8'], ipSource: NetworkIpSource.Header }));

    it('uses the header of the outer MCP request', async () => {
      expect(await status({ 'X-Real-Ip': '10.20.30.40' })).toMatchObject({ enabled: true, insideAllowedNetwork: true });
      expect(await status({ 'X-Real-Ip': '203.0.113.9' })).toMatchObject({ insideAllowedNetwork: false });
    });

    it('counts a call without the header as outside, although it runs on the local socket', async () => {
      expect(await status()).toMatchObject({ insideAllowedNetwork: false, allowedFromHere: [] });
    });

    it('takes the last entry of a header list', async () => {
      expect(await status({ 'X-Real-Ip': '10.1.1.1, 203.0.113.9' })).toMatchObject({ insideAllowedNetwork: false });
      expect(await status({ 'X-Real-Ip': '203.0.113.9, 10.1.1.1' })).toMatchObject({ insideAllowedNetwork: true });
    });

    it('refuses a restricted action from outside before it reaches the resource, and allows it inside', async () => {
      const outside = await lockDoor({ 'X-Real-Ip': '203.0.113.9' });
      expect(outside.isError).toBe(true);
      expect(outside.content[0].text).toMatch(/^HTTP 403 Forbidden: /);
      expect(outside.content[0].text).toContain('NETWORK_RESTRICTED');
      expect((await lockDoor({ 'X-Real-Ip': '10.1.1.1' })).content[0].text).toMatch(/^HTTP 404/);
    });
  });

  describe('client mode', () => {
    it('uses the client address of the outer request', async () => {
      // The test client connects from the loopback address.
      await config.update({
        enabled: true,
        allowedRanges: ['127.0.0.0/8', '::1/128'],
        ipSource: NetworkIpSource.Client,
      });
      expect(await status({ 'X-Real-Ip': '203.0.113.9' })).toMatchObject({ insideAllowedNetwork: true });
      await config.update({ allowedRanges: ['10.0.0.0/8'] });
      expect(await status({ 'X-Real-Ip': '10.1.1.1' })).toMatchObject({ insideAllowedNetwork: false });
      expect((await lockDoor()).content[0].text).toContain('NETWORK_RESTRICTED');
    });
  });
});
