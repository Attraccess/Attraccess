import { discoveryTopic, heartbeatTopic } from './protocol';

type Credentials = { password: string; publish: string[]; subscribe: string[] };

class InMemoryMqttBroker {
  private readonly credentials = new Map<string, Credentials>();
  private readonly listeners = new Map<string, Array<(payload: string) => void>>();

  allow(username: string, credentials: Credentials): void {
    this.credentials.set(username, credentials);
  }

  connect(username: string, password: string): WagoProtocolEmulator {
    const credentials = this.credentials.get(username);
    if (!credentials || credentials.password !== password) throw new Error('MQTT credentials rejected');
    return new WagoProtocolEmulator(this, credentials);
  }

  publish(credentials: Credentials, topic: string, payload: string): void {
    if (!credentials.publish.some((allowed) => topicMatches(allowed, topic)))
      throw new Error(`publish denied: ${topic}`);
    this.listeners.get(topic)?.forEach((listener) => listener(payload));
  }

  subscribe(credentials: Credentials, topic: string, listener: (payload: string) => void): void {
    if (!credentials.subscribe.some((allowed) => topicMatches(allowed, topic)))
      throw new Error(`subscribe denied: ${topic}`);
    this.listeners.set(topic, [...(this.listeners.get(topic) ?? []), listener]);
  }
}

class WagoProtocolEmulator {
  constructor(
    private readonly broker: InMemoryMqttBroker,
    private readonly credentials: Credentials,
  ) {}

  announce(hardwareId: string, pairingCode: string): void {
    this.broker.publish(
      this.credentials,
      discoveryTopic(hardwareId),
      JSON.stringify({
        hardwareId,
        pairingCode,
        protocolVersion: '1.0.0',
        runtimeVersion: '1.0.0',
        capabilities: ['claim', 'heartbeat'],
      }),
    );
  }

  receiveClaim(hardwareId: string, receive: (credentials: { username: string; password: string }) => void): void {
    this.broker.subscribe(this.credentials, `${discoveryTopic(hardwareId)}/claim`, (payload) =>
      receive(JSON.parse(payload)),
    );
  }

  heartbeat(hardwareId: string, sequence: number): void {
    this.broker.publish(
      this.credentials,
      heartbeatTopic(hardwareId),
      JSON.stringify({
        hardwareId,
        pairingCode: '482931',
        protocolVersion: '1.0.0',
        runtimeVersion: '1.0.0',
        capabilities: ['claim', 'heartbeat'],
        sequence,
      }),
    );
  }
}

describe('WAGO protocol emulator', () => {
  it('covers discovery, claim, reconnect, heartbeat, rejected credentials, and controller isolation', () => {
    const broker = new InMemoryMqttBroker();
    const firstDiscovery = {
      password: 'enroll-1',
      publish: [discoveryTopic('cc100-01')],
      subscribe: [`${discoveryTopic('cc100-01')}/claim`],
    };
    const secondDiscovery = {
      password: 'enroll-2',
      publish: [discoveryTopic('cc100-02')],
      subscribe: [`${discoveryTopic('cc100-02')}/claim`],
    };
    broker.allow('enrollment-1', firstDiscovery);
    broker.allow('enrollment-2', secondDiscovery);
    const first = broker.connect('enrollment-1', 'enroll-1');
    const second = broker.connect('enrollment-2', 'enroll-2');
    const discoveries: string[] = [];
    const server = {
      password: 'server',
      publish: [`${discoveryTopic('cc100-01')}/claim`],
      subscribe: [discoveryTopic('cc100-01'), discoveryTopic('cc100-02'), heartbeatTopic('cc100-01')],
    };
    broker.allow('server', server);
    broker.connect('server', 'server');
    broker.subscribe(server, discoveryTopic('cc100-01'), () => discoveries.push('cc100-01'));
    broker.subscribe(server, discoveryTopic('cc100-02'), () => discoveries.push('cc100-02'));

    first.announce('cc100-01', '482931');
    second.announce('cc100-02', '482932');
    expect(discoveries).toEqual(['cc100-01', 'cc100-02']);
    expect(() => broker.connect('enrollment-1', 'wrong')).toThrow('MQTT credentials rejected');
    expect(() => first.announce('cc100-02', '482932')).toThrow('publish denied');

    let permanentCredentials: { username: string; password: string } | undefined;
    first.receiveClaim('cc100-01', (credentials) => {
      permanentCredentials = credentials;
    });
    broker.allow('controller-1', { password: 'permanent-1', publish: [heartbeatTopic('cc100-01')], subscribe: [] });
    broker.publish(
      server,
      `${discoveryTopic('cc100-01')}/claim`,
      JSON.stringify({ username: 'controller-1', password: 'permanent-1' }),
    );
    expect(permanentCredentials).toEqual({ username: 'controller-1', password: 'permanent-1' });
    if (!permanentCredentials) throw new Error('permanent credentials were not received');

    const reconnected = broker.connect(permanentCredentials.username, permanentCredentials.password);
    const sequences: number[] = [];
    broker.subscribe(server, heartbeatTopic('cc100-01'), (payload) => sequences.push(JSON.parse(payload).sequence));
    reconnected.heartbeat('cc100-01', 1);
    expect(sequences).toEqual([1]);
    expect(() => reconnected.heartbeat('cc100-02', 1)).toThrow('publish denied');
  });
});

function topicMatches(allowed: string, topic: string): boolean {
  return allowed === topic || (allowed.endsWith('/#') && topic.startsWith(allowed.slice(0, -1)));
}
