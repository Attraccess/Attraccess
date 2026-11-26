export class MqttMessageEvent {
  constructor(
    public readonly serverId: number,
    public readonly topic: string,
    public readonly payload: unknown,
    public readonly payloadBuffer: Buffer = Buffer.from(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ),
    /** True when the broker replayed a stored (retained) message because of a new subscription. */
    public readonly retained = false,
  ) {}

  static EVENT_NAME = 'mqtt.message.received';
}
