import type { MqttServerChanges, MqttServerRecord, NewMqttServer } from '@attraccess/application-models';

export interface MqttServerStore {
  listServers(): Promise<MqttServerRecord[]>;
  findServer(id: number): Promise<MqttServerRecord | null>;
  /** The ids among `ids` that exist, in one query. */
  findExistingServerIds(ids: readonly number[]): Promise<Set<number>>;
  createServer(input: NewMqttServer): Promise<MqttServerRecord>;
  /** Applies the given changes (undefined fields stay) and returns the stored server, or null when it is gone. */
  updateServer(id: number, changes: MqttServerChanges): Promise<MqttServerRecord | null>;
  deleteServer(id: number): Promise<void>;
  /** Stores a password that was found in plaintext in its encrypted form. */
  storeEncryptedPassword(id: number, encryptedPassword: string): Promise<void>;
}

export const MQTT_SERVER_STORE = Symbol.for('attraccess.mqtt.server-store');
