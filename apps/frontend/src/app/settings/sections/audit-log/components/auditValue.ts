import { displayValue } from '../audit-log-model';
import en from '../en.json';
import { TFunction } from '@attraccess/plugins-frontend-ui';

/** A recorded value, with known enumeration values (such as a meter's allocation) in the viewer's language. */
export function auditValue(field: string, value: unknown, t: TFunction) {
  const name = field.replace(/^(before|after)\./, '');
  const known: Record<string, Record<string, string>> = en.fieldValues;
  return typeof value === 'string' && Object.hasOwn(known, name) && Object.hasOwn(known[name], value)
    ? t(`fieldValues.${name}[${JSON.stringify(value)}]`)
    : displayValue(value);
}
