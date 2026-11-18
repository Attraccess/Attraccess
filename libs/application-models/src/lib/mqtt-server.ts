/** A configured MQTT broker connection. The password is stored encrypted; consumers decrypt it themselves. */
export interface MqttServerRecord {
  id: number;
  name: string;
  host: string;
  port: number;
  managementPort: number | null;
  username: string | null;
  password: string | null;
  clientId: string | null;
  useTls: boolean;
  caCert: string | null;
  tlsInsecure: boolean;
  tlsServername: string | null;
  defaultPublishQos: number;
  defaultPublishRetain: boolean;
  defaultSubscribeQos: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The settings a new server is created with; omitted fields get the stored defaults. */
export interface NewMqttServer {
  name: string;
  host: string;
  port: number;
  managementPort?: number | null;
  username?: string | null;
  password?: string | null;
  clientId?: string | null;
  useTls?: boolean;
  caCert?: string | null;
  tlsInsecure?: boolean;
  tlsServername?: string | null;
  defaultPublishQos?: number;
  defaultPublishRetain?: boolean;
  defaultSubscribeQos?: number;
}

/** Fields of a server that may be changed; undefined fields stay as they are. */
export type MqttServerChanges = Partial<NewMqttServer>;
