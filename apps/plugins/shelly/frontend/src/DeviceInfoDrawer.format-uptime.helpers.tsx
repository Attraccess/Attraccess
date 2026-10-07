import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { formatInfoValue } from './DeviceInfoDrawer.auth-protected-form.helpers';

export function formatUptime(seconds: unknown, t: TFunction, language: string): string {
  if (typeof seconds !== 'number') return formatInfoValue(seconds, t, language);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (Array.isArray(value)) return value[Number(key)];
    return isRecord(value) ? value[key] : undefined;
  }, source);
}
