import { DataSource, QueryRunner } from 'typeorm';
import { IotToFlow1752005121356 } from './1752005121356-iot-to-flow';

describe('legacy IoT to flow migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const migration = new IotToFlow1752005121356();
  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    await runner.query(
      'CREATE TABLE mqtt_resource_config (resourceId INTEGER, serverId INTEGER, inUseTopic TEXT, inUseMessage TEXT, notInUseTopic TEXT, notInUseMessage TEXT, takeoverTopic TEXT, takeoverMessage TEXT, onTakeoverSendTakeover BOOLEAN, onTakeoverSendStart BOOLEAN, onTakeoverSendStop BOOLEAN)',
    );
    await runner.query(
      'CREATE TABLE webhook_config (id INTEGER, resourceId INTEGER, active BOOLEAN, url TEXT, method TEXT, headers TEXT, inUseTemplate TEXT, notInUseTemplate TEXT, takeoverTemplate TEXT, onTakeoverSendTakeover BOOLEAN, onTakeoverSendStart BOOLEAN, onTakeoverSendStop BOOLEAN)',
    );
    await runner.query(
      'CREATE TABLE resource_flow_node (id TEXT PRIMARY KEY, type TEXT, positionX INTEGER, positionY INTEGER, data TEXT, resourceId INTEGER, createdAt TEXT, updatedAt TEXT)',
    );
    await runner.query(
      'CREATE TABLE resource_flow_edge (id TEXT PRIMARY KEY, source TEXT, target TEXT, resourceId INTEGER, createdAt TEXT, updatedAt TEXT)',
    );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await runner.release();
    await source.destroy();
  });
  it('preserves MQTT and webhook takeover behavior, reuses triggers and translates payload/header variables', async () => {
    await runner.query(
      `INSERT INTO mqtt_resource_config VALUES (1, 9, 'device/{{id}}', '{{user.username}}', 'device/{{id}}', '{{timestamp}}', 'takeover', '{{previousUser.id}}', 1, 1, 1)`,
    );
    await runner.query(
      `INSERT INTO webhook_config VALUES (1, 1, 1, 'https://example.test/{{id}}', 'POST', ?, '{{name}}', '{{user.id}}', '{{previousUser.username}}', 1, 1, 1)`,
      [JSON.stringify({ 'X-User': '{{user.externalIdentifier}}' })],
    );
    await migration.up(runner);
    const nodes = await runner.query('SELECT * FROM resource_flow_node');
    expect(nodes).toHaveLength(9);
    expect(nodes.filter((node) => node.type.startsWith('event.'))).toHaveLength(3);
    const mqtt = nodes.filter((node) => node.type === 'action.mqtt.sendMessage').map((node) => JSON.parse(node.data));
    expect(mqtt).toEqual(
      expect.arrayContaining([
        { serverId: 9, topic: 'device/{{input.resource.id}}', payload: '{{input.user.username}}' },
        { serverId: 9, topic: 'takeover', payload: '{{input.previousUser.id}}' },
      ]),
    );
    const http = nodes.filter((node) => node.type === 'action.http.sendRequest').map((node) => JSON.parse(node.data));
    expect(http).toContainEqual({
      url: 'https://example.test/{{input.resource.id}}',
      method: 'POST',
      headers: { 'X-User': '{{input.user.externalIdentifier}}' },
      body: '{{input.resource.name}}',
    });
    const edges = await runner.query('SELECT * FROM resource_flow_edge');
    expect(edges).toHaveLength(10);
    const ids = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
    await migration.down(runner);
    expect(await runner.query('SELECT * FROM resource_flow_node')).toEqual([]);
    expect(await runner.query('SELECT * FROM resource_flow_edge')).toEqual([]);
    expect(await runner.query('SELECT * FROM mqtt_resource_config')).toHaveLength(1);
  });
  it('creates independent webhook triggers and tolerates invalid headers while skipping inactive webhooks', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runner.query(
      `INSERT INTO webhook_config VALUES (1, 2, 1, 'https://example.test', 'POST', 'invalid', '', '', NULL, 0, 0, 0), (2, 3, 0, 'https://inactive.test', 'POST', NULL, '', '', NULL, 0, 0, 0)`,
    );
    await migration.up(runner);
    const nodes = await runner.query('SELECT * FROM resource_flow_node');
    expect(nodes).toHaveLength(5);
    expect(nodes.every((node) => node.resourceId === 2)).toBe(true);
    expect(
      nodes.filter((node) => node.type === 'action.http.sendRequest').map((node) => JSON.parse(node.data).headers),
    ).toEqual([{}, {}]);
    expect(await runner.query('SELECT * FROM resource_flow_edge')).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid headers JSON'));
  });
  it('omits takeover actions and edges for unconfigured MQTT behavior', async () => {
    await runner.query(`INSERT INTO mqtt_resource_config VALUES (1, 9, 'in', 'on', 'out', 'off', NULL, NULL, 0, 0, 0)`);
    await migration.up(runner);
    expect(await runner.query('SELECT * FROM resource_flow_node')).toHaveLength(5);
    expect(await runner.query('SELECT * FROM resource_flow_edge')).toHaveLength(2);
  });
});
