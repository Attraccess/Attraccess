export interface MqttServer {
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
