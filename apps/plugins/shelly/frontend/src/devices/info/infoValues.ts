import type { TFunction } from '@attraccess/plugins-frontend-ui';

export function formatInfoValue(value: unknown, t: TFunction, language: string, suffix = ''): string {
  if (value === undefined || value === null || value === '') return t('info.notReported');
  if (typeof value === 'boolean') return t(value ? 'info.on' : 'info.off');
  if (typeof value === 'number') return `${value.toLocaleString(language, { maximumFractionDigits: 1 })}${suffix}`;
  return String(value);
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

export function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function formatUptime(seconds: unknown, t: TFunction, language: string): string {
  if (typeof seconds !== 'number') return formatInfoValue(seconds, t, language);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
