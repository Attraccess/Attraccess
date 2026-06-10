export class MqttServerDeletedEvent {
  constructor(public readonly serverId: number) {}

  static EVENT_NAME = 'mqtt.server.deleted';
}
