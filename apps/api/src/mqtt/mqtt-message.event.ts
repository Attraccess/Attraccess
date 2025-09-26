export class MqttMessageEvent {
  constructor(
    public readonly topic: string,
    public readonly payload: string,
  ) {}

  static EVENT_NAME = 'mqtt.message.received';
}
