// Local extension until the generated MQTT client includes the backend field.
export type MqttManagementPort = { managementPort?: number | null };

export function parseManagementPort(value: string): number | null | undefined {
  if (value === '') return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}
