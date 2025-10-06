export class MqttMessageEvent {
  constructor(
    public readonly serverId: number,
    public readonly topic: string,
    public readonly payload: unknown,
  ) {}

  static EVENT_NAME = 'mqtt.message.received';
}
