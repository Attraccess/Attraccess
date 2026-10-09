import * as mqtt from 'mqtt';
// Interface to access private members for testing
export interface MqttClientServicePrivate {
  getOrCreateClient: (serverId: number, keepTryingToConnect?: boolean) => Promise<mqtt.MqttClient>;
  clients: Map<number, mqtt.MqttClient>;
  subscriptions: Map<number, Map<string, { qosCounts: Map<0 | 1 | 2 | undefined, number>; effectiveQos?: 0 | 1 | 2 }>>;
}
