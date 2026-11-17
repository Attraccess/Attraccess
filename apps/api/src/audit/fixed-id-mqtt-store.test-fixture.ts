import type { MqttServerRecord, NewMqttServer } from '@attraccess/application-models';
import { FakeMqttServerStore } from '../mqtt/fake-mqtt-server.store';

/** A fake MQTT server store that stores every created server under id 7, so audit rows of repeated calls compare equal. */
export class FixedIdMqttServerStore extends FakeMqttServerStore {
  override async createServer(input: NewMqttServer): Promise<MqttServerRecord> {
    Object.assign(this, { nextId: 7 });
    return super.createServer(input);
  }
}
