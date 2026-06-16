export class MqttServerConnectionChangedEvent {
  constructor(
    public readonly serverId: number,
    public readonly connected: boolean,
    public readonly error?: string,
  ) {}

  static EVENT_NAME = 'mqtt.server.connection.changed';
}
