import { ServiceUnavailableException } from '@nestjs/common';

export class MqttConnectionError extends ServiceUnavailableException {
  public readonly name = 'MqttConnectionError';
  constructor(message: string) {
    super(message);
  }
}
