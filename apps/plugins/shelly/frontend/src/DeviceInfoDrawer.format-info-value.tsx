import { TFunction } from '@attraccess/plugins-frontend-ui';

export function formatInfoValue(value: unknown, t: TFunction, language: string, suffix = ''): string {
  if (value === undefined || value === null || value === '') return t('info.notReported');
  if (typeof value === 'boolean') return t(value ? 'info.on' : 'info.off');
  if (typeof value === 'number') return `${value.toLocaleString(language, { maximumFractionDigits: 1 })}${suffix}`;
  return String(value);
}
