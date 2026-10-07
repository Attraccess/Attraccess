


export class MqttSubscriptionError extends Error {
  constructor(readonly mqttError: unknown) {
    super(String(mqttError));
  }
}
