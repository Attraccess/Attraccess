export class MqttMessageEvent {
  constructor(
    public readonly serverId: number,
    public readonly topic: string,
    public readonly payload: unknown,
    public readonly payloadBuffer: Buffer = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  ) {}

  static EVENT_NAME = 'mqtt.message.received';
}
