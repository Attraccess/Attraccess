import type { MqttServerConnectionConfig, PluginContext } from '@attraccess/plugins-backend-sdk';
import { HttpException, HttpStatus } from '@nestjs/common';

// Resolves the MQTT server's connection config (ACCESS_MQTT_SERVERS gates the
// call; the core decrypts the credentials) or answers 404 for an unknown server.
export async function requireMqttServerConfig(
  context: Pick<PluginContext, 'getMqttServerConfig'>,
  mqttServerId: number,
): Promise<MqttServerConnectionConfig> {
  const config = await context.getMqttServerConfig(mqttServerId);
  if (!config) {
    throw new HttpException('MQTT server not found.', HttpStatus.NOT_FOUND);
  }
  return config;
}

// Tolerant readers for management API JSON: older RabbitMQ versions omit fields
// or send other types, and none of that may crash a page.
export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(rec) : [];
}
