import { humanize } from '../audit-log-model';
import en from '../en.json';
import { TFunction } from '@attraccess/plugins-frontend-ui';

export function auditLabel(section: 'events' | 'targets' | 'fields' | 'settingNames', value: string, t: TFunction) {
  return Object.hasOwn(en[section], value) ? t(`${section}[${JSON.stringify(value)}]`) : humanize(value);
}
