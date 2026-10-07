import './styles.css';

export // The context shape the host documents for both MQTT slots.
interface MqttServerSlotContext {
  mqttServerId: number;
  [key: string]: unknown;
}
