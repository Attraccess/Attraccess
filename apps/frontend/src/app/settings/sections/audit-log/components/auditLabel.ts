import { humanize } from '../audit-log-model';
import en from '../en.json';
import { Translate } from './Translate';

export function auditLabel(section: 'events' | 'targets' | 'fields' | 'settingNames', value: string, t: Translate) {
  return Object.hasOwn(en[section], value) ? t(`${section}[${JSON.stringify(value)}]`) : humanize(value);
}
