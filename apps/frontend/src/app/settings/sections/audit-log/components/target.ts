import { AuditEntryDto } from '@attraccess/react-query-client';
import { auditLabel } from './auditLabel';
import { Translate } from './Translate';

export function target(entry: AuditEntryDto, t: Translate) {
  if (entry.subjectType === 'setting' && typeof entry.details.settingKey === 'string')
    return auditLabel('settingNames', entry.details.settingKey, t);
  return (
    (entry.subjectLabel &&
      `${entry.subjectLabel}${entry.subjectLabelSource === 'current' ? ` (${t('currentNameShort')})` : ''}`) ||
    (entry.subjectId === null ? t('noTarget') : `${auditLabel('targets', entry.subjectType, t)} #${entry.subjectId}`)
  );
}
