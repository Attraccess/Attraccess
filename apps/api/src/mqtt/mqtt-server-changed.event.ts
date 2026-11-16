/** A server's connection settings changed, it was deleted, or its connection was refreshed. */
export class MqttServerChangedEvent {
  constructor(public readonly serverId: number) {}

  static EVENT_NAME = 'mqtt.server.changed';
}
