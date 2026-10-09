export const mqttUrl = required('WAGO_MQTT_URL');

export const prefix = process.env.WAGO_MQTT_PREFIX ?? 'attraccess/wago';
export const capabilities = parseCapabilities(process.env.WAGO_CAPABILITIES);
export const heartbeatInterval = interval('WAGO_HEARTBEAT_INTERVAL_MS', 30_000);
export const measurementInterval = interval('WAGO_MEASUREMENT_INTERVAL_MS', 5_000);

export function credentials(prefix: string): { clientId: string; username: string; password: string } {
  const username = required(`${prefix}_USERNAME`);
  return { clientId: username, username, password: required(`${prefix}_PASSWORD`) };
}

export function parseValues(value: string | undefined): Record<string, boolean | number> {
  if (!value) return {};
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.values(parsed).some(
      (item) => typeof item !== 'boolean' && (typeof item !== 'number' || !Number.isFinite(item)),
    )
  )
    throw new Error('WAGO_INITIAL_VALUES must be a JSON object with boolean or numeric values');
  return parsed as Record<string, boolean | number>;
}

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function normalizeOperationalPrefix(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.split('/').some((segment) => !segment || /[+#]/.test(segment)))
    throw new Error('claim namespace must contain non-empty segments without wildcards');
  return normalized;
}

export function interval(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
    throw new Error(`${name} must be a positive timer interval`);
  return value;
}

export function parseCapabilities(value: string | undefined): string[] {
  if (!value)
    return ['claim', 'heartbeat', 'configuration-v1', 'commands', 'state', 'measurement', 'fault', 'acknowledgement'];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim()))
    throw new Error('WAGO_CAPABILITIES must be a JSON array of non-empty strings');
  return parsed;
}
