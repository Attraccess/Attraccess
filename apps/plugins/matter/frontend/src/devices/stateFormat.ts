import type { TExists, TFunction } from '@attraccess/plugins-frontend-ui';

/**
 * A reported state value as a human reads it: a translated label where one is known for the key (on/off, locked,
 * open/closed), else the number or text itself; structured values as compact JSON.
 */
export function formatStateValue(t: TFunction, tExists: TExists, key: string, value: unknown): string {
  if (value === null || value === undefined) return t('devices.state.noValue');
  const labelKey = `devices.state.values.${key}.${String(value)}`;
  if (tExists(labelKey)) return t(labelKey);
  if (typeof value === 'boolean') return t(value ? 'devices.state.yes' : 'devices.state.no');
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return JSON.stringify(value);
}

/** The label of a state key (`onOff.onOff` → "Power"); an unknown key shows itself. */
export function stateLabel(t: TFunction, tExists: TExists, key: string): string {
  return tExists(`devices.state.keys.${key}`) ? t(`devices.state.keys.${key}`) : key;
}
