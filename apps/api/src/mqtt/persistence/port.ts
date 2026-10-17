import type { MqttServer } from '@attraccess/application-models';

export type NewMqttServer = Pick<MqttServer, 'name' | 'host' | 'port'> &
  Partial<Omit<MqttServer, 'id' | 'createdAt' | 'updatedAt'>>;

/** Stored passwords remain encrypted; decryption belongs to the MQTT application service. */
export abstract class MqttPersistence {
  abstract listServers(): Promise<MqttServer[]>;
  abstract readServer(id: number): Promise<MqttServer | null>;
  abstract createServer(input: NewMqttServer): Promise<MqttServer>;
  abstract saveServer(server: MqttServer): Promise<MqttServer>;
  abstract removeServer(server: MqttServer): Promise<void>;
  abstract setEncryptedPassword(id: number, encrypted: string): Promise<void>;
}
